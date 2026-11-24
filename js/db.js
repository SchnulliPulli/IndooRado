// Dauerhafte Speicherung im Browser (IndexedDB)
// Stores: kv (Einstellungen, Profil, Fortschritt), rides, shots (Screenshots), routes, workouts
const NAME = 'trittwerk', VER = 1;
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

export const db = {
  get: (s, k) => tx(s, 'readonly', o => o.get(k)),
  put: (s, v, k) => tx(s, 'readwrite', o => k === undefined ? o.put(v) : o.put(v, k)),
  del: (s, k) => tx(s, 'readwrite', o => o.delete(k)),
  all: (s) => tx(s, 'readonly', o => o.getAll()),
  keys: (s) => tx(s, 'readonly', o => o.getAllKeys()),
  clear: (s) => tx(s, 'readwrite', o => o.clear()),
  byIndex: (s, idx, v) => tx(s, 'readonly', o => o.index(idx).getAll(v)),
  delByIndex: (s, idx, v) => tx(s, 'readwrite', async o => {
    const keys = await req(o.index(idx).getAllKeys(v));
    for (const k of keys) o.delete(k);
  }),
};

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

// Komplette Sicherung als JSON (Screenshots als Data-URL)
export async function backup() {
  const out = { app: 'trittwerk', version: 1, date: new Date().toISOString(), kv: {}, rides: [], shots: [], routes: [], workouts: [] };
  for (const k of await db.keys('kv')) out.kv[k] = await db.get('kv', k);
  out.rides = await db.all('rides');
  out.routes = await db.all('routes');
  out.workouts = await db.all('workouts');
  for (const s of await db.all('shots')) out.shots.push({ ...s, blob: await blobToDataUrl(s.blob) });
  return JSON.stringify(out);
}
export async function restore(text) {
  const d = JSON.parse(text);
  if (d.app !== 'trittwerk') throw new Error('Keine Trittwerk-Sicherung');
  for (const k in d.kv) await db.put('kv', d.kv[k], k);
  for (const s of ['rides', 'routes', 'workouts']) for (const v of d[s] || []) await db.put(s, v);
  for (const s of d.shots || []) await db.put('shots', { ...s, blob: await (await fetch(s.blob)).blob() });
  return d;
}
export async function wipe() { for (const s of ['kv', 'rides', 'shots', 'routes', 'workouts']) await db.clear(s); }
function blobToDataUrl(b) { return new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(b); }); }
