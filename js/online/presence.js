// Online-Anwesenheit und Lobby: ein privater Realtime-Kanal "lobby" für alle angemeldeten Spieler mit Zugang.
// Jeder meldet Anzeigename, Avatar und was er gerade tut. Gruppenfahrten leben nur in dieser Anwesenheit (keine Datenbank):
// Wer eine Fahrt anlegt, trägt sie in seine Meldung ein; wer beitritt, trägt deren ID ein. Zum Startzeitpunkt fahren alle los.
import { bus } from '../util.js';
import { profile, sel, saveSel } from '../state.js';
import { online, client, loggedIn, access, realtimeAuth } from './client.js';

export const sid = (() => { try { let s = sessionStorage.getItem('vvSid'); if (!s) { s = crypto.getRandomValues(new Uint32Array(2)).join('-'); sessionStorage.setItem('vvSid', s); } return s; } catch (e) { return String(Math.random()).slice(2); } })();
export const P = { ch: null, me: { where: 'menu' }, peers: new Map(), ready: false };
const COLOR = /^#[0-9a-f]{6}$/i, txt = (s, n) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);

/* ---------- Zufälliger Online-Avatar (je Sitzung stabil) ---------- */
const OPT = {
  bike: ['road', 'road', 'gravel', 'mtb', 'city', 'tt', 'cargo'], head: ['human', 'human', 'human', 'cat', 'fox', 'panda', 'bear', 'penguin', 'frog'],
  pattern: ['plain', 'band', 'stripes', 'hoops', 'split', 'dots', 'chevron'], helmetStyle: ['road', 'aero', 'cap'], glasses: ['none', 'sport', 'round'],
  col: ['#ff6a3d', '#3fa7f5', '#1b1e22', '#f2f4f6', '#ef4458', '#4fd18b', '#f5c542', '#7b4fd6', '#00c2c7', '#ff4fa3', '#0b3d91', '#8a1538', '#d4af37'],
  skin: ['#f6d5bd', '#f1c7a5', '#e3b18c', '#c99272', '#9a6a4b', '#6b4532'], hair: ['#1b1410', '#3a2a1e', '#6b4a2a', '#a8763e', '#d9b46a', '#b23a2a'],
};
export function randomLook(seed = sid) {
  let h = 2166136261; for (const c of String(seed)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const r = () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 4294967296;
  const pick = a => a[Math.floor(r() * a.length)];
  return { jersey: pick(OPT.col), helmet: pick(OPT.col), bikeColor: pick(OPT.col), skin: pick(OPT.skin),
    av: { bike: pick(OPT.bike), head: pick(OPT.head), pattern: pick(OPT.pattern), helmetStyle: pick(OPT.helmetStyle), glasses: pick(OPT.glasses), jersey2: pick(OPT.col), shorts: pick(['#1b1e22', '#1b1e22', '#3b4450', '#0b3d91']), socks: pick(OPT.col), shoes: pick(['#1b1e22', '#f2f4f6', '#3b4450']), hair: pick(OPT.hair), beard: r() < .25, ponytail: r() < .2, bottle: true, bottleColor: pick(OPT.col) } };
}
// Online sieht man standardmäßig einen zufällig zusammengestellten Avatar; auf Wunsch den eigenen
export const onlineLook = () => profile.onlineAvatar === 'own' ? { jersey: profile.jersey, helmet: profile.helmet, bikeColor: profile.bikeColor, skin: profile.skin, av: profile.av } : randomLook();

// Gemeinsame Einstellungen einer Gruppenfahrt (vom Gastgeber), streng geprüft
const TIMES = ['auto', 'morning', 'day', 'evening', 'night'], WEATHERS = ['auto', 'clear', 'cloudy', 'rain', 'fog'];
export function cleanSettings(s = {}) { return { time: TIMES.includes(s.time) ? s.time : 'auto', weather: WEATHERS.includes(s.weather) ? s.weather : 'auto', npcs: s.npcs !== false, traffic: s.traffic === true, powerups: s.powerups !== false }; }
function cleanMeta(m) {
  if (!m || typeof m !== 'object') return null;
  const lob = m.host && typeof m.host === 'object' ? { id: txt(m.host.id, 24), title: txt(m.host.title, 40) || 'Gruppenfahrt', route: txt(m.host.route, 40), routeName: txt(m.host.routeName, 40), startAt: Number(m.host.startAt) || 0, race: !!m.host.race, settings: cleanSettings(m.host.settings) } : null;
  const look = m.look && typeof m.look === 'object' ? m.look : {};
  return { name: txt(m.name, 30) || 'Fahrer', where: m.where === 'ride' ? 'ride' : 'menu', route: txt(m.route, 40), routeName: txt(m.routeName, 40), joined: txt(m.joined, 24), host: lob,
    look: { jersey: COLOR.test(look.jersey) ? look.jersey : '#ff6a3d', helmet: COLOR.test(look.helmet) ? look.helmet : '#f2f4f6', bikeColor: COLOR.test(look.bikeColor) ? look.bikeColor : '#e9eef2', skin: COLOR.test(look.skin) ? look.skin : '#e3b18c', av: { head: txt(look.av?.head, 10), bike: txt(look.av?.bike, 10), glasses: txt(look.av?.glasses, 10), helmetStyle: txt(look.av?.helmetStyle, 10), pattern: txt(look.av?.pattern, 10), jersey2: COLOR.test(look.av?.jersey2) ? look.av.jersey2 : undefined, beard: !!look.av?.beard } } };
}
const sync = () => {
  const st = P.ch?.presenceState?.() || {}; P.peers.clear();
  for (const [key, arr] of Object.entries(st)) { const m = cleanMeta(arr?.[arr.length - 1]); if (m && key !== sid) P.peers.set(key, m); }
  bus.emit('presence'); checkStart();
};
export async function joinPresence() {
  if (P.ch || !loggedIn() || !access().ok) return;
  const sb = await client(); await realtimeAuth();
  P.ch = sb.channel('lobby', { config: { private: true, presence: { key: sid } } });
  P.ch.on('presence', { event: 'sync' }, sync);
  P.ch.subscribe(async st => { if (st === 'SUBSCRIBED') { P.ready = true; await push(); } });
}
export async function leavePresence() { try { await P.ch?.untrack(); P.ch?.unsubscribe(); } catch (e) { } P.ch = null; P.ready = false; P.peers.clear(); bus.emit('presence'); }
async function push() { if (!P.ch || !P.ready) return; await P.ch.track({ name: online.profile?.display_name || 'Fahrer', look: onlineLook(), ...P.me }); }
export function setStatus(patch) { Object.assign(P.me, patch); for (const k in P.me) if (P.me[k] == null) delete P.me[k]; push().catch(() => { }); }

/* ---------- Lobby ---------- */
export const lobbies = () => {
  const all = [...P.peers.entries()].filter(([, m]) => m.host).map(([k, m]) => ({ ...m.host, hostSid: k, hostName: m.name, hostLook: m.look }));
  if (P.me.host) all.unshift({ ...P.me.host, hostSid: sid, hostName: online.profile?.display_name || 'Du', hostLook: onlineLook(), mine: true });
  return all.filter(l => l.startAt > Date.now() - 60e3).map(l => ({ ...l, members: [...(l.mine || P.me.joined === l.id ? [{ name: online.profile?.display_name || 'Du', look: onlineLook(), me: true }] : []), ...[...P.peers.entries()].filter(([k, m]) => m.joined === l.id || (k === l.hostSid && !l.mine)).map(([, m]) => ({ name: m.name, look: m.look }))] }));
};
export function createLobby({ title, route, routeName, minutes, race, settings }) { const id = Math.random().toString(36).slice(2, 10); setStatus({ host: { id, title, route, routeName, startAt: Date.now() + minutes * 60e3, race, settings: cleanSettings(settings) }, joined: id }); return id; }
export function joinLobby(id) { setStatus({ joined: id }); }
export function leaveLobby() { setStatus({ joined: null, host: null }); }
// Startzeit erreicht: alle Teilnehmer fahren auf derselben Strecke los
let started = '';
function checkStart() {
  const id = P.me.joined; if (!id || started === id) return;
  const l = lobbies().find(x => x.id === id); if (!l) return;
  const ms = l.startAt - Date.now();
  if (ms <= 0 && ms > -60e3) { started = id; sel.routeId = l.route; saveSel(); sessionStorage.setItem('groupRide', JSON.stringify({ id, title: l.title, race: l.race, hostSid: l.hostSid, isHost: !!l.mine, settings: cleanSettings(l.settings) })); if (l.race) sessionStorage.setItem('raceNext', '1'); setStatus({ joined: null, host: null }); bus.emit('groupstart', l); location.hash = '#/ride'; }
}
setInterval(checkStart, 1000);
