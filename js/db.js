// Dauerhafte Speicherung im Browser (IndexedDB)
// Stores: kv (Einstellungen, Profil, Fortschritt), rides, shots (Screenshots), routes, workouts
import { bus } from './util.js';
// interner Name bleibt, damit vorhandene Daten erhalten bleiben; weitere Online-Konten haben eigene Datenbanken (siehe online/client.js)
const NAME = (() => { try { return localStorage.getItem('vvDb') || 'trittwerk'; } catch (e) { return 'trittwerk'; } })(), VER = 1;
let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const r = indexedDB.open(NAME, VER);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      if (!db.objectStoreNames.contains('rides')) db.createObjectStore('rides', { keyPath: 'id' }).createIndex('date', 'date');
      if (!db.objectStoreNames.contains('shots')) db.createObjectStore('shots', { keyPath: 'id' }).createIndex('ride', 'rideId');
      if (!db.objectStoreNames.contains('routes')) db.createObjectStore('routes', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('workouts')) db.createObjectStore('workouts', { keyPath: 'id' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
async function tx(store, mode, fn) {
  const db = await open();
  const t = db.transaction(store, mode);
  const out = fn(t.objectStore(store));
  const v = out instanceof IDBRequest ? await req(out) : await out;
  await new Promise((res, rej) => { t.oncomplete = res; t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });
  return v;
}

const changed = (s, k) => bus.emit('dbchange', { s, k });
export const db = {
  get: (s, k) => tx(s, 'readonly', o => o.get(k)),
  put: (s, v, k) => tx(s, 'readwrite', o => k === undefined ? o.put(v) : o.put(v, k)).then(r => { changed(s, k); return r; }),
  del: (s, k) => tx(s, 'readwrite', o => o.delete(k)).then(r => { changed(s, k); return r; }),
  all: (s) => tx(s, 'readonly', o => o.getAll()),
  keys: (s) => tx(s, 'readonly', o => o.getAllKeys()),
  clear: (s) => tx(s, 'readwrite', o => o.clear()),
  byIndex: (s, idx, v) => tx(s, 'readonly', o => o.index(idx).getAll(v)),
  delByIndex: (s, idx, v) => tx(s, 'readwrite', async o => {
    const keys = await req(o.index(idx).getAllKeys(v));
    for (const k of keys) o.delete(k);
  }),
};

// Gelöschten Eintrag merken, damit er beim Abgleich auch auf anderen Geräten und in der Cloud verschwindet
export async function tomb(key, id) { const l = await kv.get(key, []); if (!l.includes(id)) await kv.set(key, [...l, id]); }
export const kv = {
  get: async (k, d) => { try { const v = await db.get('kv', k); return v === undefined ? d : v; } catch (e) { return d; } },
  set: (k, v) => db.put('kv', v, k),
  del: k => db.del('kv', k),
};

// Speicher als dauerhaft markieren, damit der Browser nichts aufräumt
export async function persist() {
  try { if (navigator.storage?.persist) return await navigator.storage.persist(); } catch (e) { }
  return false;
}
export async function usage() {
  try { return await navigator.storage.estimate(); } catch (e) { return null; }
}

// Sicherung und Wiederherstellung: Format und Versionierung liegen in store.js
export async function backup(opt) { return (await import('./store.js')).exportData(opt); }
export async function restore(text, opt) { return (await import('./store.js')).importData(text, opt); }
// Werkseinstellungen: ALLES Lokale entfernen – alle Datenbanken (auch Familienprofile und weitere Konten), App-Cache,
// Service Worker, Browser-Speicher und die Anmeldung auf diesem Gerät. Danach neu laden, damit auch nichts im
// Arbeitsspeicher der laufenden App übrig bleibt. Online-Daten im Konto und auf dem NAS bleiben unberührt.
export async function wipeAll() {
  window.__wiping = true; // ab jetzt nichts mehr speichern
  try { const O = await import('./online/client.js'); if (O.loggedIn?.()) await Promise.race([O.client().then(sb => sb.auth.signOut({ scope: 'local' })), new Promise(r => setTimeout(r, 1500))]); } catch (e) { }
  try { (await dbp)?.close(); } catch (e) { }
  dbp = null;
  const names = new Set([NAME, 'trittwerk']);
  try { for (const d of await indexedDB.databases?.() || []) if (d.name) names.add(d.name); } catch (e) { }
  try { for (const v of Object.values(JSON.parse(localStorage.getItem('vvAcctDb') || '{}'))) names.add(v); } catch (e) { }
  try { for (const m of JSON.parse(localStorage.getItem('vvFamily') || '[]')) if (m.db) names.add(m.db); } catch (e) { }
  await Promise.all([...names].map(n => new Promise(res => { const r = indexedDB.deleteDatabase(n); r.onsuccess = r.onerror = r.onblocked = () => res(); setTimeout(res, 3000); })));
  try { for (const k of await caches.keys()) await caches.delete(k); } catch (e) { }
  try { for (const r of await navigator.serviceWorker?.getRegistrations?.() || []) await r.unregister(); } catch (e) { }
  try { const d = await navigator.storage?.getDirectory?.(); if (d) for await (const [n] of d.entries()) await d.removeEntry(n, { recursive: true }); } catch (e) { }
  try { localStorage.clear(); sessionStorage.clear(); } catch (e) { }
  // Laufende Teile der App dürfen bis zum Neuladen nichts mehr zurückschreiben
  try { Storage.prototype.setItem = () => { }; } catch (e) { }
}
export async function wipe() { for (const s of ['kv', 'rides', 'shots', 'routes', 'workouts']) await db.clear(s); }
