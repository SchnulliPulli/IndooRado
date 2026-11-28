// Upload zu intervals.icu (kostenlose Trainingsanalyse). Zugang: eigener API-Schlüssel aus intervals.icu ›
// Settings › Developer Settings. Der Schlüssel bleibt nur auf diesem Gerät (nicht im Abgleich, nicht in Sicherungen).
import { kv } from './db.js';
import { toFit, fileBase } from './export.js';
import { dialog, toast, esc } from './util.js';

const KEY = 'intervalsIcu';
export const configured = async () => !!(await kv.get(KEY, null))?.key;
async function setup() {
  const cur = await kv.get(KEY, {}) || {}; window.__icuId = cur.id || ''; window.__icuKey = cur.key || '';
  const v = await dialog({ title: 'intervals.icu verbinden', html: `<p class="small muted">In intervals.icu unter <b>Settings › Developer Settings</b> den <b>API Key</b> und deine <b>Athlete ID</b> (z. B. i12345) kopieren. Der Schlüssel wird nur auf diesem Gerät gespeichert.</p>
    <label class="f">Athlete ID<input class="inp" id="icuId" value="${esc(cur.id || '')}" placeholder="i12345" autocomplete="off"></label>
    <label class="f">API Key<input class="inp" id="icuKey" type="password" value="${esc(cur.key || '')}" autocomplete="off"></label>`,
    buttons: [{ label: 'Abbrechen', value: null }, ...(cur.key ? [{ label: 'Trennen', value: 'off', cls: 'danger' }] : []), { label: 'Speichern', value: 'ok', cls: 'pri' }] });
  if (v === 'off') { await kv.set(KEY, null); toast('intervals.icu getrennt'); return false; }
  if (v !== 'ok') return false;
  const id = (window.__icuId || '').trim(), key = (window.__icuKey || '').trim(); window.__icuId = window.__icuKey = null;
  if (!/^i?\d+$/.test(id) || key.length < 10) { toast('Athlete ID oder API Key fehlen'); return false; }
  await kv.set(KEY, { id: id.startsWith('i') ? id : 'i' + id, key }); return true;
}
document.addEventListener('input', e => { if (e.target.id === 'icuId') window.__icuId = e.target.value; if (e.target.id === 'icuKey') window.__icuKey = e.target.value; });
export async function upload(ride) {
  if (!(await configured()) && !(await setup())) return;
  const c = await kv.get(KEY);
  const fd = new FormData(); fd.append('file', new Blob([toFit(ride)], { type: 'application/octet-stream' }), fileBase(ride) + '.fit');
  try {
    const r = await fetch(`https://intervals.icu/api/v1/athlete/${encodeURIComponent(c.id)}/activities?name=${encodeURIComponent(ride.title || 'IndooRado')}`, { method: 'POST', body: fd, headers: { Authorization: 'Basic ' + btoa('API_KEY:' + c.key) } });
    if (r.status === 401 || r.status === 403) { toast('intervals.icu: Schlüssel oder Athlete ID stimmen nicht', 6000); await setup(); return; }
    if (!r.ok) throw new Error('HTTP ' + r.status);
    toast('✅ Zu intervals.icu hochgeladen', 3500); return true;
  } catch (e) {
    toast(/Failed to fetch|NetworkError/i.test(e.message) ? 'intervals.icu nicht erreichbar oder Upload aus dem Browser blockiert. Alternative: in intervals.icu Strava verbinden – dann kommen Fahrten automatisch dorthin.' : 'Upload fehlgeschlagen: ' + e.message, 8000);
  }
}
export const settings = setup;
