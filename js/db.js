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
// Alles Lokale entfernen: Datenbank, App-Cache, Service Worker, Browser-Speicher (Daten auf dem NAS bleiben)
export async function wipeAll() {
  try { (await dbp)?.close(); } catch (e) { }
  dbp = null;
  await new Promise(res => { const r = indexedDB.deleteDatabase(NAME); r.onsuccess = r.onerror = r.onblocked = () => res(); });
  try { for (const k of await caches.keys()) await caches.delete(k); } catch (e) { }
  try { for (const r of await navigator.serviceWorker?.getRegistrations?.() || []) await r.unregister(); } catch (e) { }
  try { localStorage.clear(); sessionStorage.clear(); } catch (e) { }
}
export async function wipe() { for (const s of ['kv', 'rides', 'shots', 'routes', 'workouts']) await db.clear(s); }
