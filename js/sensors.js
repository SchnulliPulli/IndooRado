// Weitere Bluetooth-Sensoren: Powermeter, Geschwindigkeitssensor, zusätzlicher Puls- oder Kadenzsensor
// und beliebige unbekannte Geräte. Bekannte Standards werden automatisch gelesen, bei unbekannten Geräten
// ordnet man einzelnen Messwerten (Characteristics) eine Bedeutung, ein Zahlenformat, eine Position und einen Faktor zu.
import { live, profile } from './state.js';
import { bus } from './util.js';
import { kv } from './db.js';
import { log, support } from './ble.js';

const STD = { cp: 0x1818, cpm: 0x2a63, csc: 0x1816, cscm: 0x2a5b, hr: 0x180d, hrm: 0x2a37, rsc: 0x1814, batt: 0x180f, temp: 0x1809, env: 0x181a };
// Damit der Browser Zugriff gewährt, muss jeder Dienst vorher genannt werden: alle Standard-Dienste plus bekannte Herstellerdienste
const KNOWN_VENDOR = {
  '00002100-5b1e-4347-b07c-97b514dae121': 'CORE Körpertemperatur',
  '6e40fec1-b5a3-f393-e0a9-e50e24dcca9e': 'Tacx FE-C über Bluetooth',
  'a026ee01-0a7d-4ab3-97fa-f1500f9feb8b': 'Wahoo',
  'a026ee03-0a7d-4ab3-97fa-f1500f9feb8b': 'Wahoo',
  'a026ee0b-0a7d-4ab3-97fa-f1500f9feb8b': 'Wahoo Trainer',
  '0000fc82-0000-1000-8000-00805f9b34fb': 'Click-Controller',
  '00000001-19ca-4651-86e5-fa29dcdd09d1': 'Click-Controller',
  '0000fe03-0000-1000-8000-00805f9b34fb': 'Amazon/Garmin',
  '6e400001-b5a3-f393-e0a9-e50e24dcca9e': 'Nordic UART',
};
const STD_RANGE = Array.from({ length: 0x1860 - 0x1800 }, (_, i) => 0x1800 + i).filter(u => u !== 0x1812); // HID ist gesperrt
export const METRICS = { power: 'Leistung (W)', cad: 'Trittfrequenz (U/min)', hr: 'Puls (bpm)', speed: 'Tempo (km/h)', temp: 'Temperatur (°C)', custom: 'Eigener Wert' };
export const FORMATS = { u8: 'uint8', u16: 'uint16 LE', s16: 'int16 LE', u32: 'uint32 LE', s32: 'int32 LE', f32: 'float32 LE', u16be: 'uint16 BE', s16be: 'int16 BE' };

export const sensors = { list: [], conn: new Map() }; // list: gespeichert, conn: id -> { device, status, values, chars }
const uuidName = u => typeof u === 'number' ? '0x' + u.toString(16).padStart(4, '0') : String(u);
const short = u => { const m = /^0000([0-9a-f]{4})-0000-1000-8000-00805f9b34fb$/i.exec(u); return m ? '0x' + m[1] : u; };
export const serviceLabel = u => ({ '0x1818': 'Leistung (Cycling Power)', '0x1816': 'Geschwindigkeit/Trittfrequenz', '0x180d': 'Herzfrequenz', '0x1814': 'Laufsensor', '0x180f': 'Batterie', '0x180a': 'Geräteinfo', '0x1809': 'Temperatur', '0x181a': 'Umgebung', '0x1826': 'Trainer (FTMS)', '0x1800': 'Allgemein', '0x1801': 'Allgemein' }[short(u)] || KNOWN_VENDOR[u] || 'Unbekannter Dienst');

export async function loadSensors() { sensors.list = await kv.get('sensors', []); }
const save = () => kv.set('sensors', sensors.list);
const emit = () => bus.emit('sensors');

// Neues Gerät suchen. extra: zusätzliche Dienst-UUIDs (z. B. aus der Herstellerdoku)
export async function addSensor(extra = []) {
  const s = support(); if (!s.ok) throw new Error(s.text);
  const optionalServices = [...STD_RANGE, ...Object.keys(KNOWN_VENDOR), ...extra.map(x => x.trim().toLowerCase()).filter(Boolean).map(x => /^[0-9a-f]{4}$/.test(x) ? parseInt(x, 16) : /^0x[0-9a-f]{4}$/.test(x) ? parseInt(x, 16) : x)];
  const device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices });
  let entry = sensors.list.find(x => x.id === device.id);
  if (!entry) { entry = { id: device.id, name: device.name || 'Sensor', maps: [], use: {} }; sensors.list.push(entry); await save(); }
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
        if (p.read && short(ch.uuid) === '0x2a19') { try { c.battery = (await ch.readValue()).getUint8(0); } catch (e) { } }
      }
      c.services.push(svc);
    }
    c.status = 'on'; log((device.name || 'Sensor') + ' verbunden (' + c.services.length + ' Dienste).');
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
const crank = {}, wheel = {};
function standard(entry, svc, chr, v) {
  const s = short(svc), ch = short(chr), use = entry.use || {};
  // Cycling Power Measurement: Leistung und (falls gesendet) Kurbelumdrehungen
  if (s === '0x1818' && ch === '0x2a63') {
    const f = v.getUint16(0, true), w = v.getInt16(2, true); let o = 4;
    if (use.power !== false) setLive('power', Math.max(0, w), entry);
    if (f & 1) o += 1; if (f & 4) o += 2; if (f & 16) o += 6;
    if (f & 32 && v.byteLength >= o + 4) rpmFrom(crank, entry.id, v.getUint16(o, true), v.getUint16(o + 2, true), 1024, rpm => use.cad !== false && setLive('cad', rpm, entry));
  }
  // Speed and Cadence: Radumdrehungen ergeben das Tempo, Kurbelumdrehungen die Trittfrequenz
  if (s === '0x1816' && ch === '0x2a5b') {
    const f = v.getUint8(0); let o = 1;
    if (f & 1) { const rev = v.getUint32(o, true), t = v.getUint16(o + 4, true); o += 6; rpmFrom(wheel, entry.id, rev, t, 1024, rpm => use.speed !== false && setLive('speed', rpm * (profile.circ || 2105) / 1e6 * 60, entry), 2 ** 32); }
    if (f & 2) rpmFrom(crank, entry.id + 'c', v.getUint16(o, true), v.getUint16(o + 2, true), 1024, rpm => use.cad !== false && setLive('cad', rpm, entry));
  }
  if (s === '0x180d' && ch === '0x2a37' && use.hr !== false) { const f = v.getUint8(0); setLive('hr', f & 1 ? v.getUint16(1, true) : v.getUint8(1), entry); }
  if (s === '0x1809' && ch === '0x2a1c') { const m = v.getUint32(1, true) & 0xffffff, e = v.getInt8(4); setLive('temp', m * 10 ** e, entry); }
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
  live.extra[metric === 'custom' ? 'x:' + (label || 'Wert') : metric] = { v: val, t: now, src: entry.name, label: label || METRICS[metric] };
  bus.emit('data');
}
export const hexOf = v => v ? Array.from(new Uint8Array(v.buffer, v.byteOffset, v.byteLength), b => b.toString(16).padStart(2, '0')).join(' ') : '–';
export { uuidName, short };
