// Companion: Handy-Ansicht zum Planen, Nachsehen und Mitverfolgen einer laufenden Fahrt (über den NAS-Abgleich)
import { $, esc, fmtKm, fmtDur, fmtT, fmtDate, toast } from '../util.js';
import { profile, sel, saveSel, progress, levelOf, loadState } from '../state.js';
import { db } from '../db.js';
import { totals, fitness } from '../analysis.js';
import { planProgress, loadPlan } from '../plans.js';
import { listWorkouts, stats as wStats, getWorkout } from '../workouts.js';
import { listRoutes, quickStats } from '../routes.js';
import { sync, syncReady, getLive, pushNow, loadSync, isConfigured } from '../sync.js';
import { missionState } from '../game.js';
import { titleOf } from '../game.js';

let timer = null;
export async function render(el) {
  if (!sync.cfg) await loadSync(); // beim direkten Öffnen ist der NAS-Zugang evtl. noch nicht geladen
  const rides = (await db.all('rides')).sort((a, b) => b.date.localeCompare(a.date));
  const t = totals(rides), f = fitness(rides, 60).at(-1) || { ctl: 0, atl: 0, tsb: 0 }, L = levelOf(progress.xp);
  const wk = Date.now() - 7 * 864e5, week = rides.filter(r => +new Date(r.date) > wk);
  const pr = planProgress(), next = pr?.next, chosen = await getWorkout(sel.workoutId);
  const wos = await listWorkouts(), routes = await listRoutes(), route = routes.find(r => r.id === sel.routeId);
  const nas = isConfigured();
  el.innerHTML = `
  <section class="comp">
    <div class="comphead"><div><div class="small muted">Übersicht</div><h1>Hallo ${esc(profile.name)}</h1><div class="small muted">Level ${L.lv} · ${titleOf(L.lv)} · FTP ${profile.ftp} W</div></div>
      <button class="btn sm" id="cRefresh" ${nas ? '' : 'disabled'}>↻ Abgleichen</button></div>
    <div class="small ${nas ? 'muted' : 'warn'}" id="cSync">${nas ? syncText() : 'Ohne Cloud-Abgleich siehst du hier nur die Daten dieses Geräts. Unter Einstellungen › Verbindungen einen Cloud-Speicher verbinden (NAS, OneDrive, Google Drive, Dropbox), dann zeigt das Handy deine Fahrten, Pläne und die laufende Fahrt vom PC.'}</div>

    <div class="card live" id="cLive" hidden></div>

    <div class="card"><div class="row between"><h2>Nächste Fahrt</h2><a class="small" href="#/plans">Plan</a></div>
      ${next ? `<div class="compnext"><div><div class="small muted">${esc(pr.p.name)} · Woche ${next.week}</div><b>${esc(next.name)}</b><div class="small muted num">${fmtDur(wStats(next).dur)} · TSS ${wStats(next).tss}</div></div>${sel.workoutId === next.id ? '<span class="tag">vorgemerkt</span>' : `<button class="btn sm pri" data-pick="${next.id}">Vormerken</button>`}</div>` : '<p class="small muted">Kein Trainingsplan aktiv.</p>'}
      <label class="f">Workout für die nächste Fahrt<select class="inp" id="cWo"><option value="">Freie Fahrt</option>${pr ? `<optgroup label="Plan ${esc(pr.p.name)}">${pr.p.all.filter(w => w.id === sel.workoutId || w.id === next?.id).map(w => `<option value="${w.id}" ${w.id === sel.workoutId ? 'selected' : ''}>W${w.week} ${esc(w.name)}</option>`).join('')}</optgroup>` : ''}${[...new Set(wos.map(w => w.cat))].map(c => `<optgroup label="${esc(c)}">${wos.filter(w => w.cat === c).map(w => `<option value="${w.id}" ${w.id === sel.workoutId ? 'selected' : ''}>${esc(w.name)} · ${fmtDur(wStats(w).dur)}</option>`).join('')}</optgroup>`).join('')}</select></label>
      <label class="f">Strecke<select class="inp" id="cRoute">${routes.map(r => `<option value="${r.id}" ${r.id === sel.routeId ? 'selected' : ''}>${esc(r.name)} · ${fmtKm(quickStats(r).dist)} km</option>`).join('')}</select></label>
      <p class="small muted">${nas ? 'Die Auswahl wird über den Cloud-Speicher an Indoorado auf dem PC übertragen und ist dort beim nächsten Öffnen bereit.' : 'Die Auswahl gilt auf diesem Gerät.'}${chosen ? ` Vorgemerkt: <b>${esc(chosen.name)}</b>` : ''}${route ? ` auf <b>${esc(route.name)}</b>.` : ''}</p>
    </div>

    <div class="card"><h2>Diese Woche</h2>
      <div class="tiles">${[[fmtKm(week.reduce((a, r) => a + r.sum.dist, 0)), 'km'], [fmtDur(week.reduce((a, r) => a + r.sum.dur, 0)), 'Fahrzeit'], [week.reduce((a, r) => a + r.sum.tss, 0), 'TSS'], [t.streak, 'Tage Serie']].map(([v, l]) => `<div class="tile"><b class="num">${v}</b><span>${l}</span></div>`).join('')}</div>
      <div class="tiles" style="margin-top:8px">${[[Math.round(f.ctl), 'Fitness'], [Math.round(f.atl), 'Ermüdung'], [(f.tsb > 0 ? '+' : '') + Math.round(f.tsb), 'Frische']].map(([v, l]) => `<div class="tile"><b class="num">${v}</b><span>${l}</span></div>`).join('')}</div>
    </div>

    <div class="card"><h2>Missionen</h2>${missionState(rides).map(m => `<div class="mission ${m.done ? 'done' : ''}"><span class="mi">${m.done ? '✅' : m.icon}</span><div style="flex:1"><div class="small"><b>${esc(m.text)}</b></div><div class="bar"><i style="width:${(m.frac * 100).toFixed(0)}%"></i></div></div></div>`).join('')}</div>

    <div class="card"><div class="row between"><h2>Aktivitäten</h2><a class="small" href="#/history">Alle</a></div>
      ${rides.slice(0, 12).map(r => `<a class="compride" href="#/summary/${esc(r.id)}" data-rid="${esc(r.id)}"><div><b>${esc(r.title)}</b><div class="small muted">${fmtDate(r.date, { dateStyle: 'medium', timeStyle: 'short' })}${r.imported ? ' · übernommen' : ''}</div></div><div class="num compride-s"><span>${fmtKm(r.sum.dist)} km</span><span>${fmtDur(r.sum.dur)}</span><span>${r.sum.avgP} W</span></div><button class="rdel" data-delride="${esc(r.id)}" title="Fahrt löschen" aria-label="Fahrt löschen">🗑</button></a>`).join('') || '<p class="muted">Noch keine Fahrten.</p>'}
    </div>
  </section>`;

  el.onchange = e => {
    if (e.target.id === 'cWo') { sel.workoutId = e.target.value || null; saveSel(); toast(nas ? 'Vorgemerkt, wird zum PC übertragen' : 'Vorgemerkt'); render(el); }
    if (e.target.id === 'cRoute') { sel.routeId = e.target.value; saveSel(); toast('Strecke vorgemerkt'); }
  };
  el.onclick = async e => {
    const b = e.target.closest('[data-pick]'); if (b) { sel.workoutId = b.dataset.pick; saveSel(); toast('Vorgemerkt'); render(el); return; }
    if (e.target.id === 'cRefresh') {
      e.target.disabled = true; e.target.textContent = '↻ …';
      try { const r = await pushNow(); if (r?.pulled) { await loadState(); await loadPlan(); toast('Aktualisiert'); } render(el); } catch (err) { toast(sync.error || err.message, 5000); e.target.disabled = false; e.target.textContent = '↻ Abgleichen'; }
    }
  };
  // Laufende Fahrt vom PC alle 5 Sekunden abfragen
  clearInterval(timer);
  if (syncReady()) { const poll = () => liveTick(el); poll(); timer = setInterval(poll, 5000); }
}
function syncText() { return sync.needLogin ? '🔑 Anmeldung beim Cloud-Speicher abgelaufen, unter Einstellungen › Verbindungen neu anmelden' : sync.error ? '⚠ ' + sync.error : sync.last ? 'Abgeglichen: ' + fmtDate(sync.last, { dateStyle: 'short', timeStyle: 'short' }) : 'Noch nicht abgeglichen'; }

async function liveTick(el) {
  const box = $('#cLive', el); if (!box) { clearInterval(timer); return; }
  let L = null; try { L = await getLive(); } catch (e) { }
  const fresh = L && L.state !== 'ended' && Date.now() - L.ts < 30000;
  box.hidden = !fresh; if (!fresh) return;
  const pct = L.total ? Math.min(100, (L.pos / L.total) * 100) : 0, w = L.wo;
  box.innerHTML = `<div class="row between"><div><span class="livedot"></span> <a href="#/live"><b>Live</b> ›</a> <span class="small muted">· ${esc(L.route)}${L.state === 'paused' || L.state === 'auto' ? ' · Pause' : ''}</span></div><span class="small muted num">${fmtT(L.t)}</span></div>
    <div class="livebig"><div><b class="num">${L.p}</b><span>Watt</span></div><div><b class="num" style="color:var(--hr)">${L.hr ?? '–'}</b><span>Puls</span></div><div><b class="num" style="color:var(--cad)">${L.cad ?? '–'}</b><span>U/min</span></div></div>
    <div class="tiles">${[[String(L.v).replace('.', ','), 'km/h'], [fmtKm(L.odo), 'km'], [L.asc, 'Hm'], [String(L.grade).replace('.', ',') + ' %', 'Steigung'], ...(L.place ? [[L.place + '.', 'Platz']] : []), ...(L.ghost != null ? [[(L.ghost >= 0 ? '−' : '+') + Math.abs(L.ghost) + ' m', 'zum Geist']] : [])].map(([v, l]) => `<div class="tile"><b class="num">${v}</b><span>${l}</span></div>`).join('')}</div>
    ${w ? `<div class="livewo"><div class="row between small"><b>${esc(w.name)}</b><span class="num">${w.i ? `Intervall ${w.i}/${w.n} · noch ${fmtT(w.left)}` : 'fertig'}</span></div>${w.target ? `<div class="small">Ziel <b class="num">${w.target} W</b></div>` : ''}<div class="bar"><i style="width:${Math.min(100, w.done / w.total * 100).toFixed(1)}%"></i></div></div>` : ''}
    ${!L.loop ? `<div class="small muted">Strecke ${pct.toFixed(0)} % · noch ${fmtKm(Math.max(0, L.total - L.pos))} km</div><div class="bar thin"><i style="width:${pct.toFixed(1)}%"></i></div>` : ''}`;
}
export function leave() { clearInterval(timer); timer = null; }
