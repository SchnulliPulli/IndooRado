// Trainingspläne: auswählen, Woche für Woche verfolgen
import { $, esc, fmtDur, dialog, toast, download } from '../util.js';
import { readFiles, planToJson, parsePlanText, toFitWorkout, zipStore } from '../fileio.js';
import { profile, sel, saveSel, progress } from '../state.js';
import { PLANS, CUSTOM, getPlan, plan, startPlan, stopPlan, planProgress, skip, unskip, addCustomPlan, deleteCustomPlan } from '../plans.js';
import { stats, drawWorkout, parseZwo } from '../workouts.js';

export async function render(el) {
  const pr = planProgress();
  el.innerHTML = `
  <section class="pagehead"><h1>Trainingspläne</h1><span class="row"><label class="btn">Plan-Datei importieren<input type="file" id="cpPlanFile" accept=".json,.zip,.txt" multiple hidden></label><button class="btn pri" id="pbGoal">🎯 Plan für mein Ziel</button><a class="btn" href="#/planner">+ Neuer Plan</a></span></section>
  <p class="muted">Jeder Plan ist eine Folge von Workouts, Woche für Woche. Alle Ziele hängen an deiner FTP (${profile.ftp} W) und passen sich automatisch an, wenn sie sich ändert. Eine Einheit zählt als erledigt, wenn du mindestens 90 % davon fährst.</p>
  ${pr ? active(pr) : ''}
  <section class="card form"><h2>Plan importieren</h2>
    <p class="small muted">Mehrere Workout-Dateien (.zwo, .erg, .mrc) oder ein ZIP-Archiv damit wählen: daraus wird ein Plan, Reihenfolge nach Dateiname (am besten nummeriert: 01_…, 02_…). Plan-Dateien (IndooRado-Plan <code>.json</code>, z. B. <code>…indoorado-plan.json</code>, oder eine Textdatei mit kopierter Plan-Übersicht) werden direkt als Plan übernommen, auch oben über „Plan-Datei importieren“. Die Ziele werden aus deiner FTP berechnet. <a href="#/help">Anleitung</a></p>
    <div class="grid2 tight"><label class="f">Name des Plans<input class="inp" id="cpName" placeholder="z. B. Mein Gran Fondo"></label><label class="f">Einheiten pro Woche<input class="inp" id="cpPer" type="number" min="1" max="7" value="3"></label></div>
    <div class="row"><label class="btn pri">Dateien wählen und Plan anlegen<input type="file" id="cpFiles" accept=".zwo,.erg,.mrc,.json,.zip,.xml" multiple hidden></label></div>
    <details class="f"><summary><b>Plan aus Text einfügen</b> <span class="small muted">(z. B. kopierte Wochenübersicht einer Workout-Sammlung)</span></summary>
      <p class="small muted">Markiere auf der Seite des Plans alle Wochen samt Workouts, kopiere sie und füge sie hier ein. Erkannt werden Wochen, Workout-Namen und Schritte wie „5min @ 196W“, „10min from 76 to 196W“, „3min @ 55rpm, 257W“, „2min free ride“ und Wiederholungen wie „10x 3min @ 271W,“. Watt werden über die angegebene FTP in Prozent umgerechnet, damit sich alles an deine FTP anpasst. Der Plan bleibt nur in deinem Browser.</p>
      <textarea class="inp" id="cpText" rows="6" placeholder="Text hier einfügen …"></textarea>
      <div class="row"><button class="btn sm" id="cpTextCheck">Prüfen</button><button class="btn sm pri" id="cpTextGo">Plan anlegen</button><span class="small muted" id="cpTextInfo"></span></div>
    </details>
  </section>
  <section class="pgrid">${[...PLANS, ...CUSTOM].map(p => `
    <article class="pcard ${pr?.p.id === p.id ? 'on' : ''}" style="--pc:${p.color}">
      <div class="row between"><span class="tag">${esc(p.level)}</span><span class="small muted num">${p.weeks.length} Wochen · ${p.perWeek}× pro Woche</span></div>
      <h3>${esc(p.name)}</h3>
      <p class="small muted">${esc(p.desc)}</p>
      <div class="pweeks">${p.weeks.map((w, i) => `<i style="height:${Math.round(18 + 42 * w.reduce((s, x) => s + stats(x).tss, 0) / Math.max(...p.weeks.map(ww => ww.reduce((s, x) => s + stats(x).tss, 0))))}px" title="Woche ${i + 1}"></i>`).join('')}</div>
      <div class="row between small muted num"><span>${fmtDur(p.dur)} gesamt</span><span>${p.all.length} Einheiten · TSS ${p.tss}</span></div>
      <div class="row end"><a class="btn sm ghost" href="#/planner/${p.id}">${p.custom ? 'Bearbeiten' : 'Anpassen'}</a><button class="btn sm ghost" data-expplan="${p.id}" title="Plan als Datei speichern">Export</button>${plan.active?.id === p.id ? `<button class="btn sm ghost" data-ics="${p.id}" title="Einheiten als Termine in deinen Kalender (Google, Apple, Outlook)">📅 Kalender</button>` : ``}${p.custom ? `<button class="btn sm ghost danger" data-delplan="${p.id}">Löschen</button>` : ''}${pr?.p.id === p.id ? '<span class="small" style="color:var(--ok)">Aktiv</span>' : `<button class="btn sm pri" data-start="${p.id}">Plan starten</button>`}</div>
    </article>`).join('')}</section>`;

  const fromText = () => { const t = $('#cpText', el).value; if (!t.trim()) throw new Error('Bitte zuerst Text einfügen'); return parsePlanText(t); };
  $('#cpTextCheck', el).onclick = () => { try { const p = fromText(), dur = p.wos.reduce((a, w) => a + w.segs.reduce((x, g) => x + g.dur, 0), 0); $('#cpTextInfo', el).textContent = `„${p.name}“: ${p.weeksLayout.length} Wochen, ${p.wos.length} Workouts, ${fmtDur(dur)} gesamt`; } catch (err) { $('#cpTextInfo', el).textContent = '⚠ ' + err.message; } };
  $('#cpTextGo', el).onclick = async () => {
    try {
      const p = fromText(), id = await addCustomPlan($('#cpName', el).value.trim() || p.name, p.perWeek, p.wos, p.weeksLayout);
      toast(`Plan „${p.name}“ mit ${p.wos.length} Workouts angelegt`);
      if (!plan.active && await dialog({ title: 'Plan gleich starten?', buttons: [{ label: 'Später', value: false }, { label: 'Starten', value: true, cls: 'pri' }] })) startPlan(id);
      render(el);
    } catch (err) { toast(err.message, 5000); }
  };
  // Fertige Plan-Dateien direkt übernehmen
  $('#cpPlanFile', el).onchange = async e => {
    const r = await readFiles([...e.target.files], profile.ftp); r.errors.forEach(m => toast(m, 5000));
    if (!r.plans.length) { if (r.workouts.length || r.zips.length) toast('Das sind Workout-Dateien. Unten unter „Plan importieren“ wird daraus ein Plan, oder unter Workouts einzeln importieren.', 6000); return; }
    let id = null; for (const p of r.plans) id = await addCustomPlan(p.name, p.perWeek, p.wos, p.weeksLayout);
    toast(r.plans.length > 1 ? `${r.plans.length} Pläne importiert` : `Plan „${r.plans[0].name}“ mit ${r.plans[0].wos.length} Workouts importiert`, 4000);
    if (!plan.active && await dialog({ title: 'Plan gleich starten?', buttons: [{ label: 'Später', value: false }, { label: 'Starten', value: true, cls: 'pri' }] })) startPlan(id);
    render(el);
  };
  $('#cpFiles', el).onchange = async e => {
    const files = [...e.target.files].sort((a, b) => a.name.localeCompare(b.name, 'de', { numeric: true }));
    const r = await readFiles(files, profile.ftp); r.errors.forEach(m => toast(m, 5000));
    const per = +$('#cpPer', el).value || 3, nm = $('#cpName', el).value.trim();
    let id = null, n = 0;
    for (const p of r.plans) { id = await addCustomPlan(nm || p.name, p.perWeek, p.wos, p.weeksLayout); n++; }
    for (const z of r.zips) { id = await addCustomPlan(nm || z.name, per, z.wos); n++; }
    if (r.workouts.length) { id = await addCustomPlan(nm || 'Eigener Plan', per, r.workouts); n++; }
    if (!id) return;
    toast(n > 1 ? `${n} Pläne angelegt` : 'Plan angelegt');
    if (!plan.active && await dialog({ title: 'Plan gleich starten?', buttons: [{ label: 'Später', value: false }, { label: 'Starten', value: true, cls: 'pri' }] })) startPlan(id);
    render(el);
  };
  el.querySelectorAll('canvas.pwc').forEach(c => { const w = pr.p.all.find(x => x.id === c.dataset.id); drawWorkout(c, w); });
  $('#pbGoal', el).onclick = () => goalDialog(el);
  el.onclick = async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.start) {
      if (plan.active && !(await dialog({ title: 'Plan wechseln?', html: `<p class="muted">Der aktuelle Plan „${esc(getPlan(plan.active.id).name)}“ wird beendet. Erledigte Einheiten bleiben im Verlauf.</p>`, buttons: [{ label: 'Abbrechen', value: false }, { label: 'Wechseln', value: true, cls: 'pri' }] }))) return;
      if (plan.active) stopPlan();
      startPlan(b.dataset.start); toast('Plan gestartet. Viel Erfolg!'); render(el); window.scrollTo(0, 0);
    }
    if (b.dataset.ics) { const C = await import('../comfort.js'); C.downloadPlanIcs(getPlan(b.dataset.ics), plan.active?.done || {}); toast('Kalenderdatei gespeichert – öffnen, um die Termine in deinen Kalender zu übernehmen', 5000); return; }
    if (b.dataset.expplan) {
      const p = getPlan(b.dataset.expplan), base = p.name.replace(/[^\wäöüÄÖÜß -]+/g, '').trim() || 'plan';
      const fmt = await dialog({ title: 'Plan exportieren', html: '<p class="muted"><b>FIT (ZIP)</b>: jedes Workout des Plans als FIT-Datei für deinen Radcomputer, nummeriert in Reihenfolge.</p><p class="muted"><b>IndooRado-Datei</b>: der ganze Plan zum Importieren in IndooRado auf einem anderen Gerät.</p>', buttons: [{ label: 'Abbrechen', value: null }, { label: 'IndooRado-Datei', value: 'json' }, { label: 'FIT (ZIP)', value: 'fit', cls: 'pri' }] });
      if (fmt === 'json') download(base + '.indoorado-plan.json', planToJson(p), 'application/json');
      if (fmt === 'fit') { const files = p.all.map((w, i) => ({ name: String(i + 1).padStart(2, '0') + ' ' + (w.name.replace(/[^\wäöüÄÖÜß -]+/g, '').trim() || 'Workout') + '.fit', data: toFitWorkout(w) })); download(base + ' (FIT).zip', zipStore(files), 'application/zip'); }
      return;
    }
    if (b.dataset.delplan) { if (await dialog({ title: 'Eigenen Plan löschen?', buttons: [{ label: 'Abbrechen', value: false }, { label: 'Löschen', value: true, cls: 'danger' }] })) { await deleteCustomPlan(b.dataset.delplan); render(el); } return; }
    if (b.dataset.go) { sel.workoutId = b.dataset.go; saveSel(); location.hash = '#/ride'; }
    if (b.dataset.pick) { sel.workoutId = b.dataset.pick; saveSel(); toast('Für die nächste Fahrt ausgewählt'); }
    if (b.dataset.skip) { skip(b.dataset.skip); render(el); }
    if (b.dataset.unskip) { unskip(b.dataset.unskip); render(el); }
    if (b.dataset.stop != null) { if (await dialog({ title: 'Plan beenden?', buttons: [{ label: 'Abbrechen', value: false }, { label: 'Beenden', value: true, cls: 'danger' }] })) { stopPlan(); render(el); } }
  };
}

// Kalenderdaten: Woche 1 beginnt am Montag der Startwoche des Plans
const startMon = () => { const d = new Date(plan.active?.start || Date.now()); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; };
const fmtD = d => d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
function wkDates(i) { const a = new Date(+startMon() + i * 7 * 864e5), b = new Date(+a + 6 * 864e5); return fmtD(a) + '–' + fmtD(b); }
function isNow(i) { const a = +startMon() + i * 7 * 864e5; return Date.now() >= a && Date.now() < a + 7 * 864e5; }
function active(pr) {
  const { p, next } = pr, d = plan.active.done;
  return `<section class="card planbox" style="--pc:${p.color}">
    <div class="row between"><div><div class="small muted">Aktiver Plan</div><h2 style="margin:0">${esc(p.name)}</h2></div>
      <div class="planring" style="--f:${(pr.frac * 100).toFixed(1)}"><b class="num">${Math.round(pr.frac * 100)} %</b></div></div>
    <div class="small muted">${pr.done} von ${pr.total} Einheiten · ${pr.finished ? 'Plan abgeschlossen 🎉' : 'Woche ' + pr.week + ' von ' + p.weeks.length}</div>
    <div class="small" title="Gut getroffene Einheiten heben die Intensität um 2 %, abgebrochene oder gedrosselte senken sie um 3 %">📈 Plan passt sich an: Intensität <b>${100 + (progress.planAdapt || 0)} %</b>${progress.planAdapt ? '' : ' (noch keine Anpassung)'}</div>
    ${next ? `<div class="nextwo"><div><div class="small muted">Als Nächstes</div><b>${esc(next.name)}</b> <span class="small muted num">· ${fmtDur(stats(next).dur)} · TSS ${stats(next).tss}</span></div><canvas class="pwc" data-id="${next.id}"></canvas>
      <div class="row end"><button class="btn sm ghost" data-skip="${next.id}">Überspringen</button><button class="btn sm" data-pick="${next.id}">Auswählen</button><button class="btn sm pri" data-go="${next.id}">Jetzt fahren</button></div></div>` : ''}
    <div class="weeks">${p.weeks.map((w, i) => `<div class="wk ${next?.week === i + 1 ? 'cur' : ''}"><div class="small muted">Woche ${i + 1} · ${wkDates(i)}${isNow(i) ? ' · <b style="color:var(--acc)">diese Woche</b>' : ''}</div>${w.map(x => {
      const st = d[x.id] ? (d[x.id].skipped ? 'skip' : 'done') : x.id === next?.id ? 'next' : '';
      return `<div class="wkit ${st}" title="${esc(x.name)}"><span class="dot"></span><span class="nm">${esc(x.name)}</span><span class="small muted num">${Math.round(stats(x).dur / 60)}′</span>${st === 'skip' ? `<button class="btn xs ghost" data-unskip="${x.id}">↺</button>` : st === '' || st === 'next' ? `<button class="btn xs ghost" data-go="${x.id}" title="Fahren">▶</button>` : ''}</div>`;
    }).join('')}</div>`).join('')}</div>
    <div class="row end"><button class="btn sm ghost danger" data-stop>Plan beenden</button></div>
  </section>`;
}

/* ---------- Planbauer mit Zieldatum ---------- */
async function goalDialog(el) {
  const PB = await import('../planbuilder.js');
  const d0 = new Date(Date.now() + 10 * 7 * 864e5).toISOString().slice(0, 10);
  const w = document.createElement('div'); w.className = 'modal on';
  w.innerHTML = `<div class="card dlg" role="dialog" aria-modal="true"><h2>🎯 Plan für mein Ziel</h2><div class="dlg-body form">
    <label class="f">Dein Ziel<input class="inp" id="gName" maxlength="40" placeholder="z. B. Alpenmarathon, 100 km am Stück, Bergzeitfahren"></label>
    <div class="grid2 tight"><label class="f">Datum<input class="inp" id="gDate" type="date" value="${d0}" min="${new Date(Date.now() + 28 * 864e5).toISOString().slice(0, 10)}"></label>
    <label class="f">Schwerpunkt<select class="inp" id="gFocus">${Object.entries(PB.FOCUS).map(([k, f]) => `<option value="${k}">${f.n}</option>`).join('')}</select></label></div>
    <div class="grid2 tight"><label class="f">Stunden pro Woche<input class="inp" id="gHours" type="number" min="2" max="20" step="0.5" value="6"></label>
    <label class="f">Einheiten pro Woche<input class="inp" id="gPer" type="number" min="2" max="7" value="4"></label></div>
    <p class="small muted" id="gInfo"></p></div>
    <div class="row end"><button class="btn ghost" data-x>Abbrechen</button><button class="btn pri" id="gGo">Plan erstellen</button></div></div>`;
  document.body.appendChild(w);
  const read = () => ({ goal: w.querySelector('#gName').value.trim(), date: w.querySelector('#gDate').value, hours: +w.querySelector('#gHours').value || 6, perWeek: +w.querySelector('#gPer').value || 4, focus: w.querySelector('#gFocus').value });
  const info = () => { const o = read(), p = PB.buildPlan(o); w.querySelector('#gInfo').textContent = `${p.weeks} Wochen: ${p.phases.base} Grundlage, ${p.phases.build} Aufbau, ${p.phases.peak} Spitze, 1 Woche Formaufbau. Jede 4. Woche ist eine Erholungswoche. Die lange Ausfahrt liegt jeweils am Ende der Woche.`; };
  w.addEventListener('input', info); info();
  w.addEventListener('click', async e => {
    if (e.target === w || e.target.closest('[data-x]')) { w.remove(); return; }
    if (e.target.closest('#gGo')) {
      const o = read(); if (!o.date) return toast('Bitte ein Datum wählen');
      const p = PB.buildPlan(o), id = await addCustomPlan(p.name, p.perWeek, p.wos, p.layout);
      w.remove();
      if (!plan.active || await dialog({ title: 'Plan gleich starten?', html: '<p class="muted">Dein aktueller Plan wird dann beendet.</p>', buttons: [{ label: 'Später', value: false }, { label: 'Starten', value: true, cls: 'pri' }] })) { if (plan.active) stopPlan(); startPlan(id); }
      toast(`Plan „${p.name}“ erstellt: ${p.weeks} Wochen bis zum Ziel`, 4000); render(el);
    }
  });
}
