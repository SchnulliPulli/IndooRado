// VeloVerse-Datenschnittstelle: ein festes, versioniertes Format für alle App-Daten.
// - Schema-Version + Migrationen: nach App-Updates werden alte Daten beim Start automatisch angehoben, nichts geht verloren.
// - Datenpaket ("veloverse-data"): dasselbe Format für Datei-Sicherung, Cloud-Speicher und (später) Server.
//   Anmeldungen (Strava, Cloud, NAS) können mit einem Passwort verschlüsselt mitgesichert werden (AES-GCM, PBKDF2).
// - Adapter: jede Speicherart implementiert { id, name, save(pkgText), load() } und benutzt nur exportData/importData.
import { db, kv } from './db.js';

export const FORMAT = 'veloverse-data';
export const SCHEMA = 2; // bei Änderungen am Datenmodell erhöhen und unten eine Migration ergänzen
const STORES = ['rides', 'routes', 'workouts'];
// Diese kv-Schlüssel sind Zugangsdaten bzw. gerätebezogen; sie wandern nur verschlüsselt ins Paket
export const SECRET_KEYS = ['sync', 'strava', 'cloudApps'];
const LOCAL_ONLY = ['syncMeta', 'musicFiles', 'device', 'kvTimes'];

// Migrationen: from -> to, jeweils idempotent
const MIGRATIONS = {
  // 1 -> 2: Profil bekommt Avatar-Objekt, alte Einzelfarben bleiben erhalten
  1: async () => {
    const p = await kv.get('profile', null);
    if (p && !p.avatar) { p.avatar = { jersey: p.jersey, helmet: p.helmet, bikeColor: p.bikeColor, skin: p.skin }; await kv.set('profile', p); }
  },
};
export async function migrate() {
  let v = await kv.get('schemaVersion', null);
  if (v == null) v = (await kv.get('profile', null)) ? 1 : SCHEMA; // vorhandene Daten ohne Versionsangabe = Version 1
  const from = v;
  while (v < SCHEMA) { try { await MIGRATIONS[v]?.(); } catch (e) { console.error('Migration', v, e); } v++; }
  if (v !== (await kv.get('schemaVersion', null))) await kv.set('schemaVersion', v);
  return { from, to: v };
}

/* ---------- Verschlüsselung für Zugangsdaten ---------- */
const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function keyFrom(pass, salt) {
  const base = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function seal(obj, pass) {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await keyFrom(pass, salt), enc.encode(JSON.stringify(obj)));
  return { alg: 'AES-GCM/PBKDF2-SHA256-250k', salt: b64(salt), iv: b64(iv), ct: b64(ct) };
}
export async function unseal(box, pass) {
  try { return JSON.parse(dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, await keyFrom(pass, unb64(box.salt)), unb64(box.ct)))); }
  catch (e) { throw new Error('Passwort falsch oder Datei beschädigt'); }
}

/* ---------- Datenpaket ---------- */
// opt: { shots: true, secretsPass: '...' }
export async function exportData(opt = {}) {
  const pkg = { format: FORMAT, schema: SCHEMA, created: new Date().toISOString(), origin: location.origin, data: { kv: {}, shots: [] }, secrets: null };
  for (const k of await db.keys('kv')) if (!SECRET_KEYS.includes(k) && !LOCAL_ONLY.includes(k)) pkg.data.kv[k] = await db.get('kv', k);
  pkg.data.rides = await db.all('rides');
  pkg.data.routes = (await db.all('routes')).map(r => ({ ...r, dem: undefined })); // Gelände wird bei Bedarf neu geladen
  pkg.data.workouts = await db.all('workouts');
  if (opt.shots !== false) for (const s of await db.all('shots')) pkg.data.shots.push({ ...s, blob: await blobToDataUrl(s.blob) });
  if (opt.secretsPass) { const sec = {}; for (const k of SECRET_KEYS) { const v = await kv.get(k, null); if (v != null) sec[k] = v; } pkg.secrets = await seal(sec, opt.secretsPass); }
  return JSON.stringify(pkg);
}
// Liest neue Pakete und alte Sicherungen ("trittwerk" Version 1). askPass() wird nur gefragt, wenn Zugangsdaten enthalten sind.
export async function importData(text, { askPass } = {}) {
  const raw = typeof text === 'string' ? JSON.parse(text) : text;
  let d, schema, secrets = null;
  if (raw.format === FORMAT) { d = raw.data; schema = raw.schema || 1; secrets = raw.secrets; }
  else if (raw.app === 'trittwerk') { d = raw; schema = 1; }
  else throw new Error('Keine VeloVerse-Sicherung');
  if (schema > SCHEMA) throw new Error('Die Sicherung stammt aus einer neueren App-Version, bitte die App aktualisieren');
  for (const k in d.kv || {}) if (!LOCAL_ONLY.includes(k) && !SECRET_KEYS.includes(k) && k !== 'schemaVersion') await db.put('kv', d.kv[k], k);
  for (const s of STORES) for (const v of d[s] || []) await db.put(s, v);
  for (const s of d.shots || []) await db.put('shots', { ...s, blob: await (await fetch(s.blob)).blob() });
  let logins = false;
  if (secrets && askPass) {
    const pass = await askPass(); if (pass) { const sec = await unseal(secrets, pass); for (const k of SECRET_KEYS) if (sec[k] != null) await kv.set(k, sec[k]); logins = true; }
  }
  await kv.set('schemaVersion', schema); await migrate();
  return { schema, logins, rides: (d.rides || []).length };
}
function blobToDataUrl(b) { return new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(b); }); }

/* ---------- Adapter ---------- */
// Datei: herunterladen / einlesen. Weitere Adapter (Cloud-Speicher, Server) registrieren sich hier.
export const adapters = new Map();
export function registerAdapter(a) { adapters.set(a.id, a); }
