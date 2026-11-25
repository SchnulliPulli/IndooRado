// Cloud-Speicher über OAuth direkt aus dem Browser: OneDrive, Google Drive, Dropbox.
// Jeder Dienst braucht eine eigene, kostenlose App-Registrierung (Client-ID). Zugangsdaten bleiben in diesem Browser.
// Alle Dienste bieten dieselben Grundfunktionen wie das NAS: mkdir, put, get, list, del (Pfade relativ zum App-Ordner).

export const PROVIDERS = {
  onedrive: {
    name: 'OneDrive', auth: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize', token: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    scope: 'Files.ReadWrite.AppFolder User.Read offline_access', extra: { response_mode: 'query' },
    where: 'OneDrive → Apps → VeloVerse',
  },
  gdrive: {
    name: 'Google Drive', auth: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token',
    scope: 'https://www.googleapis.com/auth/drive.file', extra: { access_type: 'offline', prompt: 'consent' }, secret: true,
    where: 'Google Drive → Meine Ablage → VeloVerse',
  },
  dropbox: {
    name: 'Dropbox', auth: 'https://www.dropbox.com/oauth2/authorize', token: 'https://api.dropboxapi.com/oauth2/token',
    scope: '', extra: { token_access_type: 'offline' },
    where: 'Dropbox → Apps → (Name deiner App)',
  },
};
export const isOAuth = mode => mode in PROVIDERS;
export const redirectUri = () => location.origin + location.pathname;

/* ---------- Anmeldung (Authorization Code mit PKCE) ---------- */
const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const rnd = n => b64url(crypto.getRandomValues(new Uint8Array(n)));
export async function startOAuth(mode, clientId, secret) {
  const P = PROVIDERS[mode]; if (!P) throw new Error('Unbekannter Dienst');
  if (!clientId) throw new Error('Bitte zuerst die Client-ID eintragen');
  if (P.secret && !secret) throw new Error('Google verlangt zusätzlich das Client-Secret');
  const verifier = rnd(48), challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))), state = 'vv-' + rnd(12);
  sessionStorage.setItem('vvOAuth', JSON.stringify({ mode, clientId, secret: secret || '', verifier, state, back: location.hash || '#/profile' }));
  const q = new URLSearchParams({ client_id: clientId, response_type: 'code', redirect_uri: redirectUri(), state, code_challenge: challenge, code_challenge_method: 'S256', ...P.extra });
  if (P.scope) q.set('scope', P.scope);
  location.href = P.auth + '?' + q;
}
// Nach der Rückleitung: Code gegen Zugang tauschen. Liefert die neue Konfiguration oder null, wenn die Adresse nicht zu uns gehört.
export async function finishOAuth() {
  const q = new URLSearchParams(location.search), st = q.get('state') || '';
  if (!st.startsWith('vv-')) return null;
  const pend = JSON.parse(sessionStorage.getItem('vvOAuth') || 'null'); sessionStorage.removeItem('vvOAuth');
  history.replaceState(null, '', location.pathname + (pend?.back || '#/profile'));
  if (!pend || pend.state !== st) throw new Error('Anmeldung abgebrochen (Sitzung abgelaufen), bitte erneut verbinden');
  if (q.get('error')) throw new Error(`${PROVIDERS[pend.mode].name}: ${q.get('error_description') || q.get('error')}`);
  const cfg = { mode: pend.mode, clientId: pend.clientId, secret: pend.secret || undefined, auto: true };
  await tokenRequest(cfg, { grant_type: 'authorization_code', code: q.get('code'), redirect_uri: redirectUri(), code_verifier: pend.verifier });
  try { cfg.account = await account(cfg); } catch (e) { }
  return cfg;
}
async function tokenRequest(cfg, params) {
  const P = PROVIDERS[cfg.mode];
  const body = new URLSearchParams({ client_id: cfg.clientId, ...params });
  if (P.secret && cfg.secret) body.set('client_secret', cfg.secret);
  if (cfg.mode === 'onedrive' && params.grant_type === 'refresh_token') body.set('scope', P.scope);
  const r = await fetch(P.token, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) { const e = new Error(`${P.name}: ${j.error_description || j.error_summary || j.error || 'Anmeldung fehlgeschlagen (HTTP ' + r.status + ')'}`); e.login = true; throw e; }
  cfg.access = j.access_token; cfg.exp = Date.now() + (j.expires_in || 3600) * 1000;
  if (j.refresh_token) cfg.refresh = j.refresh_token;
  return cfg;
}
// Zugang erneuern, kurz bevor er abläuft. onSave speichert die Konfiguration dauerhaft.
export async function fresh(cfg, onSave) {
  if (cfg.access && cfg.exp - 90000 > Date.now()) return;
  if (!cfg.refresh) { const e = new Error(`${PROVIDERS[cfg.mode].name}: Anmeldung abgelaufen, bitte neu verbinden`); e.login = true; throw e; }
  await tokenRequest(cfg, { grant_type: 'refresh_token', refresh_token: cfg.refresh });
  await onSave?.(cfg);
}

// Gemeinsamer Abruf mit Zugang; bei 401 einmal erneuern und wiederholen
function makeFetch(cfg, onSave) {
  return async function af(url, opt = {}, retry = true) {
    await fresh(cfg, onSave);
    const r = await fetch(url, { ...opt, headers: { Authorization: 'Bearer ' + cfg.access, ...(opt.headers || {}) } });
    if (r.status === 401 && retry && cfg.refresh) { cfg.exp = 0; return af(url, opt, false); }
    if (r.status === 401) { const e = new Error(`${PROVIDERS[cfg.mode].name}: Anmeldung abgelaufen, bitte neu verbinden`); e.login = true; throw e; }
    return r;
  };
}
const fail = async (r, what) => { let m = ''; try { const j = await r.clone().json(); m = j.error?.message || j.error_summary || j.error_description || ''; } catch (e) { } throw new Error(`${what}: HTTP ${r.status}${m ? ' – ' + m : ''}`); };
const sizeOf = body => body instanceof Blob ? body.size : new Blob([body]).size;

/* ---------- OneDrive (Microsoft Graph, App-Ordner) ---------- */
const GRAPH = 'https://graph.microsoft.com/v1.0/me/drive/special/approot';
const odp = rel => rel.replace(/\/+$/, '').split('/').filter(Boolean).map(encodeURIComponent).join('/');
function oneDrive(cfg, onSave) {
  const af = makeFetch(cfg, onSave);
  return {
    async mkdir(rel) {
      if (!rel) { const r = await af(GRAPH); if (!r.ok) await fail(r, 'App-Ordner'); return; }
      const r = await af(GRAPH + '/children', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: rel.replace(/\/+$/, ''), folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }) });
      if (!r.ok && r.status !== 409) await fail(r, 'Ordner ' + rel);
    },
    async put(rel, body, type) {
      if (sizeOf(body) < 4e6) { const r = await af(`${GRAPH}:/${odp(rel)}:/content`, { method: 'PUT', headers: { 'Content-Type': type || 'application/octet-stream' }, body }); if (!r.ok) await fail(r, rel); return; }
      // Große Dateien in Stücken hochladen
      const s = await af(`${GRAPH}:/${odp(rel)}:/createUploadSession`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'replace' } }) });
      if (!s.ok) await fail(s, rel);
      const { uploadUrl } = await s.json(), blob = body instanceof Blob ? body : new Blob([body]), CH = 320 * 1024 * 16;
      for (let o = 0; o < blob.size; o += CH) {
        const part = blob.slice(o, o + CH), r = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Range': `bytes ${o}-${o + part.size - 1}/${blob.size}` }, body: part });
        if (!r.ok) await fail(r, rel);
      }
    },
    async get(rel) {
      const r = await af(`${GRAPH}:/${odp(rel)}?select=id,@microsoft.graph.downloadUrl`);
      if (r.status === 404) return null; if (!r.ok) await fail(r, rel);
      const u = (await r.json())['@microsoft.graph.downloadUrl']; if (!u) return null;
      const d = await fetch(u); if (!d.ok) await fail(d, rel); return d.blob();
    },
    async list(rel) {
      const p = odp(rel); let url = (p ? `${GRAPH}:/${p}:/children` : `${GRAPH}/children`) + '?$select=name&$top=1000', out = [];
      while (url) { const r = await af(url); if (r.status === 404) return out; if (!r.ok) await fail(r, 'Liste ' + rel); const j = await r.json(); out.push(...j.value.map(x => x.name)); url = j['@odata.nextLink']; }
      return out;
    },
    async del(rel) { const r = await af(`${GRAPH}:/${odp(rel)}`, { method: 'DELETE' }); if (!r.ok && r.status !== 404) await fail(r, 'Löschen ' + rel); },
  };
}

/* ---------- Dropbox (App-Ordner) ---------- */
const DBX = 'https://api.dropboxapi.com/2/', DBC = 'https://content.dropboxapi.com/2/';
const dbArg = o => JSON.stringify(o).replace(/[\u007f-￿]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
const dbp = rel => { const p = rel.replace(/\/+$/, ''); return p ? '/' + p : ''; };
function dropbox(cfg, onSave) {
  const af = makeFetch(cfg, onSave);
  const api = (path, body) => af(DBX + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return {
    async mkdir(rel) { if (!rel) return; const r = await api('files/create_folder_v2', { path: dbp(rel), autorename: false }); if (!r.ok && r.status !== 409) await fail(r, 'Ordner ' + rel); },
    async put(rel, body) { const r = await af(DBC + 'files/upload', { method: 'POST', headers: { 'Dropbox-API-Arg': dbArg({ path: dbp(rel), mode: 'overwrite', mute: true }), 'Content-Type': 'application/octet-stream' }, body }); if (!r.ok) await fail(r, rel); },
    async get(rel) { const r = await af(DBC + 'files/download', { method: 'POST', headers: { 'Dropbox-API-Arg': dbArg({ path: dbp(rel) }) } }); if (r.status === 409) return null; if (!r.ok) await fail(r, rel); return r.blob(); },
    async list(rel) {
      let r = await api('files/list_folder', { path: dbp(rel), limit: 2000 }); if (r.status === 409) return []; if (!r.ok) await fail(r, 'Liste ' + rel);
      let j = await r.json(); const out = j.entries.map(e => e.name);
      while (j.has_more) { r = await api('files/list_folder/continue', { cursor: j.cursor }); if (!r.ok) await fail(r, 'Liste ' + rel); j = await r.json(); out.push(...j.entries.map(e => e.name)); }
      return out;
    },
    async del(rel) { const r = await api('files/delete_v2', { path: dbp(rel) }); if (!r.ok && r.status !== 409) await fail(r, 'Löschen ' + rel); },
  };
}

/* ---------- Google Drive (sichtbarer Ordner „VeloVerse“, nur von der App angelegte Dateien) ---------- */
const GD = 'https://www.googleapis.com/drive/v3/files', GU = 'https://www.googleapis.com/upload/drive/v3/files', FOLDER = 'application/vnd.google-apps.folder';
const gq = s => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
function gdrive(cfg, onSave) {
  const af = makeFetch(cfg, onSave), ids = new Map(); // "dir/name" -> id, "dir/" -> Ordner-ID
  const find = async (q) => { const out = []; let tok = ''; do { const r = await af(`${GD}?${new URLSearchParams({ q, fields: 'nextPageToken,files(id,name)', pageSize: '1000', spaces: 'drive', ...(tok ? { pageToken: tok } : {}) })}`); if (!r.ok) await fail(r, 'Suche'); const j = await r.json(); out.push(...j.files); tok = j.nextPageToken; } while (tok); return out; };
  const mkFolder = async (name, parent) => { const r = await af(GD + '?fields=id', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, mimeType: FOLDER, parents: [parent] }) }); if (!r.ok) await fail(r, 'Ordner ' + name); return (await r.json()).id; };
  const rootId = async () => {
    if (ids.has('/')) return ids.get('/');
    let id = cfg.rootId;
    if (!id) { const f = await find(`name=${gq('VeloVerse')} and mimeType=${gq(FOLDER)} and 'root' in parents and trashed=false`); id = f[0]?.id || await mkFolder('VeloVerse', 'root'); cfg.rootId = id; await onSave?.(cfg); }
    ids.set('/', id); return id;
  };
  const dirId = async (dir, create) => {
    if (!dir) return rootId();
    const k = dir + '/'; if (ids.has(k)) return ids.get(k);
    const root = await rootId(), f = await find(`name=${gq(dir)} and mimeType=${gq(FOLDER)} and ${gq(root)} in parents and trashed=false`);
    const id = f[0]?.id || (create ? await mkFolder(dir, root) : null); if (id) ids.set(k, id); return id;
  };
  const split = rel => { const p = rel.replace(/\/+$/, '').split('/'); const name = p.pop(); return [p.join('/'), name]; };
  const fileId = async rel => {
    if (ids.has(rel)) return ids.get(rel);
    const [dir, name] = split(rel), d = await dirId(dir, false); if (!d) return null;
    const f = await find(`name=${gq(name)} and ${gq(d)} in parents and trashed=false`); const id = f[0]?.id || null; if (id) ids.set(rel, id); return id;
  };
  return {
    async mkdir(rel) { await dirId(rel.replace(/\/+$/, ''), true); },
    async put(rel, body, type) {
      const id = await fileId(rel);
      if (id) { const r = await af(`${GU}/${id}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': type || 'application/octet-stream' }, body }); if (r.status === 404) ids.delete(rel); else { if (!r.ok) await fail(r, rel); return; } }
      const [dir, name] = split(rel), parent = await dirId(dir, true), bd = 'vv' + rnd(9);
      const data = new Blob([`--${bd}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, parents: [parent] })}\r\n--${bd}\r\nContent-Type: ${type || 'application/octet-stream'}\r\n\r\n`, body, `\r\n--${bd}--`]);
      const r = await af(`${GU}?uploadType=multipart&fields=id`, { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${bd}` }, body: data });
      if (!r.ok) await fail(r, rel); ids.set(rel, (await r.json()).id);
    },
    async get(rel) { const id = await fileId(rel); if (!id) return null; const r = await af(`${GD}/${id}?alt=media`); if (r.status === 404) { ids.delete(rel); return null; } if (!r.ok) await fail(r, rel); return r.blob(); },
    async list(rel) {
      const dir = rel.replace(/\/+$/, ''), d = await dirId(dir, false); if (!d) return [];
      const f = await find(`${gq(d)} in parents and trashed=false`);
      for (const x of f) ids.set((dir ? dir + '/' : '') + x.name, x.id);
      return f.map(x => x.name);
    },
    async del(rel) { const id = await fileId(rel); if (!id) return; const r = await af(`${GD}/${id}`, { method: 'DELETE' }); ids.delete(rel); if (!r.ok && r.status !== 404) await fail(r, 'Löschen ' + rel); },
  };
}

const cache = new WeakMap();
export function backend(cfg, onSave) {
  let b = cache.get(cfg); if (b) return b;
  b = { onedrive: oneDrive, dropbox, gdrive }[cfg.mode](cfg, onSave); cache.set(cfg, b); return b;
}
// Name des verbundenen Kontos für die Anzeige
export async function account(cfg) {
  const af = makeFetch(cfg);
  if (cfg.mode === 'onedrive') { const j = await (await af('https://graph.microsoft.com/v1.0/me')).json(); return j.displayName || j.userPrincipalName || ''; }
  if (cfg.mode === 'dropbox') { const j = await (await af(DBX + 'users/get_current_account', { method: 'POST' })).json(); return j.name?.display_name || j.email || ''; }
  if (cfg.mode === 'gdrive') { const j = await (await af('https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress)')).json(); return j.user?.displayName || j.user?.emailAddress || ''; }
  return '';
}
