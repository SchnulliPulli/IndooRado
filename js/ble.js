// Bluetooth-Geräte: FTMS-Trainer, Herzfrequenz, Trittfrequenz (CSC), Click-Controller
// Alle Verbindungen leben im Speicher der App und überdauern Seitenwechsel innerhalb der App.
import { live, profile } from './state.js';
import { bus, clamp } from './util.js';
import { kv } from './db.js';

const U = {
  ftms: 0x1826, ibd: 0x2ad2, cp: 0x2ad9, hr: 0x180d, hrm: 0x2a37, csc: 0x1816, cscm: 0x2a5b, batt: 0x180f, battL: 0x2a19,
  zw: '00000001-19ca-4651-86e5-fa29dcdd09d1', zwFc: '0000fc82-0000-1000-8000-00805f9b34fb',
};
export const KINDS = {
  trainer: { label: 'Smart-Trainer', hint: 'Van Rysel D100 und andere FTMS-Trainer' },
  hr: { label: 'Herzfrequenz', hint: 'Garmin HRM-Dual (Bluetooth)' },
  cad: { label: 'Trittfrequenz', hint: 'Garmin Cadence Sensor 2' },
  click: { label: 'Click-Controller', hint: 'Zum Aufwecken eine Taste drücken' },
};
export const devs = { trainer: null, hr: null, cad: null, click: null };
export const status = { trainer: 'off', hr: 'off', cad: 'off', click: 'off' };
export const logLines = [];
export function log(m) {
  logLines.unshift(new Date().toLocaleTimeString('de-DE') + '  ' + m);
  if (logLines.length > 200) logLines.pop();
  bus.emit('log');
}
function set(kind, st, extra) { status[kind] = st; bus.emit('dev', { kind, st, ...extra }); }

export function support() {
  if (!window.isSecureContext) return { ok: false, reason: 'insecure', text: `Diese Adresse (${location.origin}) gilt nicht als sicher, deshalb sperrt der Browser Bluetooth. Öffne die App über https:// oder über http://localhost bzw. http://127.0.0.1.` };
  if (!navigator.bluetooth) return { ok: false, reason: 'browser', text: 'Dieser Browser bietet kein Web Bluetooth. Nutze Chrome oder Edge auf Android, Windows, macOS oder ChromeOS. Samsung Internet, Firefox und Safari können es nicht.' };
  return { ok: true };
}

const OPTS = {
  trainer: { filters: [{ services: [U.ftms] }], optionalServices: [U.ftms, U.batt] },
  hr: { filters: [{ services: [U.hr] }], optionalServices: [U.batt] },
  cad: { filters: [{ services: [U.csc] }], optionalServices: [U.batt] },
  // Click-Controller: Erkennung über seine Bluetooth-Dienste
  click: { filters: [{ services: [U.zw] }, { services: [U.zwFc] }], optionalServices: [U.zw, U.zwFc, U.batt] },
};

export async function connect(kind) {
  const s = support();
  if (!s.ok) { log(s.text); bus.emit('bt-unsupported', s); return; }
  let device;
  try { device = await navigator.bluetooth.requestDevice(OPTS[kind]); }
  catch (e) { if (e.name !== 'NotFoundError') log('Auswahl: ' + e.message); else log('Auswahl abgebrochen.'); return; }
  const map = await kv.get('devmap', {}); map[device.id] = kind; kv.set('devmap', map);
  attach(kind, device);
}
function attach(kind, device) {
  if (devs[kind] && devs[kind].device !== device) disconnect(kind);
  const d = { kind, device, tries: 0, manual: false, battery: null };
  devs[kind] = d;
  device.addEventListener('gattserverdisconnected', () => onLost(d));
  return setup(d);
}
async function setup(d) {
  set(d.kind, 'busy', { name: d.device.name });
  log('Verbinde ' + (d.device.name || d.kind) + ' …');
  try {
    const srv = await withTimeout(d.device.gatt.connect(), 15000);
    if (d.kind === 'trainer') await setupTrainer(d, srv);
    else if (d.kind === 'hr') await setupHr(d, srv);
    else if (d.kind === 'cad') await setupCsc(d, srv);
    else await setupClick(d, srv);
    readBattery(d, srv);
    d.tries = 0; set(d.kind, 'on', { name: d.device.name });
    log((d.device.name || d.kind) + ' verbunden.');
  } catch (e) {
    log('Fehler bei ' + (d.device.name || d.kind) + ': ' + e.message);
    set(d.kind, 'error', { name: d.device.name });
    if (!d.manual && d.tries < 4) { d.tries++; setTimeout(() => devs[d.kind] === d && setup(d), 2000 * d.tries); }
  }
}
function withTimeout(p, ms) { return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('Zeitüberschreitung')), ms))]); }
function onLost(d) {
  if (d.kind === 'trainer') { T.cp = null; T.ready = false; }
  if (d.kind === 'click') clearInterval(d.ka);
  if (devs[d.kind] !== d) return;
  set(d.kind, d.manual ? 'off' : 'error', { name: d.device.name });
  log((d.device.name || d.kind) + ' getrennt.');
  if (!d.manual && d.tries < 6) { d.tries++; setTimeout(() => devs[d.kind] === d && setup(d), 1500 * d.tries); }
}
export function disconnect(kind) {
  const d = devs[kind]; if (!d) return;
  d.manual = true; try { d.device.gatt.disconnect(); } catch (e) { }
  devs[kind] = null; set(kind, 'off');
}
async function readBattery(d, srv) {
  try { const s = await srv.getPrimaryService(U.batt); const c = await s.getCharacteristic(U.battL); d.battery = (await c.readValue()).getUint8(0); bus.emit('dev', { kind: d.kind, st: status[d.kind] }); } catch (e) { }
}

// Bereits erlaubte Geräte ohne Auswahldialog neu verbinden (wo der Browser das kann)
export async function reconnectKnown() {
  if (!support().ok || !navigator.bluetooth.getDevices) return 0;
  const map = await kv.get('devmap', {});
  let n = 0;
  for (const device of await navigator.bluetooth.getDevices()) {
    const kind = map[device.id]; if (!kind || devs[kind]) continue;
    n++;
    try {
      if (device.watchAdvertisements) {
        const ac = new AbortController();
        device.addEventListener('advertisementreceived', () => { ac.abort(); attach(kind, device); }, { once: true });
        await device.watchAdvertisements({ signal: ac.signal });
        setTimeout(() => ac.abort(), 30000);
      } else attach(kind, device);
    } catch (e) { attach(kind, device); }
  }
  if (n) log(n + ' bekannte Geräte werden gesucht …');
  return n;
}

/* ---------------- FTMS ---------------- */
const T = { cp: null, ready: false, busy: false, pending: null, last: '', lastT: 0 };
export const trainer = T;
async function setupTrainer(d, srv) {
  const s = await srv.getPrimaryService(U.ftms);
  const ibd = await s.getCharacteristic(U.ibd);
  ibd.addEventListener('characteristicvaluechanged', e => parseIbd(e.target.value));
  await ibd.startNotifications();
  T.cp = await s.getCharacteristic(U.cp);
  T.cp.addEventListener('characteristicvaluechanged', e => {
    const v = e.target.value;
    if (v.getUint8(0) === 0x80 && v.getUint8(2) !== 1) log('Trainer lehnt Befehl 0x' + v.getUint8(1).toString(16) + ' ab (Code ' + v.getUint8(2) + ')');
  });
  await T.cp.startNotifications();
  await T.cp.writeValueWithResponse(new Uint8Array([0x00]));
  await T.cp.writeValueWithResponse(new Uint8Array([0x07]));
  T.ready = true; T.last = '';
}
function parseIbd(v) {
  const f = v.getUint16(0, true); let o = 2;
  if (!(f & 1)) { live.speedTrainer = v.getUint16(o, true) / 100; o += 2; }
  if (f & 2) o += 2;
  if (f & 4) { live.cadTrainer = v.getUint16(o, true) / 2; o += 2; }
  if (f & 8) o += 2;
  if (f & 16) o += 3;
  if (f & 32) o += 2;
  // Leistung vom Trainer, außer ein Powermeter ist als Quelle gewählt und sendet gerade
  if (f & 64) { if (!(profile.powerSource === 'meter' && performance.now() - (live.meterT || 0) < 3000)) { live.power = Math.max(0, v.getInt16(o, true)); live.powerT = performance.now(); } o += 2; }
  if (f & 128) o += 2;
  if (f & 256) o += 5;
  if (f & 512) { const h = v.getUint8(o); if (h && !devs.hr) { live.hr = h; live.hrT = performance.now(); } o += 1; }
  bus.emit('data');
}
function queue(bytes) {
  const key = Array.from(bytes).join(',');
  if (key === T.last && performance.now() - T.lastT < 4000) return;
  T.pending = bytes; pump();
}
async function pump() {
  if (T.busy || !T.pending || !T.cp || !T.ready) return;
  T.busy = true; const b = T.pending; T.pending = null;
  try { await T.cp.writeValueWithResponse(b); T.last = Array.from(b).join(','); T.lastT = performance.now(); }
  catch (e) { log('Senden fehlgeschlagen: ' + e.message); }
  T.busy = false; if (T.pending) pump();
}
export const control = { target: null, grade: null };
export function setPower(w) {
  w = Math.round(clamp(w, 0, profile.maxW)); control.target = w; control.grade = null;
  const b = new Uint8Array(3); b[0] = 0x05; new DataView(b.buffer).setInt16(1, w, true); queue(b);
}
export function setGrade(g) {
  control.grade = g; control.target = null;
  const b = new Uint8Array(7), dv = new DataView(b.buffer);
  b[0] = 0x11; dv.setInt16(1, 0, true); dv.setInt16(3, Math.round(clamp(g, -20, 20) * 100), true); b[5] = 40; b[6] = 51; queue(b);
}

/* ---------------- Herzfrequenz ---------------- */
async function setupHr(d, srv) {
  const c = await (await srv.getPrimaryService(U.hr)).getCharacteristic(U.hrm);
  c.addEventListener('characteristicvaluechanged', e => {
    const v = e.target.value, f = v.getUint8(0);
    const h = f & 1 ? v.getUint16(1, true) : v.getUint8(1);
    if (h > 0) { live.hr = h; live.hrT = performance.now(); bus.emit('data'); }
  });
  await c.startNotifications();
}

/* ---------------- Trittfrequenz ---------------- */
const C = { rev: null, time: null, lastChange: 0 };
async function setupCsc(d, srv) {
  const c = await (await srv.getPrimaryService(U.csc)).getCharacteristic(U.cscm);
  c.addEventListener('characteristicvaluechanged', e => parseCsc(e.target.value));
  await c.startNotifications();
}
function parseCsc(v) {
  const f = v.getUint8(0); let o = 1;
  if (f & 1) o += 6;
  if (!(f & 2)) return;
  const rev = v.getUint16(o, true), t = v.getUint16(o + 2, true), now = performance.now();
  if (C.rev != null) {
    const dr = (rev - C.rev + 65536) % 65536, dt = ((t - C.time + 65536) % 65536) / 1024;
    if (dr > 0 && dt > 0) { const rpm = dr / dt * 60; if (rpm < 220) { live.cadSensor = live.cadSensor == null ? rpm : live.cadSensor * 0.35 + rpm * 0.65; C.lastChange = now; } }
    else if (now - C.lastChange > 2500) live.cadSensor = 0;
  }
  C.rev = rev; C.time = t; live.cadT = now; bus.emit('data');
}

/* ---------------- Click-Controller ---------------- */
export const click = { map: null, learn: null, state: {}, lastId: '' };
const DEFAULT_MAP = { '37:1': 'up', '37:2': 'down', '23:4096': 'up', '23:8192': 'down', '23:256': 'up', '23:512': 'down', '23:2': 'up', '23:8': 'down' };
export async function loadClickMap() { click.map = await kv.get('clickmap', { ...DEFAULT_MAP }); }
async function setupClick(d, srv) {
  let s, v2 = false;
  try { s = await srv.getPrimaryService(U.zw); } catch (e) { s = await srv.getPrimaryService(U.zwFc); v2 = true; }
  const chars = await s.getCharacteristics();
  const find = n => chars.find(c => c.uuid.startsWith('0000000' + n));
  const notify = find(2), write = find(3), ind = find(4);
  if (!notify || !write) throw new Error('Click-Merkmale nicht gefunden');
  notify.addEventListener('characteristicvaluechanged', e => parseClick(e.target.value));
  await notify.startNotifications();
  if (ind) {
    ind.addEventListener('characteristicvaluechanged', e => {
      const b = new Uint8Array(e.target.value.buffer);
      if (b[0] === 0xff) log('Click ist gesperrt. Ein Click v2 muss etwa alle 24 h einmal in der App des Herstellers verbunden werden.');
      else if (b[0] === 0x52) log('Click antwortet mit RideOn.');
    });
    try { await ind.startNotifications(); } catch (e) { }
  }
  const ride = [0x52, 0x69, 0x64, 0x65, 0x4f, 0x6e];
  const hs = new Uint8Array(v2 ? ride.concat([2, 3]) : ride);
  await write.writeValueWithResponse(hs);
  clearInterval(d.ka);
  if (v2) d.ka = setInterval(() => write.writeValueWithResponse(hs).catch(() => { }), 3000);
  d.v2 = v2;
}
function varints(b, o) {
  const out = {};
  while (o < b.length) {
    let key = 0, sh = 0, x;
    do { x = b[o++]; key |= (x & 127) << sh; sh += 7; } while (x & 128 && o < b.length);
    const fld = key >>> 3, wt = key & 7;
    if (wt === 0) { let val = 0; sh = 0; do { x = b[o++]; val += (x & 127) * 2 ** sh; sh += 7; } while (x & 128 && o < b.length); out[fld] = val; }
    else if (wt === 2) { const len = b[o++]; o += len; }
    else break;
  }
  return out;
}
function parseClick(v) {
  const b = new Uint8Array(v.buffer, v.byteOffset, v.byteLength), type = b[0];
  if (type === 0x37) { const f = varints(b, 1); for (const k of [1, 2]) if (k in f) press('37:' + k, f[k] === 0); }
  else if (type === 0x23) { const f = varints(b, 1); const m = f[1]; if (m == null) return; for (let bit = 1; bit <= 0x8000; bit <<= 1) press('23:' + bit, !(m & bit)); }
}
function press(id, down) {
  const was = click.state[id]; click.state[id] = down;
  if (!down || was) return;
  click.lastId = id;
  if (click.learn) {
    const pre = id.split(':')[0];
    for (const k in click.map) if (click.map[k] === click.learn && k.split(':')[0] === pre) delete click.map[k];
    click.map[id] = click.learn; kv.set('clickmap', click.map);
    log('Taste ' + id + ' → ' + (click.learn === 'up' ? 'Hochschalten' : 'Runterschalten'));
    click.learn = null; bus.emit('clickmap'); return;
  }
  const a = click.map?.[id];
  if (a) bus.emit('shift', a === 'up' ? 1 : -1);
  bus.emit('clickpress', id);
}

/* ---------------- Demo-Geräte ---------------- */
export const demo = { on: false, cad: 88, effort: 1, pw: 0, hr: 70, timer: null };
export function setDemo(on) {
  demo.on = on; kv.set('demo', on); clearInterval(demo.timer);
  if (on) {
    T.ready = false;
    demo.timer = setInterval(() => {
      const now = performance.now();
      const cad = demo.cad ? demo.cad + Math.sin(now / 900) * 2.5 : 0;
      live.cadSensor = cad; live.cadT = now;
      let want = control.target != null ? control.target : (cad > 20 ? cad * 2.1 * demo.effort : 0);
      if (control.grade != null && control.target == null) want = cad > 20 ? Math.max(60, 150 + control.grade * 25) * demo.effort : 0;
      if (cad < 20) want = 0;
      demo.pw += (want - demo.pw) * 0.3;
      live.power = Math.max(0, Math.round(demo.pw + (Math.random() - 0.5) * 10)); live.powerT = now;
      const hrT = 62 + live.power * 0.42; demo.hr += (hrT - demo.hr) * 0.02;
      live.hr = Math.round(demo.hr); live.hrT = now;
      bus.emit('data');
    }, 250);
    for (const k of ['trainer', 'hr', 'cad']) if (!devs[k]) set(k, 'demo');
  } else for (const k of ['trainer', 'hr', 'cad']) if (!devs[k]) set(k, 'off');
}
