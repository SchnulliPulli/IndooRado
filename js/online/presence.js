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
// Workout: '' frei, 'plan' = jeder seine nächste Plan-Einheit, sonst Workout-ID; eigene Workouts reisen mit (woSegs)
const cleanSegs = a => Array.isArray(a) && a.length <= 120 ? a.filter(x => +x?.dur >= 1).map(x => ({ dur: Math.min(7200, +x.dur) | 0, a: x?.a == null ? null : Math.min(3, Math.max(0, +x.a || 0)), b: x?.b == null ? null : Math.min(3, Math.max(0, +x.b || 0)), text: x?.text ? txt(x.text, 40) : undefined })).filter(x => x.dur > 0) : null;
export function cleanSettings(s = {}) {
  const wo = s.workout === 'plan' || /^[\w-]{1,40}$/.test(s.workout || '') ? s.workout : '';
  const segs = wo && wo !== 'plan' ? cleanSegs(s.woSegs) : null;
  return { time: TIMES.includes(s.time) ? s.time : 'auto', weather: WEATHERS.includes(s.weather) ? s.weather : 'auto', npcs: s.npcs !== false, traffic: s.traffic === true, powerups: s.powerups !== false, workout: wo, woName: wo ? txt(s.woName, 40) : '', ...(segs?.length ? { woSegs: segs } : {}) };
}
function cleanMeta(m) {
  if (!m || typeof m !== 'object') return null;
  const lob = m.host && typeof m.host === 'object' ? { id: txt(m.host.id, 24), title: txt(m.host.title, 40) || 'Gruppenfahrt', route: txt(m.host.route, 40), routeName: txt(m.host.routeName, 40), startAt: Number(m.host.startAt) || 0, race: !!m.host.race, settings: cleanSettings(m.host.settings) } : null;
  const look = m.look && typeof m.look === 'object' ? m.look : {};
  return { name: txt(m.name, 30) || 'Fahrer', where: m.where === 'ride' ? 'ride' : 'menu', route: txt(m.route, 40), routeName: txt(m.routeName, 40), joined: txt(m.joined, 24), host: lob,
    look: { jersey: COLOR.test(look.jersey) ? look.jersey : '#ff6a3d', helmet: COLOR.test(look.helmet) ? look.helmet : '#f2f4f6', bikeColor: COLOR.test(look.bikeColor) ? look.bikeColor : '#e9eef2', skin: COLOR.test(look.skin) ? look.skin : '#e3b18c', av: { head: txt(look.av?.head, 10), bike: txt(look.av?.bike, 10), glasses: txt(look.av?.glasses, 10), helmetStyle: txt(look.av?.helmetStyle, 10), pattern: txt(look.av?.pattern, 10), jersey2: COLOR.test(look.av?.jersey2) ? look.av.jersey2 : undefined, beard: !!look.av?.beard } } };
}
// Schnellweg: Änderungen (Lobby beitreten, anlegen, losfahren) gehen zusätzlich sofort als Direktnachricht raus.
// Die Anwesenheit des Servers kommt teils mit Verzögerung; bis sie nachzieht, gilt die frischere Direktnachricht (max. 20 s).
const fast = new Map(); // sid -> { m, t }
const sync = () => {
  const st = (P.ch !== 'pending' && P.ch?.presenceState?.()) || {}; P.peers.clear();
  for (const [key, arr] of Object.entries(st)) { const m = cleanMeta(arr?.[arr.length - 1]); if (m && key !== sid) P.peers.set(key, m); }
  for (const [key, f] of fast) { if (Date.now() - f.t > 20e3) fast.delete(key); else if (f.m) P.peers.set(key, f.m); else P.peers.delete(key); }
  bus.emit('presence'); checkStart();
};
function fastSend() { try { if (P.ch && P.ch !== 'pending' && P.ready) P.ch.send({ type: 'broadcast', event: 'meta', payload: { from: sid, meta: myMeta() } }); } catch (e) { } }
export async function joinPresence() {
  if (P.ch || !loggedIn() || !access().ok) return;
  P.ch = 'pending'; // gegen doppelten Aufruf während des Aufräumens
  let sb; try { sb = await client(); await realtimeAuth(); } catch (e) { P.ch = null; throw e; }
  for (const c of sb.getChannels().filter(c => c.topic === 'realtime:lobby')) { try { await sb.removeChannel(c); } catch (e) { } } // alten (schließenden) Kanal erst ganz entfernen
  if (P.ch !== 'pending') return;
  P.ch = sb.channel('lobby', { config: { private: true, presence: { key: sid } } });
  P.ch.on('presence', { event: 'sync' }, sync);
  P.ch.on('broadcast', { event: 'meta' }, ({ payload: x }) => {
    if (!x || typeof x.from !== 'string' || x.from.length > 40 || x.from === sid) return;
    const m = x.meta === null ? null : cleanMeta(x.meta); if (x.meta !== null && !m) return;
    fast.set(x.from, { m, t: Date.now() }); sync();
  });
  // Einladungen anderer Spieler an mich (Lobby oder Mitfahren), streng geprüft
  P.ch.on('broadcast', { event: 'invite' }, ({ payload: m }) => {
    if (!m || m.to !== sid || typeof m.from !== 'string' || m.from.length > 40 || !['lobby', 'ride'].includes(m.kind)) return;
    const inv = { kind: m.kind, from: m.from, name: txt(m.name, 30) || 'Fahrer', lobby: txt(m.lobby, 24), title: txt(m.title, 40), route: txt(m.route, 40), routeName: txt(m.routeName, 40), startAt: Number(m.startAt) || 0 };
    const peer = P.peers.get(m.from); if (!peer) return; // nur von Spielern, die gerade online sind
    bus.emit('invite', { ...inv, look: peer.look });
  });
  const c = P.ch;
  c.subscribe(async st => {
    if (c !== P.ch) return;
    if (st === 'SUBSCRIBED') { P.ready = true; fastSend(); await push(); sync(); }
    else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT' || st === 'CLOSED') { P.ready = false; bus.emit('presence'); }
  });
}
// Alle 15 s: Liste frisch aus dem Kanal lesen (Zähler oben aktuell halten) und eine abgerissene Verbindung neu aufbauen
setInterval(async () => {
  if (!P.ch || P.ch === 'pending') return;
  if (P.ch.state === 'joined') {
    sync();
    // Selbstkontrolle: steht beim Server noch unsere aktuelle Meldung (z. B. Lobby-Beitritt)? Sonst erneut senden
    const mine = P.ch.presenceState?.()[sid]?.at(-1), want = P.me;
    if (P.ready && (!mine || (mine.joined || null) !== (want.joined || null) || (mine.host?.id || null) !== (want.host?.id || null) || mine.where !== want.where)) push().catch(() => { });
    return;
  }
  if (P.ch.state === 'joining' || !loggedIn() || !access().ok) return;
  const old = P.ch; P.ch = null; P.ready = false;
  try { (await client()).removeChannel(old); } catch (e) { }
  joinPresence().catch(() => { });
}, 5000);
// Sofort neu verbinden, wenn der Tab wieder sichtbar wird oder das Internet zurück ist (statt auf den nächsten Durchlauf zu warten)
const revive = async () => {
  if (!P.ch || P.ch === 'pending' || P.ch.state === 'joined' || P.ch.state === 'joining' || !loggedIn() || !access().ok) return;
  const old = P.ch; P.ch = null; P.ready = false;
  try { (await client()).removeChannel(old); } catch (e) { }
  joinPresence().catch(() => { });
};
if (typeof document !== 'undefined') { document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(revive, 300); }); addEventListener('online', () => setTimeout(revive, 1000)); }
export async function leavePresence() { try { if (P.ch && P.ch !== 'pending' && P.ready) P.ch.send({ type: 'broadcast', event: 'meta', payload: { from: sid, meta: null } }); } catch (e) { } const c = P.ch; P.ch = null; if (c && c !== 'pending') { try { await c.untrack(); (await client()).removeChannel(c); } catch (e) { } } P.ready = false; P.peers.clear(); bus.emit('presence'); }
// Eigene Meldung senden; schlägt sie fehl (Zeitüberschreitung, Ratenlimit), bis zu 5-mal mit wachsender Pause wiederholen
let pushTry = 0, pushTimer = null;
const myMeta = () => ({ name: online.profile?.display_name || 'Fahrer', look: onlineLook(), ...P.me });
async function push() {
  if (!P.ch || P.ch === 'pending' || !P.ready) return;
  clearTimeout(pushTimer);
  let r; try { r = await P.ch.track(myMeta()); } catch (e) { r = 'error'; }
  if (r === 'ok') { pushTry = 0; return; }
  if (++pushTry <= 5) pushTimer = setTimeout(() => push().catch(() => { }), 500 * pushTry);
}
export function setStatus(patch) { Object.assign(P.me, patch); for (const k in P.me) if (P.me[k] == null) delete P.me[k]; fastSend(); push().catch(() => { }); bus.emit('presence'); }

/* ---------- Einladungen ---------- */
// Was kann ich gerade anbieten? Eigene bzw. beigetretene Lobby, sonst meine laufende Fahrt
export function inviteOffer() {
  const l = P.me.joined && lobbies().find(x => x.id === P.me.joined);
  if (l) return { kind: 'lobby', lobby: l.id, title: l.title, route: l.route, routeName: l.routeName, startAt: l.startAt };
  if (P.me.where === 'ride' && P.me.route) return { kind: 'ride', route: P.me.route, routeName: P.me.routeName };
  return null;
}
const lastInv = new Map();
export async function invite(toSid) {
  const o = inviteOffer(); if (!o) throw new Error('Leg zuerst eine Gruppenfahrt in der Lobby an oder starte eine Fahrt, dann kannst du einladen.');
  if (!P.ch || P.ch === 'pending' || !P.ready) throw new Error('Keine Verbindung zur Lobby');
  if (Date.now() - (lastInv.get(toSid) || 0) < 20e3) throw new Error('Gerade erst eingeladen, bitte kurz warten');
  lastInv.set(toSid, Date.now());
  const r = await P.ch.send({ type: 'broadcast', event: 'invite', payload: { to: toSid, from: sid, name: online.profile?.display_name || 'Fahrer', ...o } });
  if (r !== 'ok') throw new Error('Einladung konnte nicht gesendet werden');
  return o;
}

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
// Die Lobby bleibt beim Gastgeber nach dem Start noch eine Minute sichtbar, damit alle sie sicher sehen.
// Verschwindet sie trotzdem kurz vor dem Start (Gastgeber hat abweichende Uhr oder Verbindung kurz weg), starten Beigetretene mit dem zuletzt gesehenen Stand.
let started = '', lastSeen = null;
function checkStart() {
  const id = P.me.joined; if (!id || started === id) return;
  const l = lobbies().find(x => x.id === id);
  if (!l) { if (lastSeen?.id === id && lastSeen.startAt - Date.now() < 20e3 && Date.now() - lastSeen.seen < 90e3) { started = id; startGroup(lastSeen); } return; }
  lastSeen = { ...l, seen: Date.now() };
  const ms = l.startAt - Date.now();
  if (ms <= 0 && ms > -60e3) { started = id; startGroup(l); }
}
// Gemeinsamer Start: Strecke und Workout für alle gleich setzen, dann losfahren
async function startGroup(l) {
  const id = l.id, G = cleanSettings(l.settings);
  sel.routeId = l.route;
  if (G.workout === 'plan') { const P = await import('../plans.js'); sel.workoutId = P.nextWorkout()?.id || null; }
  else if (G.woSegs) { const W = await import('../workouts.js'), wid = 'g-' + id; W.EXTRA_W.set(wid, { id: wid, name: G.woName || 'Gruppen-Workout', cat: 'Gruppe', desc: 'Workout der Gruppenfahrt', segs: G.woSegs, builtin: true }); sel.workoutId = wid; }
  else sel.workoutId = G.workout || null;
  saveSel(); sessionStorage.setItem('groupRide', JSON.stringify({ id, title: l.title, race: l.race, hostSid: l.hostSid, isHost: !!l.mine, settings: G })); if (l.race) sessionStorage.setItem('raceNext', '1'); setStatus({ joined: null }); if (l.mine) setTimeout(() => { if (P.me.host?.id === id) setStatus({ host: null }); }, 60e3); bus.emit('groupstart', l); location.hash = '#/ride';
}
setInterval(checkStart, 1000);
