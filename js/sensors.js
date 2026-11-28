// Weitere Bluetooth-Sensoren: Powermeter (mit Pedal-Balance), Geschwindigkeit/Trittfrequenz, zusätzlicher Puls (mit HRV),
// Körper- und Raumtemperatur, Luftfeuchte, Lüfter und beliebige unbekannte Geräte. Akkustand und Geräteinfo werden angezeigt. Bekannte Standards werden automatisch gelesen, bei unbekannten Geräten
// ordnet man einzelnen Messwerten (Characteristics) eine Bedeutung, ein Zahlenformat, eine Position und einen Faktor zu.
import { live, profile } from './state.js';
import { bus } from './util.js';
import { kv } from './db.js';
import { log, support } from './ble.js';

const STD = { cp: 0x1818, cpm: 0x2a63, csc: 0x1816, cscm: 0x2a5b, hr: 0x180d, hrm: 0x2a37, rsc: 0x1814, batt: 0x180f, temp: 0x1809, env: 0x181a };
// Damit der Browser Zugriff gewährt, muss jeder Dienst vorher genannt werden: alle Standard-Dienste plus bekannte Herstellerdienste
const CORE_SVC = '00002100-5b1e-4347-b07c-97b514dae121', CORE_CH = '00002101-5b1e-4347-b07c-97b514dae121';
const FAN_SVC = 'a026ee0c-0a7d-4ab3-97fa-f1500f9feb8b', FAN_CH = 'a026e038-0a7d-4ab3-97fa-f1500f9feb8b';
const KNOWN_VENDOR = {
  [CORE_SVC]: 'Körpertemperatur',
  '6e40fec1-b5a3-f393-e0a9-e50e24dcca9e': 'Trainer-Protokoll (FE-C über Bluetooth)',
  'a026ee01-0a7d-4ab3-97fa-f1500f9feb8b': 'Herstellerdienst',
  'a026ee03-0a7d-4ab3-97fa-f1500f9feb8b': 'Herstellerdienst',
  'a026ee0b-0a7d-4ab3-97fa-f1500f9feb8b': 'Herstellerdienst (Trainer)',
  [FAN_SVC]: 'Lüfter',
  '0000fc82-0000-1000-8000-00805f9b34fb': 'Lenkertasten',
  '00000001-19ca-4651-86e5-fa29dcdd09d1': 'Lenkertasten',
  '0000fe03-0000-1000-8000-00805f9b34fb': 'Herstellerdienst',
  '6e400001-b5a3-f393-e0a9-e50e24dcca9e': 'Serielle Daten (UART)',
};
// Vorlagen zum Hinzufügen: der Browser zeigt dann nur passende Geräte
export const PRESETS = [
  ['power', '⚡ Powermeter', 'Leistung, Trittfrequenz, Pedal-Balance', [0x1818]],
  ['csc', '🔄 Tempo / Trittfrequenz', 'Rad- oder Kurbelsensor', [0x1816]],
  ['hr', '❤️ Zweiter Pulsmesser', 'Puls und Herzratenvariabilität (HRV)', [0x180d]],
  ['core', '🌡️ Körpertemperatur', 'Kerntemperatur-Sensor (experimentell)', [CORE_SVC, 0x1809]],
  ['env', '🏠 Raumklima', 'Temperatur und Luftfeuchte im Raum', [0x181a, 0x1809]],
  ['fan', '🌬️ Lüfter', 'Bluetooth-Lüfter, der dem Tempo oder Puls folgt (experimentell)', [FAN_SVC]],
  ['any', '❓ Anderes Gerät', 'alle Geräte in der Nähe, Werte selbst zuordnen', null],
];
const STD_RANGE = Array.from({ length: 0x1860 - 0x1800 }, (_, i) => 0x1800 + i).filter(u => u !== 0x1812); // HID ist gesperrt
export const METRICS = { power: 'Leistung (W)', cad: 'Trittfrequenz (U/min)', hr: 'Puls (bpm)', speed: 'Tempo (km/h)', temp: 'Temperatur (°C)', core: 'Körperkerntemperatur (°C)', room: 'Raumtemperatur (°C)', hum: 'Luftfeuchte (%)', custom: 'Eigener Wert' };
export const FORMATS = { u8: 'uint8', u16: 'uint16 LE', s16: 'int16 LE', u32: 'uint32 LE', s32: 'int32 LE', f32: 'float32 LE', u16be: 'uint16 BE', s16be: 'int16 BE' };

export const sensors = { list: [], conn: new Map() }; // list: gespeichert, conn: id -> { device, status, values, chars }
const uuidName = u => typeof u === 'number' ? '0x' + u.toString(16).padStart(4, '0') : String(u);
const short = u => { const m = /^0000([0-9a-f]{4})-0000-1000-8000-00805f9b34fb$/i.exec(u); return m ? '0x' + m[1] : u; };
export const serviceLabel = u => ({ '0x1818': 'Leistung (Cycling Power)', '0x1816': 'Geschwindigkeit/Trittfrequenz', '0x180d': 'Herzfrequenz', '0x1814': 'Laufsensor', '0x180f': 'Batterie', '0x180a': 'Geräteinfo', '0x1809': 'Temperatur', '0x181a': 'Umgebung', '0x1826': 'Trainer (FTMS)', '0x1800': 'Allgemein', '0x1801': 'Allgemein' }[short(u)] || KNOWN_VENDOR[u] || 'Unbekannter Dienst');

export async function loadSensors() { sensors.list = await kv.get('sensors', []); }
const save = () => kv.set('sensors', sensors.list);
const emit = () => bus.emit('sensors');

// Neues Gerät suchen. extra: zusätzliche Dienst-UUIDs (z. B. aus der Herstellerdoku)
export async function addSensor(extra = [], preset = 'any') {
  const s = support(); if (!s.ok) throw new Error(s.text);
  const optionalServices = [...STD_RANGE, ...Object.keys(KNOWN_VENDOR), ...extra.map(x => x.trim().toLowerCase()).filter(Boolean).map(x => /^[0-9a-f]{4}$/.test(x) ? parseInt(x, 16) : /^0x[0-9a-f]{4}$/.test(x) ? parseInt(x, 16) : x)];
  const P = PRESETS.find(x => x[0] === preset), svcs = P?.[3];
  const device = await navigator.bluetooth.requestDevice(svcs ? { filters: svcs.map(u => ({ services: [u] })), optionalServices } : { acceptAllDevices: true, optionalServices });
  let entry = sensors.list.find(x => x.id === device.id);
  if (!entry) { entry = { id: device.id, name: device.name || 'Sensor', maps: [], use: {}, kind: preset }; sensors.list.push(entry); await save(); }
  await connectSensor(entry, device);
  return entry;
}
export async function removeSensor(id) { const c = sensors.conn.get(id); c && (c.manual = true); try { c?.device.gatt.disconnect(); } catch (e) { } sensors.conn.delete(id); sensors.list = sensors.list.filter(x => x.id !== id); await save(); emit(); }
export async function updateSensor(entry) { const i = sensors.list.findIndex(x => x.id === entry.id); if (i >= 0) sensors.list[i] = entry; await save(); const c = sensors.conn.get(entry.id); if (c) c.entry = entry; emit(); }

// Verbinden: alle Dienste und Messwerte auflisten, Standards auswerten, Zuordnungen abonnieren
export async function connectSensor(entry, device) {
  const c = { entry, device, status: 'busy', services: [], values: {}, manual: false };
  sensors.conn.set(entry.id, c); emit();
  device.addEventListener('gattserverdisconnected', () => { c.status = 'error'; emit(); if (!c.manual) setTimeout(() => sensors.conn.get(entry.id) === c && connectSensor(entry, device).catch(() => { }), 3000); });
  try {
    const srv = await device.gatt.connect();
    for (const s of await srv.getPrimaryServices()) {
      const svc = { uuid: s.uuid, label: serviceLabel(s.uuid), chars: [] };
      let chars = []; try { chars = await s.getCharacteristics(); } catch (e) { }
      for (const ch of chars) {
        const p = ch.properties, key = s.uuid + '/' + ch.uuid;
        svc.chars.push({ uuid: ch.uuid, key, notify: p.notify || p.indicate, read: p.read });
        const handle = v => { c.values[key] = v; standard(entry, s.uuid, ch.uuid, v); mapped(entry, key, v); bus.emit('sensorvalue', { id: entry.id, key }); };
        if (p.notify || p.indicate) { ch.addEventListener('characteristicvaluechanged', e => handle(e.target.value)); try { await ch.startNotifications(); } catch (e) { } }
        else if (p.read && !/2a19$|^0000180a/.test(ch.uuid)) { try { handle(await ch.readValue()); } catch (e) { } }
        const sc = short(ch.uuid);
        if (sc === '0x2a19') { const rd = v => { c.battery = v.getUint8(0); emit(); }; if (p.read) try { rd(await ch.readValue()); } catch (e) { } if (p.notify) ch.addEventListener('characteristicvaluechanged', e => rd(e.target.value)); }
        if (short(s.uuid) === '0x180a' && p.read && INFO[sc]) { try { (c.info ||= {})[INFO[sc]] = new TextDecoder().decode(await ch.readValue()).replace(/\0/g, '').trim().slice(0, 40); } catch (e) { } }
        if (p.read && !p.notify && POLL.has(sc)) (c.polls ||= []).push(async () => { try { handle(await ch.readValue()); } catch (e) { } });
        if (ch.uuid === FAN_CH) c.fan = ch;
      }
      c.services.push(svc);
    }
    c.status = 'on'; log((device.name || 'Sensor') + ' verbunden (' + c.services.length + ' Dienste).');
    if (c.polls?.length) { clearInterval(c.pollT); c.pollT = setInterval(() => c.status === 'on' ? c.polls.forEach(f => f()) : clearInterval(c.pollT), 30000); } // Raumklima u. Ä. nur lesbar: alle 30 s abfragen
    if (c.fan) startFan(c);
  } catch (e) { c.status = 'error'; log('Sensor ' + (device.name || '') + ': ' + e.message); }
  emit();
}
// Bekannte Geräte beim Start wieder verbinden (wo der Browser es kann)
export async function reconnectSensors() {
  await loadSensors();
  if (!sensors.list.length || !support().ok || !navigator.bluetooth.getDevices) return;
  for (const device of await navigator.bluetooth.getDevices()) {
    const entry = sensors.list.find(x => x.id === device.id); if (!entry || sensors.conn.has(entry.id)) continue;
    try {
      if (device.watchAdvertisements) { const ac = new AbortController(); device.addEventListener('advertisementreceived', () => { ac.abort(); connectSensor(entry, device); }, { once: true }); await device.watchAdvertisements({ signal: ac.signal }); setTimeout(() => ac.abort(), 30000); }
      else connectSensor(entry, device);
    } catch (e) { }
  }
}

/* ---------- Standards ---------- */
const INFO = { '0x2a29': 'maker', '0x2a24': 'model', '0x2a26': 'fw', '0x2a28': 'sw' };
const POLL = new Set(['0x2a6e', '0x2a6f', '0x2a1c', '0x2a1e', '0x2a6d']);
const crank = {}, wheel = {}, rr = {};
// Herzratenvariabilität (RMSSD) aus den RR-Abständen des Pulsgurts, gleitend über die letzten 60 Schläge
export function hrFrom(v) {
  const f = v.getUint8(0); let o = 1; const hr = f & 1 ? v.getUint16(o, true) : v.getUint8(o); o += f & 1 ? 2 : 1;
  if (f & 8) o += 2; const out = [];
  if (f & 16) for (; o + 1 < v.byteLength; o += 2) out.push(v.getUint16(o, true) / 1024 * 1000);
  return { hr, rr: out };
}
export function addRr(id, list, src = 'Pulsgurt') {
  if (!list.length) return; const a = (rr[id] ||= []);
  for (const x of list) if (x > 250 && x < 2000) { const last = a.at(-1); if (!last || Math.abs(x - last) < last * .3) a.push(x); } // Ausreißer (Fehlschläge) verwerfen
  while (a.length > 60) a.shift();
  if (a.length >= 20) { let s = 0; for (let i = 1; i < a.length; i++) s += (a[i] - a[i - 1]) ** 2; setLive('hrv', Math.sqrt(s / (a.length - 1)), { name: src }); }
}
/* ---------- Lüfter: folgt Tempo oder Puls ---------- */
const fans = new Set();
function startFan(c) {
  fans.add(c);
  (async () => { try { await c.fan.writeValueWithResponse(new Uint8Array([0x04, 0x04])); } catch (e) { } })(); // Handsteuerung
}
export async function fanSet(c, pct) { const v = Math.max(0, Math.min(100, Math.round(pct))); if (c.fanPct === v) return; c.fanPct = v; try { await c.fan.writeValueWithResponse(new Uint8Array([0x02, v])); } catch (e) { } }
// Alle 2 s: Lüfterstärke nach Einstellung (profile.fanMode: speed | hr | fixed | off)
setInterval(() => {
  if (!fans.size) return; const m = profile.fanMode || 'speed', now = performance.now();
  let pct = 0;
  if (m === 'fixed') pct = +profile.fanFixed || 60;
  else if (m === 'hr') { const h = live.hr && now - (live.hrT || 0) < 5000 ? live.hr : 0, lo = profile.hrRest || 60, hi = profile.hrMax || 185; pct = h ? Math.max(0, (h - lo - (hi - lo) * .3) / ((hi - lo) * .6)) * 100 : 0; }
  else if (m === 'speed') { const v = (window.__rideSpeed || 0) * 3.6; pct = v > 3 ? Math.min(100, 15 + v * 2.2) : 0; }
  for (const c of fans) { if (c.status !== 'on') { fans.delete(c); continue; } fanSet(c, pct); }
}, 2000);
function standard(entry, svc, chr, v) {
  const s = short(svc), ch = short(chr), use = entry.use || {};
  // Cycling Power Measurement: Leistung und (falls gesendet) Kurbelumdrehungen
  if (s === '0x1818' && ch === '0x2a63') {
    const f = v.getUint16(0, true), w = v.getInt16(2, true); let o = 4;
    if (use.power !== false) setLive('power', Math.max(0, w), entry);
    if (f & 1) { const b = v.getUint8(o) / 2; if (b > 0 && b < 100) setLive('bal', f & 2 ? b : 100 - b, entry); } // Pedal-Balance: Anteil links in %
    if (f & 1) o += 1; if (f & 4) o += 2; if (f & 16) o += 6;
    if (f & 32 && v.byteLength >= o + 4) rpmFrom(crank, entry.id, v.getUint16(o, true), v.getUint16(o + 2, true), 1024, rpm => use.cad !== false && setLive('cad', rpm, entry));
  }
  // Speed and Cadence: Radumdrehungen ergeben das Tempo, Kurbelumdrehungen die Trittfrequenz
  if (s === '0x1816' && ch === '0x2a5b') {
    const f = v.getUint8(0); let o = 1;
    if (f & 1) { const rev = v.getUint32(o, true), t = v.getUint16(o + 4, true); o += 6; rpmFrom(wheel, entry.id, rev, t, 1024, rpm => use.speed !== false && setLive('speed', rpm * (profile.circ || 2105) / 1e6 * 60, entry), 2 ** 32); }
    if (f & 2) rpmFrom(crank, entry.id + 'c', v.getUint16(o, true), v.getUint16(o + 2, true), 1024, rpm => use.cad !== false && setLive('cad', rpm, entry));
  }
  if (s === '0x180d' && ch === '0x2a37') { const h = hrFrom(v); if (use.hr !== false) setLive('hr', h.hr, entry); addRr(entry.id, h.rr, entry.name); }
  if (s === '0x1809' && (ch === '0x2a1c' || ch === '0x2a1e')) { const m = v.getUint32(1, true) & 0xffffff, e = v.getInt8(4); setLive(entry.kind === 'env' ? 'room' : 'temp', m * 10 ** e, entry); }
  if (s === '0x181a' && ch === '0x2a6e') setLive('room', v.getInt16(0, true) / 100, entry);
  if (s === '0x181a' && ch === '0x2a6f') setLive('hum', v.getUint16(0, true) / 100, entry);
  // Körperkerntemperatur (Format laut Hersteller: Flags, Hauttemperatur, Kerntemperatur je 0,01 °C) – experimentell
  if (svc === CORE_SVC && chr === CORE_CH && v.byteLength >= 5) { const core = v.getInt16(3, true) / 100, skin = v.getInt16(1, true) / 100; if (core > 30 && core < 45) setLive('core', core, entry); if (skin > 20 && skin < 45) setLive('skin', skin, entry); }
}
function rpmFrom(store, id, rev, t, res, cb, wrap = 65536) {
  const p = store[id], now = performance.now();
  if (p) { const dr = (rev - p.rev + wrap) % wrap, dt = ((t - p.t + 65536) % 65536) / res; if (dr > 0 && dt > 0) { const rpm = dr / dt * 60; if (rpm < 3000) { cb(rpm); p.lc = now; } } else if (now - (p.lc || 0) > 2500) cb(0); }
  store[id] = { rev, t, lc: p?.lc ?? now };
}

/* ---------- Eigene Zuordnungen ---------- */
export function decode(v, fmt, off = 0) {
  try {
    switch (fmt) {
      case 'u8': return v.getUint8(off); case 'u16': return v.getUint16(off, true); case 's16': return v.getInt16(off, true);
      case 'u32': return v.getUint32(off, true); case 's32': return v.getInt32(off, true); case 'f32': return v.getFloat32(off, true);
      case 'u16be': return v.getUint16(off, false); case 's16be': return v.getInt16(off, false);
    }
  } catch (e) { return null; }
  return null;
}
function mapped(entry, key, v) {
  for (const m of entry.maps || []) if (m.key === key) { const raw = decode(v, m.fmt, +m.off || 0); if (raw != null) setLive(m.metric, raw * (+m.scale || 1) + (+m.add || 0), entry, m.label); }
}
// Werte in den Live-Zustand der App: Leistung, Puls, Kadenz ersetzen die anderen Quellen, der Rest landet in live.extra
function setLive(metric, val, entry, label) {
  const now = performance.now(); if (!isFinite(val)) return;
  live.extra ||= {};
  if (metric === 'power' && profile.powerSource === 'meter') { live.power = Math.round(val); live.powerT = now; live.meterT = now; }
  else if (metric === 'hr') { live.hr = Math.round(val); live.hrT = now; }
  else if (metric === 'cad') { live.cadSensor = val; live.cadT = now; }
  live.extra[metric === 'custom' ? 'x:' + (label || 'Wert') : metric] = { v: val, t: now, src: entry.name, label: label || METRICS[metric] || metric };
  bus.emit('data');
}
export const hexOf = v => v ? Array.from(new Uint8Array(v.buffer, v.byteOffset, v.byteLength), b => b.toString(16).padStart(2, '0')).join(' ') : '–';
export { uuidName, short };
