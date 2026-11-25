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
  el.innerHTML = `<section class="pagehead"><h1>Verlauf</h1><span class="row"><input class="inp" id="q" placeholder="Suchen nach Strecke oder Workout" style="max-width:260px"><label class="btn sm">FIT-Dateien importieren<input type="file" id="fitIn" accept=".fit,.gz,.zip" multiple hidden></label><button class="btn sm" id="stravaIn">Aus Strava übernehmen</button></span></section>
  <p class="small muted">Bisherige Fahrten, z. B. aus Zwift, fließen so in Fitness, Form, Leistungskurve und Summen ein (ohne XP). Zwift überträgt Fahrten zu Strava. Einzelne Zwift-Fahrten gibt es auf zwift.com unter Aktivitäten als .fit, alle Strava-Fahrten im Strava-Kontoexport (ZIP).</p>
  ${rides.length ? [...months].map(([m, list]) => {
    const d = list.reduce((a, r) => a + r.sum.dist, 0), t = list.reduce((a, r) => a + r.sum.dur, 0), tss = list.reduce((a, r) => a + r.sum.tss, 0);
    return `<section class="card month"><div class="row between"><h2>${new Date(m + '-15').toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}</h2><span class="small muted num">${list.length} Fahrten · ${fmtKm(d)} km · ${fmtDur(t)} · ${tss} TSS</span></div>${list.map(rideRow).join('')}</section>`;
  }).join('') : '<div class="card"><p class="muted">Noch keine Fahrten. Starte auf der Startseite deine erste Fahrt.</p><a class="btn pri" href="#/">Zur Startseite</a></div>'}`;
  $('#fitIn', el).onchange = async e => {
    const t = document.createElement('div'); t.className = 'toast show'; $('#toasts').appendChild(t);
    try { const r = await importFitFiles([...e.target.files], m => t.textContent = 'Importiere ' + m); toast(`${r.n} Fahrten übernommen${r.skip ? `, ${r.skip} schon vorhanden` : ''}${r.err ? `, ${r.err} nicht lesbar` : ''}`, 5000); render(el); }
    catch (err) { toast(err.message, 5000); } finally { t.remove(); }
  };
  $('#stravaIn', el).onclick = async () => {
    if (!stravaConnected()) { toast('Erst unter Einstellungen › Verbindungen mit Strava verbinden'); location.hash = '#/connect'; return; }
    const days = await dialog({ title: 'Fahrten aus Strava übernehmen', html: '<p>Welchen Zeitraum? Übernommen werden Rad- und virtuelle Fahrten (auch Zwift), schon vorhandene werden übersprungen. Strava erlaubt etwa 100 Abfragen pro 15 Minuten.</p>', buttons: [{ label: 'Abbrechen', value: 0 }, { label: '30 Tage', value: 30 }, { label: '90 Tage', value: 90, cls: 'pri' }, { label: '1 Jahr', value: 365 }] });
    if (!days) return;
    const t = document.createElement('div'); t.className = 'toast show'; t.textContent = 'Lade Liste von Strava …'; $('#toasts').appendChild(t);
    try {
      const have = new Set((await db.all('rides')).map(r => r.id)), acts = (await listActivities(Math.floor(Date.now() / 1000 - days * 86400))).filter(a => !have.has('s-' + a.id) && !have.has(a.external_id?.replace(/^trittwerk-|\.fit$/g, '')));
      let n = 0;
      for (const a of acts.slice(0, 90)) { t.textContent = `Übernehme ${++n} von ${Math.min(acts.length, 90)}: ${a.name}`; const st = await activityStreams(a.id); if (st.time?.data?.length > 30) await db.put('rides', rideFromStrava(a, st)); }
      toast(n ? `${n} Fahrten aus Strava übernommen${acts.length > 90 ? ', den Rest beim nächsten Mal' : ''}` : 'Keine neuen Fahrten gefunden', 5000); render(el);
    } catch (err) { toast(err.message, 6000); } finally { t.remove(); }
  };
  $('#q', el).oninput = e => { const q = e.target.value.toLowerCase(); el.querySelectorAll('.riderow').forEach(a => a.hidden = q && !a.textContent.toLowerCase().includes(q)); };
}
