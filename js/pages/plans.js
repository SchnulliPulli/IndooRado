// Trainingspläne: auswählen, Woche für Woche verfolgen
import { $, esc, fmtDur, dialog, toast, download } from '../util.js';
import { readFiles, planToJson } from '../fileio.js';
import { profile, sel, saveSel } from '../state.js';
import { PLANS, CUSTOM, getPlan, plan, startPlan, stopPlan, planProgress, skip, unskip, addCustomPlan, deleteCustomPlan } from '../plans.js';
import { stats, drawWorkout, parseZwo } from '../workouts.js';

export async function render(el) {
  const pr = planProgress();
  el.innerHTML = `
  <section class="pagehead"><h1>Trainingspläne</h1><a class="btn pri" href="#/planner">+ Neuer Plan</a></section>
  <p class="muted">Jeder Plan ist eine Folge von Workouts, Woche für Woche. Alle Ziele hängen an deiner FTP (${profile.ftp} W) und passen sich automatisch an, wenn sie sich ändert. Eine Einheit zählt als erledigt, wenn du mindestens 90 % davon fährst.</p>
  ${pr ? active(pr) : ''}
  <section class="card form"><h2>Plan importieren</h2>
    <p class="small muted">Mehrere Workout-Dateien (.zwo, .erg, .mrc) oder ein ZIP-Archiv damit wählen: daraus wird ein Plan, Reihenfolge nach Dateiname (am besten nummeriert: 01_…, 02_…). Ein exportierter VeloVerse-Plan (.json) wird direkt übernommen. Die Ziele werden aus deiner FTP berechnet. <a href="#/help">Anleitung</a></p>
    <div class="grid2 tight"><label class="f">Name des Plans<input class="inp" id="cpName" placeholder="z. B. Mein Gran Fondo"></label><label class="f">Einheiten pro Woche<input class="inp" id="cpPer" type="number" min="1" max="7" value="3"></label></div>
    <div class="row"><label class="btn pri">Dateien wählen und Plan anlegen<input type="file" id="cpFiles" accept=".zwo,.erg,.mrc,.json,.zip,.xml" multiple hidden></label></div>
  </section>
  <section class="pgrid">${[...PLANS, ...CUSTOM].map(p => `
    <article class="pcard ${pr?.p.id === p.id ? 'on' : ''}" style="--pc:${p.color}">
      <div class="row between"><span class="tag">${esc(p.level)}</span><span class="small muted num">${p.weeks.length} Wochen · ${p.perWeek}× pro Woche</span></div>
      <h3>${esc(p.name)}</h3>
      <p class="small muted">${esc(p.desc)}</p>
      <div class="pweeks">${p.weeks.map((w, i) => `<i style="height:${Math.round(18 + 42 * w.reduce((s, x) => s + stats(x).tss, 0) / Math.max(...p.weeks.map(ww => ww.reduce((s, x) => s + stats(x).tss, 0))))}px" title="Woche ${i + 1}"></i>`).join('')}</div>
      <div class="row between small muted num"><span>${fmtDur(p.dur)} gesamt</span><span>${p.all.length} Einheiten · TSS ${p.tss}</span></div>
      <div class="row end"><a class="btn sm ghost" href="#/planner/${p.id}">${p.custom ? 'Bearbeiten' : 'Anpassen'}</a><button class="btn sm ghost" data-expplan="${p.id}" title="Plan als Datei speichern">Export</button>${p.custom ? `<button class="btn sm ghost danger" data-delplan="${p.id}">Löschen</button>` : ''}${pr?.p.id === p.id ? '<span class="small" style="color:var(--ok)">Aktiv</span>' : `<button class="btn sm pri" data-start="${p.id}">Plan starten</button>`}</div>
    </article>`).join('')}</section>`;

  $('#cpFiles', el).onchange = async e => {
    const files = [...e.target.files].sort((a, b) => a.name.localeCompare(b.name, 'de', { numeric: true }));
    const r = await readFiles(files, profile.ftp); r.errors.forEach(m => toast(m, 5000));
    const per = +$('#cpPer', el).value || 3, nm = $('#cpName', el).value.trim();
    let id = null, n = 0;
    for (const p of r.plans) { id = await addCustomPlan(nm || p.name, p.perWeek, p.wos); n++; }
    for (const z of r.zips) { id = await addCustomPlan(nm || z.name, per, z.wos); n++; }
    if (r.workouts.length) { id = await addCustomPlan(nm || 'Eigener Plan', per, r.workouts); n++; }
    if (!id) return;
    toast(n > 1 ? `${n} Pläne angelegt` : 'Plan angelegt');
    if (!plan.active && await dialog({ title: 'Plan gleich starten?', buttons: [{ label: 'Später', value: false }, { label: 'Starten', value: true, cls: 'pri' }] })) startPlan(id);
    render(el);
  };
  el.querySelectorAll('canvas.pwc').forEach(c => { const w = pr.p.all.find(x => x.id === c.dataset.id); drawWorkout(c, w); });
  el.onclick = async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.start) {
      if (plan.active && !(await dialog({ title: 'Plan wechseln?', html: `<p class="muted">Der aktuelle Plan „${esc(getPlan(plan.active.id).name)}“ wird beendet. Erledigte Einheiten bleiben im Verlauf.</p>`, buttons: [{ label: 'Abbrechen', value: false }, { label: 'Wechseln', value: true, cls: 'pri' }] }))) return;
      if (plan.active) stopPlan();
      startPlan(b.dataset.start); toast('Plan gestartet. Viel Erfolg!'); render(el); window.scrollTo(0, 0);
    }
    if (b.dataset.expplan) { const p = getPlan(b.dataset.expplan); download(p.name.replace(/[^\wäöüÄÖÜß -]+/g, '').trim() + '.veloverse-plan.json', planToJson(p), 'application/json'); return; }
    if (b.dataset.delplan) { if (await dialog({ title: 'Eigenen Plan löschen?', buttons: [{ label: 'Abbrechen', value: false }, { label: 'Löschen', value: true, cls: 'danger' }] })) { await deleteCustomPlan(b.dataset.delplan); render(el); } return; }
    if (b.dataset.go) { sel.workoutId = b.dataset.go; saveSel(); location.hash = '#/ride'; }
    if (b.dataset.pick) { sel.workoutId = b.dataset.pick; saveSel(); toast('Für die nächste Fahrt ausgewählt'); }
    if (b.dataset.skip) { skip(b.dataset.skip); render(el); }
    if (b.dataset.unskip) { unskip(b.dataset.unskip); render(el); }
    if (b.dataset.stop != null) { if (await dialog({ title: 'Plan beenden?', buttons: [{ label: 'Abbrechen', value: false }, { label: 'Beenden', value: true, cls: 'danger' }] })) { stopPlan(); render(el); } }
  };
}

function active(pr) {
  const { p, next } = pr, d = plan.active.done;
  return `<section class="card planbox" style="--pc:${p.color}">
    <div class="row between"><div><div class="small muted">Aktiver Plan</div><h2 style="margin:0">${esc(p.name)}</h2></div>
      <div class="planring" style="--f:${(pr.frac * 100).toFixed(1)}"><b class="num">${Math.round(pr.frac * 100)} %</b></div></div>
    <div class="small muted">${pr.done} von ${pr.total} Einheiten · ${pr.finished ? 'Plan abgeschlossen 🎉' : 'Woche ' + pr.week + ' von ' + p.weeks.length}</div>
    ${next ? `<div class="nextwo"><div><div class="small muted">Als Nächstes</div><b>${esc(next.name)}</b> <span class="small muted num">· ${fmtDur(stats(next).dur)} · TSS ${stats(next).tss}</span></div><canvas class="pwc" data-id="${next.id}"></canvas>
      <div class="row end"><button class="btn sm ghost" data-skip="${next.id}">Überspringen</button><button class="btn sm" data-pick="${next.id}">Auswählen</button><button class="btn sm pri" data-go="${next.id}">Jetzt fahren</button></div></div>` : ''}
    <div class="weeks">${p.weeks.map((w, i) => `<div class="wk ${next?.week === i + 1 ? 'cur' : ''}"><div class="small muted">Woche ${i + 1}</div>${w.map(x => {
      const st = d[x.id] ? (d[x.id].skipped ? 'skip' : 'done') : x.id === next?.id ? 'next' : '';
      return `<div class="wkit ${st}" title="${esc(x.name)}"><span class="dot"></span><span class="nm">${esc(x.name)}</span><span class="small muted num">${Math.round(stats(x).dur / 60)}′</span>${st === 'skip' ? `<button class="btn xs ghost" data-unskip="${x.id}">↺</button>` : st === '' || st === 'next' ? `<button class="btn xs ghost" data-go="${x.id}" title="Fahren">▶</button>` : ''}</div>`;
    }).join('')}</div>`).join('')}</div>
    <div class="row end"><button class="btn sm ghost danger" data-stop>Plan beenden</button></div>
  </section>`;
}
