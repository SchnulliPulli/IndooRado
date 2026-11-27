// Fernseher-Modus: große Schrift, Bedienung mit Pfeiltasten (Fernbedienung), Gamepad und Handy als Fernbedienung.
// – Pfeiltasten springen zum nächsten Knopf in diese Richtung (außerhalb der Fahrt), Enter löst aus, Zurück/Esc geht zurück.
// – Gamepad: Steuerkreuz/Stick = Pfeile, A = Enter, B = Zurück, Start = Pause, LB/RB = Gang, X = Kamera, Y = Ride On.
// – Handy: dasselbe Konto auf dem Handy angemeldet → Online › Handy-Ansicht › Fernbedienung (privater Kanal je Konto).
import { profile } from './state.js';
import { bus, toast } from './util.js';

const inRide = () => document.body.dataset.page === 'ride';
const typing = t => t?.closest?.('input,textarea,select,[contenteditable]');
const key = (k, extra = {}) => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra }));

export function applyTv() { document.documentElement.classList.toggle('tv', !!profile.tvMode); }

/* ---------- Räumliche Navigation mit Pfeiltasten ---------- */
const focusables = () => [...document.querySelectorAll('.modal.on button, .modal.on a[href], .modal.on input, .modal.on select, .tour button')].filter(vis).length
  ? [...document.querySelectorAll('.modal.on button, .modal.on a[href], .modal.on input, .modal.on select, .tour button')].filter(vis)
  : [...document.querySelectorAll('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(vis);
const vis = el => !el.disabled && el.offsetParent !== null && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
function move(dir) {
  const all = focusables(); if (!all.length) return;
  const cur = document.activeElement && all.includes(document.activeElement) ? document.activeElement : null;
  if (!cur) { all[0].focus(); return; }
  const a = cur.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
  let best = null, bs = Infinity;
  for (const el of all) {
    if (el === cur) continue; const b = el.getBoundingClientRect(), bx = b.left + b.width / 2, by = b.top + b.height / 2, dx = bx - ax, dy = by - ay;
    const ok = dir === 'ArrowRight' ? dx > 4 : dir === 'ArrowLeft' ? dx < -4 : dir === 'ArrowDown' ? dy > 4 : dy < -4; if (!ok) continue;
    const main = dir === 'ArrowRight' || dir === 'ArrowLeft' ? Math.abs(dx) : Math.abs(dy), side = dir === 'ArrowRight' || dir === 'ArrowLeft' ? Math.abs(dy) : Math.abs(dx);
    const score = main + side * 2.5; if (score < bs) { bs = score; best = el; }
  }
  if (best) { best.focus({ preventScroll: true }); best.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' }); }
}
document.addEventListener('keydown', e => {
  if (!profile.tvMode || e.defaultPrevented || inRide() || typing(e.target)) return;
  if (e.key.startsWith('Arrow')) { e.preventDefault(); move(e.key); }
  else if ((e.key === 'Backspace' || e.key === 'BrowserBack' || e.key === 'GoBack') && !document.querySelector('.modal.on')) { e.preventDefault(); history.back(); }
});

/* ---------- Gamepad ---------- */
let pads = 0, raf = 0; const prev = {}, rep = {};
const MAP_MENU = { 12: 'ArrowUp', 13: 'ArrowDown', 14: 'ArrowLeft', 15: 'ArrowRight', 0: 'Enter', 1: 'Escape', 9: ' ' };
const MAP_RIDE = { 12: 'ArrowUp', 13: 'ArrowDown', 14: 'ArrowLeft', 15: 'ArrowRight', 5: 'ArrowUp', 4: 'ArrowDown', 9: ' ', 2: 'c', 3: 'r', 1: 'Escape', 8: 'k' };
function poll() {
  raf = 0; const gp = [...(navigator.getGamepads?.() || [])].filter(Boolean); if (!gp.length) return;
  const now = performance.now();
  for (const g of gp) {
    const axes = g.axes || [], btn = i => !!g.buttons[i]?.pressed;
    const state = { 12: btn(12) || axes[1] < -.6, 13: btn(13) || axes[1] > .6, 14: btn(14) || axes[0] < -.6, 15: btn(15) || axes[0] > .6 };
    for (const i of [0, 1, 2, 3, 4, 5, 8, 9]) state[i] = btn(i);
    const map = inRide() ? MAP_RIDE : MAP_MENU;
    for (const [i, on] of Object.entries(state)) {
      const id = g.index + ':' + i, was = prev[id]; prev[id] = on; const k = map[i]; if (!k) continue;
      const fire = () => { if (k === 'Enter' && !inRide()) { const a = document.activeElement; if (a && a !== document.body) a.click(); else key('ArrowDown'); } else key(k); };
      if (on && !was) { fire(); rep[id] = now + 450; }
      else if (on && i >= 12 && now > rep[id]) { fire(); rep[id] = now + 140; } // Richtung gedrückt halten = wiederholen
    }
  }
  raf = requestAnimationFrame(poll);
}
addEventListener('gamepadconnected', e => { pads++; toast('🎮 Gamepad verbunden: ' + (e.gamepad.id || '').replace(/\(.*\)/, '').trim().slice(0, 40), 2500); if (!raf) raf = requestAnimationFrame(poll); });
addEventListener('gamepaddisconnected', () => { pads = Math.max(0, pads - 1); });

/* ---------- Handy als Fernbedienung ----------
   Beide Geräte mit demselben Konto angemeldet. Privater Realtime-Kanal „remote:<Nutzer-ID>“ (nur dieses Konto).
   Der Fernseher/PC hört nur zu, während eine Fahrt läuft. */
export const REMOTE = { pause: ' ', up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', cam: 'c', rideon: 'r', photo: 'p', map: 'k', pup: 'u', music: 't' };
let rch = null, rchP = null, lastLive = null; export const remote = { err: null, ok: false };
async function channel() {
  const O = await import('./online/client.js'); if (!O.loggedIn() || !O.access().ok) return null;
  if (rch) return rch; if (rchP) return rchP;
  rchP = open_(O).finally(() => { rchP = null; }); return rchP;
}
async function open_(O) {
  const sb = await O.client(); await O.realtimeAuth().catch(() => { });
  rch = sb.channel('remote:' + O.online.user.id, { config: { private: true, broadcast: { self: false } } });
  rch.on('broadcast', { event: 'cmd' }, ({ payload }) => { if (!inRide()) { rch.send({ type: 'broadcast', event: 'ack', payload: { ok: false, why: 'keine Fahrt' } }); return; } const k = REMOTE[payload?.c]; if (k) { key(k); rch.send({ type: 'broadcast', event: 'ack', payload: { ok: true, c: payload.c } }); } });
  rch.on('broadcast', { event: 'ack' }, ({ payload }) => bus.emit('remoteAck', payload));
  // Live-Stand einer Fahrt auf einem anderen Gerät desselben Kontos (sofort, ohne Umweg über den Speicher)
  rch.on('broadcast', { event: 'live' }, ({ payload }) => { if (payload) { lastLive = { ...payload, rx: Date.now() }; bus.emit('liveRt', lastLive); } });
  const c = rch; let st = '';
  await new Promise(res => { c.subscribe(s => { st = s; if (s === 'SUBSCRIBED' || s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') res(); }); setTimeout(res, 8000); });
  remote.ok = st === 'SUBSCRIBED'; remote.err = remote.ok ? null : st === 'CHANNEL_ERROR' ? 'Kanal abgelehnt – Datenbankschema aktualisieren (schema.sql erneut ausführen)' : 'keine Verbindung zum Server';
  if (!remote.ok) { try { (await O.client()).removeChannel(c); } catch (e) { } rch = null; return null; }
  return c;
}
export async function listenRemote() { try { await channel(); } catch (e) { } }
export async function sendRemote(c) { const O = await import('./online/client.js'); if (!O.loggedIn()) { toast('Fernbedienung braucht ein angemeldetes Konto'); return false; } const ch = await channel(); if (!ch) { toast('Fernbedienung: ' + (remote.err || 'keine Verbindung'), 5000); return false; } ch.send({ type: 'broadcast', event: 'cmd', payload: { c } }); return true; }
// Fahrt-Gerät: Live-Stand an die anderen Geräte desselben Kontos senden
export async function sendLive(obj) { const ch = await channel().catch(() => null); ch?.send({ type: 'broadcast', event: 'live', payload: { ...obj, ts: Date.now() } }); }
// Anzeige-Gerät: frischester Live-Stand (Echtzeitkanal, sonst Speicher)
export async function liveNow() {
  channel().catch(() => { });
  if (lastLive && Date.now() - lastLive.rx < 12000) return lastLive;
  try { const S = await import('./sync.js'); return S.syncReady() ? await S.getLive() : null; } catch (e) { return null; }
}
// Bis zu ms warten, bis Konto oder Cloud-Speicher bereit sind (nach dem Öffnen läuft die Anmeldung oft noch)
export async function whenReady(ms = 8000) { const S = await import('./sync.js'), O = await import('./online/client.js'); const t0 = Date.now(); while (Date.now() - t0 < ms) { if (S.syncReady() || O.loggedIn()) return true; await new Promise(r => setTimeout(r, 300)); } return S.syncReady() || O.loggedIn(); }
bus.on('online', ev => { if (ev === 'SIGNED_OUT' || ev === 'out') { rch = null; remote.ok = false; } else setTimeout(() => listenRemote(), 1500); }); // angemeldet: Kanal des Kontos offen halten
