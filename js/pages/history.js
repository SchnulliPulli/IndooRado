// Verlauf aller Fahrten, nach Monaten gruppiert
import { $, esc, fmtKm, fmtDur } from '../util.js';
import { db } from '../db.js';
import { rideRow } from '../components.js';
import { toast, dialog } from '../util.js';
import { importFitFiles, rideFromStrava } from '../importer.js';
import { connected as stravaConnected, listActivities, activityStreams } from '../strava.js';

export async function render(el) {
  const rides = (await db.all('rides')).sort((a, b) => b.date.localeCompare(a.date));
  const months = new Map();
  for (const r of rides) { const k = r.date.slice(0, 7); if (!months.has(k)) months.set(k, []); months.get(k).push(r); }
  const tot = rides.reduce((a, r) => ({ d: a.d + (r.sum?.dist || 0), t: a.t + (r.sum?.dur || 0) }), { d: 0, t: 0 });
  el.innerHTML = `<section class="pagehead"><div><h1>Verlauf</h1><div class="small muted num">${rides.length} Fahrten · ${fmtKm(tot.d)} km · ${fmtDur(tot.t)}</div></div>
    <span class="row histbtns"><button class="btn sm ghost" id="selMode">☑ Auswählen</button><span class="importwrap"><button class="btn sm" id="impBtn" aria-expanded="false">⬇ Importieren ▾</button>
      <div class="impmenu" id="impMenu" hidden><label class="impitem">📄 FIT-Dateien<small>.fit, .fit.gz oder ZIP (z. B. Strava-Kontoexport)</small><input type="file" id="fitIn" accept=".fit,.gz,.zip" multiple hidden></label><button class="impitem" id="ghostIn">👻 Geist eines Freundes<small>.vvghost-Datei oder Code, dann gegen ihn fahren</small></button><button class="impitem" id="stravaIn">🟠 Aus Strava übernehmen<small>braucht eine Strava-Verbindung</small></button>
      <p class="small muted">Übernommene Fahrten zählen für Fitness, Form, Leistungskurve und Summen, bringen aber keine XP.</p></div></span></span></section>
  <div class="histsearch"><input class="inp" id="q" type="search" placeholder="🔍 Suchen nach Strecke, Workout oder Datum"></div>
  ${rides.length ? [...months].map(([m, list]) => {
    const d = list.reduce((a, r) => a + r.sum.dist, 0), t = list.reduce((a, r) => a + r.sum.dur, 0), tss = list.reduce((a, r) => a + r.sum.tss, 0);
    return `<section class="card month"><div class="row between"><h2>${new Date(m + '-15').toLocaleDateString(document.documentElement.lang, { month: 'long', year: 'numeric' })}</h2><span class="small muted num">${list.length} Fahrten · ${fmtKm(d)} km · ${fmtDur(t)} · ${tss} TSS</span></div>${list.map(rideRow).join('')}</section>`;
  }).join('') : '<div class="card"><p class="muted">Noch keine Fahrten. Starte auf der Startseite deine erste Fahrt.</p><a class="btn pri" href="#/">Zur Startseite</a></div>'}`;
  // Import-Menü
  const im = $('#impMenu', el), ib = $('#impBtn', el);
  ib.onclick = e => { e.stopPropagation(); im.hidden = !im.hidden; ib.setAttribute('aria-expanded', String(!im.hidden)); };
  document.addEventListener('click', e => { if (!e.target.closest?.('.importwrap')) { im.hidden = true; ib.setAttribute('aria-expanded', 'false'); } });
  $('#fitIn', el).onchange = async e => {
    const t = document.createElement('div'); t.className = 'toast show'; $('#toasts').appendChild(t);
    try { const r = await importFitFiles([...e.target.files], m => t.textContent = 'Importiere ' + m); toast(`${r.n} Fahrten übernommen${r.skip ? `, ${r.skip} schon vorhanden` : ''}${r.err ? `, ${r.err} nicht lesbar` : ''}`, 5000); render(el); }
    catch (err) { toast(err.message, 5000); } finally { t.remove(); }
  };
  $('#ghostIn', el).onclick = () => { $('#impMenu', el).hidden = true; import('../ghostui.js').then(m => m.ghostManager()); };
  $('#stravaIn', el).onclick = async () => {
    if (!stravaConnected()) { toast('Erst unter Einstellungen › Verbindungen mit Strava verbinden'); location.hash = '#/connect'; return; }
    const days = await dialog({ title: 'Fahrten aus Strava übernehmen', html: '<p>Welchen Zeitraum? Übernommen werden Rad- und virtuelle Fahrten (auch aus anderen Trainings-Apps), schon vorhandene werden übersprungen. Strava erlaubt etwa 100 Abfragen pro 15 Minuten.</p>', buttons: [{ label: 'Abbrechen', value: 0 }, { label: '30 Tage', value: 30 }, { label: '90 Tage', value: 90, cls: 'pri' }, { label: '1 Jahr', value: 365 }] });
    if (!days) return;
    const t = document.createElement('div'); t.className = 'toast show'; t.textContent = 'Lade Liste von Strava …'; $('#toasts').appendChild(t);
    try {
      const have = new Set((await db.all('rides')).map(r => r.id)), acts = (await listActivities(Math.floor(Date.now() / 1000 - days * 86400))).filter(a => !have.has('s-' + a.id) && !have.has(a.external_id?.replace(/^trittwerk-|\.fit$/g, '')));
      let n = 0;
      for (const a of acts.slice(0, 90)) { t.textContent = `Übernehme ${++n} von ${Math.min(acts.length, 90)}: ${a.name}`; const st = await activityStreams(a.id); if (st.time?.data?.length > 30) await db.put('rides', rideFromStrava(a, st)); }
      toast(n ? `${n} Fahrten aus Strava übernommen${acts.length > 90 ? ', den Rest beim nächsten Mal' : ''}` : 'Keine neuen Fahrten gefunden', 5000); render(el);
    } catch (err) { toast(err.message, 6000); } finally { t.remove(); }
  };
  // Mehrere Fahrten auswählen und löschen
  const bar = document.createElement('div'); bar.className = 'selbar'; bar.hidden = true;
  bar.innerHTML = '<span id="selN">0 ausgewählt</span><span class="row"><button class="btn sm ghost" id="selAll">Alle sichtbaren</button><button class="btn sm danger" id="selDel" disabled>Löschen</button><button class="btn sm ghost" id="selX">Fertig</button></span>';
  el.prepend(bar);
  const setSel = (c, v) => { c.setAttribute('aria-checked', String(v)); c.closest('.riderow')?.classList.toggle('picked', v); };
  const selOn = on => { bar.hidden = !on; el.classList.toggle('selecting', on); el.querySelectorAll('.rsel').forEach(x => x.hidden = !on); if (!on) el.querySelectorAll('[data-sel]').forEach(c => setSel(c, false)); cnt(); };
  const cnt = () => { const n = el.querySelectorAll('[data-sel][aria-checked="true"]').length; $('#selN', el).textContent = n + ' ausgewählt'; $('#selDel', el).disabled = !n; };
  $('#selMode', el).onclick = () => selOn(bar.hidden);
  $('#selX', el).onclick = () => selOn(false);
  $('#selAll', el).onclick = () => { el.querySelectorAll('.riderow:not([hidden]) [data-sel]').forEach(c => setSel(c, true)); cnt(); };
  // Auswahlmodus: Tippen auf eine Zeile hakt sie an (statt sie zu öffnen). Nur ein Klick-Empfänger, auch nach erneutem Öffnen der Seite.
  if (el._selClick) el.removeEventListener('click', el._selClick, true);
  el._selClick = e => { if (!el.classList.contains('selecting')) return; const row = e.target.closest('.riderow'); if (!row || e.target.closest('[data-delride]')) return; e.preventDefault(); e.stopPropagation(); const c = row.querySelector('[data-sel]'); setSel(c, c.getAttribute('aria-checked') !== 'true'); cnt(); };
  el.addEventListener('click', el._selClick, true);
  $('#selDel', el).onclick = async () => {
    const ids = [...el.querySelectorAll('[data-sel][aria-checked="true"]')].map(c => c.dataset.sel);
    if (!(await dialog({ title: ids.length + ' Fahrten löschen?', html: '<p class="muted">Fahrten und Fotos werden entfernt, auch auf deinen anderen Geräten beim nächsten Abgleich. Erfahrungspunkte und Abzeichen bleiben erhalten.</p>', buttons: [{ label: 'Abbrechen', value: false }, { label: 'Löschen', value: true, cls: 'danger' }] }))) return;
    const { deleteRide } = await import('../ridesave.js'); for (const id of ids) await deleteRide(id);
    toast(ids.length + ' Fahrten gelöscht'); render(el);
  };
  $('#q', el).oninput = e => { const q = e.target.value.toLowerCase(); el.querySelectorAll('.riderow').forEach(a => a.hidden = q && !a.textContent.toLowerCase().includes(q)); };
}
