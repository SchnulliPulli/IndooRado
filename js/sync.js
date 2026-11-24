// Abgleich mit einem WebDAV-Ordner (z. B. Synology "WebDAV Server"), zusätzlich zum Browser-Speicher.
// Aufbau im Ordner: state.json (Einstellungen, Fortschritt, eigene Strecken/Workouts), rides/<id>.json, shots/<id>.jpg
import { db, kv } from './db.js';
import { bus } from './util.js';

const LOCAL_ONLY = new Set(['sync', 'syncMeta', 'demo', 'strava']);
export const sync = { cfg: null, busy: false, last: null, error: null, dirsOk: false };

export async function loadSync() { sync.cfg = await kv.get('sync', null); sync.last = (await kv.get('syncMeta', {})).at || null; }
export async function saveSyncCfg(cfg) { sync.cfg = cfg; sync.dirsOk = false; await kv.set('sync', cfg); }

const b64 = s => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
function base() { let u = sync.cfg.url.trim(); if (!u.endsWith('/')) u += '/'; return u; }
async function dav(method, path, body, headers = {}) {
  const c = sync.cfg;
  return fetch(base() + path, { method, body, headers: { Authorization: 'Basic ' + b64(c.user + ':' + c.pass), ...headers }, cache: 'no-store' });
}
async function ok(r, what) { if (!r.ok && r.status !== 207) throw new Error(`${what}: HTTP ${r.status}${r.status === 401 ? ' (Benutzer oder Passwort falsch)' : r.status === 404 ? ' (Ordner nicht gefunden)' : ''}`); return r; }
async function mkcol(path) { const r = await dav('MKCOL', path); if (!(r.ok || r.status === 405 || r.status === 301)) throw new Error(`Ordner ${path} anlegen: HTTP ${r.status}`); }
async function list(path) {
  const r = await dav('PROPFIND', path, '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:getcontentlength/></d:prop></d:propfind>', { Depth: '1', 'Content-Type': 'application/xml' });
  if (r.status === 404) return [];
  await ok(r, 'Liste ' + path);
  const doc = new DOMParser().parseFromString(await r.text(), 'application/xml');
  return [...doc.getElementsByTagNameNS('DAV:', 'href')].map(h => decodeURIComponent(h.textContent).replace(/\/$/, '').split('/').pop()).filter(Boolean);
}

// Verbindung prüfen: Ordner anlegen, Testdatei schreiben, lesen, löschen
export async function testConnection() {
  try { await mkcol(''); } catch (e) { /* Ordner existiert evtl. schon */ }
  await ok(await dav('PUT', '.windschatten-test', 'ok', { 'Content-Type': 'text/plain' }), 'Schreiben');
  const r = await ok(await dav('GET', '.windschatten-test'), 'Lesen');
  if ((await r.text()).trim() !== 'ok') throw new Error('Lesen lieferte falschen Inhalt');
  await dav('DELETE', '.windschatten-test');
  return true;
}

async function stateObj() {
  const out = { app: 'trittwerk', savedAt: new Date().toISOString(), kv: {}, routes: await db.all('routes'), workouts: await db.all('workouts') };
  for (const k of await db.keys('kv')) if (!LOCAL_ONLY.has(k)) out.kv[k] = await db.get('kv', k);
  return out;
}

// Browser -> NAS: Zustand immer, Fahrten und Fotos nur, wenn sie dort fehlen
export async function push() {
  if (!sync.dirsOk) { await mkcol(''); await mkcol('rides'); await mkcol('shots'); sync.dirsOk = true; }
  const st = await stateObj();
  await ok(await dav('PUT', 'state.json', JSON.stringify(st), { 'Content-Type': 'application/json' }), 'state.json');
  const haveR = new Set(await list('rides/')), haveS = new Set(await list('shots/'));
  let n = 0;
  for (const r of await db.all('rides')) if (!haveR.has(r.id + '.json')) { await ok(await dav('PUT', 'rides/' + r.id + '.json', JSON.stringify(r), { 'Content-Type': 'application/json' }), 'Fahrt'); n++; }
  for (const s of await db.all('shots')) if (!haveS.has(s.id + '.jpg')) { await ok(await dav('PUT', 'shots/' + s.id + '.jpg', s.blob, { 'Content-Type': 'image/jpeg' }), 'Foto'); await dav('PUT', 'shots/' + s.id + '.json', JSON.stringify({ ...s, blob: undefined }), { 'Content-Type': 'application/json' }); }
  return { savedAt: st.savedAt, rides: n };
}

// NAS -> Browser: Zustand übernehmen, fehlende Fahrten und Fotos laden
export async function pull() {
  const r = await dav('GET', 'state.json');
  if (r.status === 404) return null;
  await ok(r, 'state.json');
  const st = await r.json();
  if (st.app !== 'trittwerk') throw new Error('state.json gehört nicht zu Windschatten');
  for (const k in st.kv) await db.put('kv', st.kv[k], k);
  for (const x of st.routes || []) await db.put('routes', x);
  for (const x of st.workouts || []) await db.put('workouts', x);
  const haveR = new Set((await db.keys('rides')).map(String)), haveS = new Set((await db.keys('shots')).map(String));
  let n = 0;
  for (const f of await list('rides/')) { const id = f.replace(/\.json$/, ''); if (f.endsWith('.json') && !haveR.has(id)) { const rr = await ok(await dav('GET', 'rides/' + f), 'Fahrt'); await db.put('rides', await rr.json()); n++; } }
  for (const f of await list('shots/')) {
    if (!f.endsWith('.json')) continue; const id = f.replace(/\.json$/, ''); if (haveS.has(id)) continue;
    const meta = await (await ok(await dav('GET', 'shots/' + f), 'Foto-Info')).json(), img = await (await ok(await dav('GET', 'shots/' + id + '.jpg'), 'Foto')).blob();
    await db.put('shots', { ...meta, blob: img });
  }
  return { savedAt: st.savedAt, rides: n };
}

async function mark() { sync.last = new Date().toISOString(); sync.error = null; await kv.set('syncMeta', { at: sync.last }); bus.emit('sync'); }
async function guarded(fn) {
  if (!sync.cfg?.url || sync.busy) return null;
  sync.busy = true; bus.emit('sync');
  try { const res = await fn(); await mark(); return res; }
  catch (e) { sync.error = e.message === 'Failed to fetch' ? 'NAS nicht erreichbar oder CORS nicht freigegeben' : e.message; bus.emit('sync'); throw e; }
  finally { sync.busy = false; bus.emit('sync'); }
}
export const pushNow = () => guarded(push);
export const pullNow = () => guarded(pull);

// Beim Start: ist der Stand auf dem NAS neuer als der letzte Abgleich, erst holen, dann hochladen
export async function autoSync() {
  if (!sync.cfg?.url || !sync.cfg.auto) return;
  return guarded(async () => {
    const r = await dav('GET', 'state.json');
    let pulled = null;
    if (r.ok) { const st = await r.json(); if (!sync.last || st.savedAt > sync.last) pulled = await pull(); }
    await push();
    return pulled;
  });
}
// Nach Änderungen verzögert hochladen (nicht während eines Abgleichs)
let pend = null;
bus.on('dbchange', ({ s, k }) => { if (sync.busy || (s === 'kv' && LOCAL_ONLY.has(k))) return; schedulePush(s === 'rides' ? 1500 : 8000); });
export function schedulePush(ms = 4000) {
  if (!sync.cfg?.url || !sync.cfg.auto) return;
  clearTimeout(pend); pend = setTimeout(() => pushNow().catch(() => { }), ms);
}
