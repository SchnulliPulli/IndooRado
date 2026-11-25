// Abgleich mit dem NAS, zusätzlich zum Browser-Speicher.
// Zwei Wege: Synology-Anmeldung (DSM-Konto inkl. 2FA, File Station API) oder WebDAV.
// Aufbau im Ordner: state.json (Einstellungen, Fortschritt, eigene Strecken/Workouts), rides/<id>.json, shots/<id>.jpg
import { db, kv } from './db.js';
import { bus } from './util.js';

const LOCAL_ONLY = new Set(['sync', 'syncMeta', 'demo', 'strava', 'musicFiles']);
export const sync = { cfg: null, busy: false, last: null, error: null, dirsOk: false, needLogin: false };

export async function loadSync() { sync.cfg = await kv.get('sync', null); sync.last = (await kv.get('syncMeta', {})).at || null; }
export async function saveSyncCfg(cfg) { sync.cfg = cfg; sync.dirsOk = false; await kv.set('sync', cfg); }
const configured = () => !!(sync.cfg && (sync.cfg.mode === 'dsm' ? sync.cfg.host && sync.cfg.folder : sync.cfg.url));

/* ---------- Synology DSM (File Station API) ---------- */
const DSM_ERR = { 400: 'Benutzername oder Passwort falsch', 401: 'Konto deaktiviert', 402: 'Keine Berechtigung', 403: '2FA-Code nötig', 404: '2FA-Code falsch', 406: 'Für dieses Konto muss erst 2FA eingerichtet werden', 407: 'IP-Adresse gesperrt (zu viele Fehlversuche)', 408: 'Ordner oder Datei nicht gefunden', 119: 'Anmeldung abgelaufen', 106: 'Anmeldung abgelaufen', 105: 'Keine Berechtigung für diesen Ordner', 1100: 'Ordner konnte nicht angelegt werden' };
export class DsmError extends Error { constructor(code) { super(DSM_ERR[code] || 'DSM-Fehler ' + code); this.code = code; } }
const dsmBase = () => sync.cfg.host.replace(/\/+$/, '') + '/webapi/entry.cgi';
const enc = v => typeof v === 'string' ? v : JSON.stringify(v);
async function dsmCall(params, { post = false, body = null } = {}) {
  const q = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, enc(v)]));
  if (sync.cfg.sid) q.set('_sid', sync.cfg.sid);
  const r = post ? await fetch(dsmBase() + (body ? '?' + q : ''), { method: 'POST', body: body || q, cache: 'no-store' }) : await fetch(dsmBase() + '?' + q, { cache: 'no-store' });
  return r;
}
async function dsmJson(params, opt) {
  const r = await dsmCall(params, opt); const j = await r.json().catch(() => null);
  if (!j) throw new Error('Unerwartete Antwort vom NAS (HTTP ' + r.status + ')');
  if (!j.success) { const c = j.error?.code; if (c === 119 || c === 106 || c === 107) { sync.cfg.sid = null; sync.needLogin = true; } throw new DsmError(c); }
  return j.data || {};
}
// Anmeldung mit DSM-Konto. Bei aktivierter 2FA zuerst ohne Code (Fehler 403), dann mit Code.
// "Gerät merken" (device token) erspart den Code bei späteren Anmeldungen.
// NAS-Adresse vereinheitlichen: immer https, Standardport 443 (kein Port nötig), ohne Pfad am Ende
export function normalizeHost(v) {
  let s = String(v || '').trim();
  if (!s) return s;
  if (!/^[a-z]+:\/\//i.test(s)) s = 'https://' + s;
  s = s.replace(/^http:\/\//i, 'https://');
  try { const u = new URL(s); if (u.port === '443') u.port = ''; return (u.origin + u.pathname).replace(/\/+$/, ''); } catch (e) { return s.replace(/\/+$/, ''); }
}
export async function dsmLogin({ host, folder, user, pass, otp, remember, auto }) {
  const prev = sync.cfg || {};
  host = location.protocol === 'https:' ? normalizeHost(host) : host.trim().replace(/\/+$/, ''); // lokal (http) zum Testen unverändert
  sync.cfg = { mode: 'dsm', host, folder: '/' + folder.trim().replace(/^\/+|\/+$/g, ''), user: user.trim(), auto: !!auto, remember: !!remember, did: prev.host === host ? prev.did : null, sid: null };
  const p = { api: 'SYNO.API.Auth', version: '6', method: 'login', account: user.trim(), passwd: pass, session: 'FileStation', format: 'sid', enable_device_token: 'yes', device_name: 'VeloVerse' };
  if (otp) p.otp_code = otp.trim();
  if (sync.cfg.did) p.device_id = sync.cfg.did;
  try {
    const d = await dsmJson(p, { post: true });
    sync.cfg.sid = d.sid; if (d.did || d.device_id) sync.cfg.did = d.did || d.device_id;
    if (remember) sync.cfg.pass = pass; // nur auf Wunsch, damit abgelaufene Sitzungen ohne Nachfrage erneuert werden
    sync.needLogin = false; sync.dirsOk = false;
    await kv.set('sync', sync.cfg);
    return true;
  } catch (e) { if (e.code !== 403 && e.code !== 404) { /* Konfiguration trotzdem merken */ await kv.set('sync', { ...sync.cfg, sid: null }); } throw e; }
}
export async function dsmLogout() {
  try { if (sync.cfg?.sid) await dsmJson({ api: 'SYNO.API.Auth', version: '6', method: 'logout', session: 'FileStation' }); } catch (e) { }
  if (sync.cfg) { sync.cfg.sid = null; delete sync.cfg.pass; await kv.set('sync', sync.cfg); }
}
async function ensureSid() {
  if (sync.cfg.sid) return;
  if (sync.cfg.pass) { await dsmLogin({ ...sync.cfg, pass: sync.cfg.pass, remember: true }); return; }
  sync.needLogin = true; throw new Error('Bitte unter Profil beim NAS anmelden');
}
const join = (...p) => p.join('/').replace(/\/+/g, '/');
const DSM = {
  async mkdir(rel) {
    const full = join(sync.cfg.folder, rel).replace(/\/$/, ''), i = full.lastIndexOf('/');
    try { await dsmJson({ api: 'SYNO.FileStation.CreateFolder', version: '2', method: 'create', folder_path: [full.slice(0, i) || '/'], name: [full.slice(i + 1)], force_parent: 'true' }); }
    catch (e) { if (e.code !== 1100) throw e; }
  },
  async put(rel, body, type) {
    const full = join(sync.cfg.folder, rel), i = full.lastIndexOf('/');
    const fd = new FormData(); fd.append('path', full.slice(0, i)); fd.append('create_parents', 'true'); fd.append('overwrite', 'true');
    fd.append('file', body instanceof Blob ? body : new Blob([body], { type: type || 'application/octet-stream' }), full.slice(i + 1));
    await dsmJson({ api: 'SYNO.FileStation.Upload', version: '2', method: 'upload' }, { post: true, body: fd });
  },
  async get(rel) {
    const r = await dsmCall({ api: 'SYNO.FileStation.Download', version: '2', method: 'download', path: [join(sync.cfg.folder, rel)], mode: 'open' });
    const t = r.headers.get('content-type') || '';
    if (/json/.test(t) && !/\.json$/.test(rel)) { const j = await r.json(); if (!j.success) throw new DsmError(j.error?.code); }
    if (!r.ok) return null;
    const b = await r.blob();
    // Fehler kommen als kleines JSON zurück
    if (b.size < 200) { try { const j = JSON.parse(await b.text()); if (j && j.success === false) { if (j.error?.code === 408) return null; if ([119, 106].includes(j.error?.code)) { sync.cfg.sid = null; sync.needLogin = true; } throw new DsmError(j.error?.code); } } catch (e) { if (e instanceof DsmError) throw e; } }
    return b;
  },
  async list(rel) {
    try { const d = await dsmJson({ api: 'SYNO.FileStation.List', version: '2', method: 'list', folder_path: join(sync.cfg.folder, rel).replace(/\/$/, ''), limit: '5000' }); return (d.files || []).map(f => f.name); }
    catch (e) { if (e.code === 408) return []; throw e; }
  },
  async del(rel) { try { await dsmJson({ api: 'SYNO.FileStation.Delete', version: '2', method: 'start', path: [join(sync.cfg.folder, rel)] }); } catch (e) { } },
};

/* ---------- WebDAV ---------- */
const b64 = s => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
function davBase() { let u = sync.cfg.url.trim(); if (!u.endsWith('/')) u += '/'; return u; }
const dav = (method, path, body, headers = {}) => fetch(davBase() + path, { method, body, headers: { Authorization: 'Basic ' + b64(sync.cfg.user + ':' + sync.cfg.pass), ...headers }, cache: 'no-store' });
async function davOk(r, what) { if (!r.ok && r.status !== 207) throw new Error(`${what}: HTTP ${r.status}${r.status === 401 ? ' (Benutzer oder Passwort falsch)' : r.status === 404 ? ' (Ordner nicht gefunden)' : ''}`); return r; }
const DAV = {
  async mkdir(rel) { const r = await dav('MKCOL', rel); if (!(r.ok || r.status === 405 || r.status === 301)) throw new Error(`Ordner ${rel} anlegen: HTTP ${r.status}`); },
  async put(rel, body, type) { await davOk(await dav('PUT', rel, body, { 'Content-Type': type || 'application/octet-stream' }), rel); },
  async get(rel) { const r = await dav('GET', rel); if (r.status === 404) return null; await davOk(r, rel); return r.blob(); },
  async list(rel) {
    const r = await dav('PROPFIND', rel, '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:getcontentlength/></d:prop></d:propfind>', { Depth: '1', 'Content-Type': 'application/xml' });
    if (r.status === 404) return [];
    await davOk(r, 'Liste ' + rel);
    const doc = new DOMParser().parseFromString(await r.text(), 'application/xml');
    return [...doc.getElementsByTagNameNS('DAV:', 'href')].map(h => decodeURIComponent(h.textContent).replace(/\/$/, '').split('/').pop()).filter(Boolean);
  },
  async del(rel) { await dav('DELETE', rel); },
};
const B = () => sync.cfg.mode === 'dsm' ? DSM : DAV;
async function prep() { if (sync.cfg.mode === 'dsm') await ensureSid(); }

// Verbindung prüfen: Ordner anlegen, Testdatei schreiben, lesen, löschen
export async function testConnection() {
  await prep();
  try { await B().mkdir(''); } catch (e) { if (sync.cfg.mode === 'dsm') throw e; }
  await B().put('.veloverse-test', 'ok', 'text/plain');
  const b = await B().get('.veloverse-test');
  if (!b || (await b.text()).trim() !== 'ok') throw new Error('Testdatei ließ sich nicht zurücklesen');
  await B().del('.veloverse-test');
  return true;
}

async function stateObj() {
  const out = { app: 'trittwerk', savedAt: new Date().toISOString(), kv: {}, routes: (await db.all('routes')).map(r => ({ ...r, dem: undefined })), workouts: await db.all('workouts') };
  for (const k of await db.keys('kv')) if (!LOCAL_ONLY.has(k)) out.kv[k] = await db.get('kv', k);
  return out;
}

// Browser -> NAS: Zustand immer, Fahrten und Fotos nur, wenn sie dort fehlen
export async function push() {
  await prep();
  if (!sync.dirsOk) { await B().mkdir(''); await B().mkdir('rides'); await B().mkdir('shots'); sync.dirsOk = true; }
  const st = await stateObj();
  await B().put('state.json', JSON.stringify(st), 'application/json');
  const haveR = new Set(await B().list('rides/')), haveS = new Set(await B().list('shots/'));
  let n = 0;
  for (const r of await db.all('rides')) if (!haveR.has(r.id + '.json')) { await B().put('rides/' + r.id + '.json', JSON.stringify(r), 'application/json'); n++; }
  for (const s of await db.all('shots')) if (!haveS.has(s.id + '.jpg')) { await B().put('shots/' + s.id + '.jpg', s.blob, 'image/jpeg'); await B().put('shots/' + s.id + '.json', JSON.stringify({ ...s, blob: undefined }), 'application/json'); }
  return { savedAt: st.savedAt, rides: n };
}
async function readState() { const b = await B().get('state.json'); if (!b) return null; const st = JSON.parse(await b.text()); if (st.app !== 'trittwerk') throw new Error('state.json gehört nicht zu VeloVerse'); return st; }

// NAS -> Browser: Zustand übernehmen, fehlende Fahrten und Fotos laden
export async function pull(st) {
  await prep();
  st = st || await readState(); if (!st) return null;
  for (const k in st.kv) await db.put('kv', st.kv[k], k);
  for (const x of st.routes || []) { const loc = await db.get('routes', x.id); await db.put('routes', loc?.dem ? { ...x, dem: loc.dem } : x); }
  for (const x of st.workouts || []) await db.put('workouts', x);
  const haveR = new Set((await db.keys('rides')).map(String)), haveS = new Set((await db.keys('shots')).map(String));
  let n = 0;
  for (const f of await B().list('rides/')) { const id = f.replace(/\.json$/, ''); if (f.endsWith('.json') && !haveR.has(id)) { const b = await B().get('rides/' + f); if (b) { await db.put('rides', JSON.parse(await b.text())); n++; } } }
  for (const f of await B().list('shots/')) {
    if (!f.endsWith('.json')) continue; const id = f.replace(/\.json$/, ''); if (haveS.has(id)) continue;
    const m = await B().get('shots/' + f), img = await B().get('shots/' + id + '.jpg');
    if (m && img) await db.put('shots', { ...JSON.parse(await m.text()), blob: img });
  }
  return { savedAt: st.savedAt, rides: n };
}

async function mark() { sync.last = new Date().toISOString(); sync.error = null; await kv.set('syncMeta', { at: sync.last }); bus.emit('sync'); }
async function guarded(fn) {
  if (!configured() || sync.busy) return null;
  sync.busy = true; bus.emit('sync');
  try { const res = await fn(); await mark(); return res; }
  catch (e) { sync.error = e.message === 'Failed to fetch' ? 'NAS nicht erreichbar oder Zugriff von dieser Adresse nicht freigegeben (siehe Einrichtung)' : e.message; bus.emit('sync'); throw e; }
  finally { sync.busy = false; bus.emit('sync'); }
}
export const pushNow = () => guarded(push);
export const pullNow = () => guarded(() => pull());

// Beim Start: ist der Stand auf dem NAS neuer als der letzte Abgleich, erst holen, dann hochladen
export async function autoSync() {
  if (!configured() || !sync.cfg.auto) return;
  if (sync.cfg.mode === 'dsm' && !sync.cfg.sid && !sync.cfg.pass) { sync.needLogin = true; bus.emit('sync'); return; }
  return guarded(async () => {
    await prep();
    const st = await readState().catch(() => null);
    let pulled = null;
    if (st && (!sync.last || st.savedAt > sync.last)) pulled = await pull(st);
    await push();
    return pulled;
  });
}
// Nach Änderungen verzögert hochladen (nicht während eines Abgleichs)
let pend = null;
bus.on('dbchange', ({ s, k }) => { if (sync.busy || (s === 'kv' && LOCAL_ONLY.has(k))) return; schedulePush(s === 'rides' ? 1500 : 8000); });
export function schedulePush(ms = 4000) {
  if (!configured() || !sync.cfg.auto || sync.needLogin) return;
  clearTimeout(pend); pend = setTimeout(() => pushNow().catch(() => { }), ms);
}
