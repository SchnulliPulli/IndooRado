// Verlauf aller Fahrten, nach Monaten gruppiert
import { $, esc, fmtKm, fmtDur } from '../util.js';
import { db } from '../db.js';
import { rideRow } from '../components.js';

export async function render(el) {
  const rides = (await db.all('rides')).sort((a, b) => b.date.localeCompare(a.date));
  const months = new Map();
  for (const r of rides) { const k = r.date.slice(0, 7); if (!months.has(k)) months.set(k, []); months.get(k).push(r); }
  el.innerHTML = `<section class="pagehead"><h1>Verlauf</h1><input class="inp" id="q" placeholder="Suchen nach Strecke oder Workout" style="max-width:320px"></section>
  ${rides.length ? [...months].map(([m, list]) => {
    const d = list.reduce((a, r) => a + r.sum.dist, 0), t = list.reduce((a, r) => a + r.sum.dur, 0), tss = list.reduce((a, r) => a + r.sum.tss, 0);
    return `<section class="card month"><div class="row between"><h2>${new Date(m + '-15').toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}</h2><span class="small muted num">${list.length} Fahrten · ${fmtKm(d)} km · ${fmtDur(t)} · ${tss} TSS</span></div>${list.map(rideRow).join('')}</section>`;
  }).join('') : '<div class="card"><p class="muted">Noch keine Fahrten. Starte auf der Startseite deine erste Fahrt.</p><a class="btn pri" href="#/">Zur Startseite</a></div>'}`;
  $('#q', el).oninput = e => { const q = e.target.value.toLowerCase(); el.querySelectorAll('.riderow').forEach(a => a.hidden = q && !a.textContent.toLowerCase().includes(q)); };
}
