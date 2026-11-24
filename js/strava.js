// Direkte Strava-Anbindung mit eigener Strava-API-App des Nutzers.
// Client-ID, Secret und Tokens bleiben nur in diesem Browser (kv 'strava'), sie werden nicht zum NAS übertragen.
import { kv } from './db.js';
import { toFit } from './export.js';
import { stravaTitle, stravaText } from './share.js';

export const strava = { cfg: null };
export async function loadStrava() { strava.cfg = await kv.get('strava', null); return strava.cfg; }
const save = () => kv.set('strava', strava.cfg);
export const connected = () => !!strava.cfg?.refresh;
export const redirectUri = () => location.origin + location.pathname;

export async function setApp(clientId, clientSecret, auto) {
  strava.cfg = { ...(strava.cfg || {}), clientId: String(clientId).trim(), clientSecret: String(clientSecret).trim(), auto: !!auto };
  await save();
}
export async function setAuto(on) { if (strava.cfg) { strava.cfg.auto = on; await save(); } }
export async function disconnect() {
  try { if (strava.cfg?.access) await fetch('https://www.strava.com/oauth/deauthorize', { method: 'POST', headers: { Authorization: 'Bearer ' + strava.cfg.access } }); } catch (e) { }
  strava.cfg = strava.cfg ? { clientId: strava.cfg.clientId, clientSecret: strava.cfg.clientSecret, auto: strava.cfg.auto } : null; await save();
}

// Schritt 1: zur Strava-Anmeldung weiterleiten
export function authorize() {
  const c = strava.cfg; if (!c?.clientId) throw new Error('Client-ID fehlt');
  sessionStorage.setItem('stravaReturn', location.hash || '#/profile');
  const u = new URL('https://www.strava.com/oauth/authorize');
  u.search = new URLSearchParams({ client_id: c.clientId, redirect_uri: redirectUri(), response_type: 'code', approval_prompt: 'auto', scope: 'activity:write,read' });
  location.href = u.toString();
}
// Schritt 2: nach der Rückkehr den Code gegen Tokens tauschen (beim App-Start aufrufen)
export async function handleRedirect() {
  const q = new URLSearchParams(location.search);
  if (!q.has('code') && !q.has('error')) return null;
  const back = sessionStorage.getItem('stravaReturn') || '#/profile'; sessionStorage.removeItem('stravaReturn');
  history.replaceState(null, '', location.pathname + back);
  if (q.has('error')) throw new Error('Strava-Anmeldung abgebrochen');
  if (!/activity:write/.test(q.get('scope') || '')) throw new Error('Bitte bei Strava das Hochladen von Aktivitäten erlauben');
  await loadStrava();
  const r = await tokenReq({ grant_type: 'authorization_code', code: q.get('code') });
  strava.cfg.athlete = r.athlete ? `${r.athlete.firstname || ''} ${r.athlete.lastname || ''}`.trim() : strava.cfg.athlete;
  return strava.cfg.athlete || true;
}
async function tokenReq(params) {
  const c = strava.cfg;
  const res = await fetch('https://www.strava.com/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: c.clientId, client_secret: c.clientSecret, ...params }) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error('Strava-Token: ' + (j.message || res.status) + (res.status === 400 || res.status === 401 ? ' (Client-ID oder Secret prüfen)' : ''));
  Object.assign(c, { access: j.access_token, refresh: j.refresh_token, expires: j.expires_at });
  await save();
  return j;
}
async function token() {
  const c = strava.cfg; if (!c?.refresh) throw new Error('Nicht mit Strava verbunden');
  if (!c.access || Date.now() / 1000 > (c.expires || 0) - 120) await tokenReq({ grant_type: 'refresh_token', refresh_token: c.refresh });
  return strava.cfg.access;
}

// Fahrt hochladen (FIT mit Titel und Beschreibung), wartet auf die fertige Aktivität
export async function uploadRide(ride, onStatus = () => { }) {
  const tk = await token();
  const fd = new FormData();
  fd.append('file', new Blob([toFit(ride)], { type: 'application/octet-stream' }), ride.id + '.fit');
  fd.append('data_type', 'fit'); fd.append('name', stravaTitle(ride)); fd.append('description', stravaText(ride));
  fd.append('trainer', '1'); fd.append('external_id', 'trittwerk-' + ride.id);
  onStatus('Wird hochgeladen …');
  let res = await fetch('https://www.strava.com/api/v3/uploads', { method: 'POST', headers: { Authorization: 'Bearer ' + tk }, body: fd });
  let j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error('Upload: ' + (j.message || res.status) + (j.errors?.[0]?.field ? ' (' + j.errors[0].field + ')' : ''));
  for (let i = 0; i < 25 && !j.activity_id && !j.error; i++) {
    onStatus('Strava verarbeitet die Fahrt …');
    await new Promise(r => setTimeout(r, 2000));
    res = await fetch('https://www.strava.com/api/v3/uploads/' + j.id_str, { headers: { Authorization: 'Bearer ' + tk } });
    j = await res.json().catch(() => ({}));
  }
  if (j.error) { const dup = /duplicate/i.test(j.error); if (!dup) throw new Error(j.error); const m = j.error.match(/activities\/(\d+)/); return { id: m?.[1] || null, duplicate: true }; }
  if (!j.activity_id) throw new Error('Strava braucht länger, die Aktivität erscheint gleich in deinem Profil');
  return { id: String(j.activity_id) };
}
export const activityUrl = id => 'https://www.strava.com/activities/' + id;
