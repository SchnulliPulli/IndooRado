// Trainingsplan-Editor: Wochen anlegen und Workouts aus der Bibliothek einplanen
import { $, esc, fmtDur, toast, dialog } from '../util.js';
import { profile } from '../state.js';
import { listWorkouts, stats, getWorkout } from '../workouts.js';
import { getPlan, saveCustomPlan, customRecord, startPlan, plan } from '../plans.js';

export async function render(el, [id]) {
  const lib = (await listWorkouts()).filter(w => !w.planId);
  // Quelle: eigener Plan (bearbeiten), eingebauter Plan (als Vorlage) oder leer
  const rec = id ? await customRecord(id) : null, base = !rec && id ? getPlan(id) : null;
  const P = { id: rec?.id || null, name: rec?.name || (base ? base.name + ' (eigene Version)' : 'Mein Plan'), weeks: [] };
  if (rec || base) { const p = getPlan(rec ? rec.id : base.id); P.weeks = p.weeks.map(wk => wk.map(w => ({ name: w.name, desc: w.desc, segs: w.segs }))); }
  else P.weeks = [[null, null, null], [null, null, null], [null, null, null], [null, null, null]];
  const opts = cur => `<option value="">– frei / Ruhetag –</option>${[...new Set(lib.map(w => w.cat))].map(c => `<optgroup label="${esc(c)}">${lib.filter(w => w.cat === c).map(w => `<option value="${esc(w.id)}" ${cur && cur.src === w.id ? 'selected' : ''}>${esc(w.name)} · ${fmtDur(stats(w).dur)}</option>`).join('')}</optgroup>`).join('')}${cur && !cur.src ? `<option value="__keep" selected>${esc(cur.name)} (aus Vorlage)</option>` : ''}`;
  const draw = () => {
    const all = P.weeks.flat().filter(Boolean), tss = all.reduce((s, w) => s + stats(w).tss, 0), dur = all.reduce((s, w) => s + stats(w).dur, 0);
    el.innerHTML = `
    <section class="pagehead"><h1>Plan-Editor</h1><span class="row"><a class="btn sm ghost" href="#/plans">Abbrechen</a><button class="btn sm" id="pStart">Speichern und starten</button><button class="btn sm pri" id="pSave">Speichern</button></span></section>
    <section class="card form">
      <label class="f">Name des Plans<input class="inp" id="pName" value="${esc(P.name)}" maxlength="60"></label>
      <div class="small muted num">${P.weeks.length} Wochen · ${all.length} Einheiten · ${fmtDur(dur)} · TSS ${tss} gesamt · Ziele aus deiner FTP (${profile.ftp} W)</div>
      <div class="pweeks big">${P.weeks.map((wk, i) => `<i style="height:${Math.round(10 + 60 * wk.filter(Boolean).reduce((s, w) => s + stats(w).tss, 0) / Math.max(1, ...P.weeks.map(x => x.filter(Boolean).reduce((s, w) => s + stats(w).tss, 0))))}px" title="Woche ${i + 1}"></i>`).join('')}</div>
      <p class="small muted">Tipp: alle 3 bis 4 Wochen eine leichtere Erholungswoche einplanen. Workouts baust du im <a href="#/editor">Workout-Editor</a>, eingebaute Pläne lassen sich unter „Pläne“ als Vorlage öffnen.</p>
    </section>
    <section class="pweekgrid">${P.weeks.map((wk, i) => `
      <div class="card pwk" data-w="${i}">
        <div class="row between"><b>Woche ${i + 1}</b><span class="row"><span class="small muted num">TSS ${wk.filter(Boolean).reduce((s, w) => s + stats(w).tss, 0)}</span><button class="btn xs ghost" data-dupw title="Woche kopieren">⧉</button><button class="btn xs ghost danger" data-delw title="Woche löschen">✕</button></span></div>
        ${wk.map((w, j) => `<div class="row pslot"><select class="inp sm" data-s="${j}">${opts(w)}</select><button class="btn xs ghost" data-dels="${j}" title="Einheit entfernen">−</button></div>`).join('')}
        <button class="btn xs" data-adds>+ Einheit</button>
      </div>`).join('')}</section>
    <div class="row"><button class="btn" id="pAddW">+ Woche</button></div>`;
  };
  el.oninput = e => { if (e.target.id === 'pName') P.name = e.target.value; };
  el.onchange = async e => {
    const s = e.target.dataset.s; if (s == null) return;
    const wi = +e.target.closest('[data-w]').dataset.w, v = e.target.value;
    if (v === '__keep') return;
    const w = v ? await getWorkout(v) : null;
    P.weeks[wi][+s] = w ? { name: w.name, desc: w.desc, segs: w.segs, src: w.id } : null; draw();
  };
  el.onclick = async e => {
    const W = e.target.closest('[data-w]'), wi = W ? +W.dataset.w : -1;
    if (e.target.id === 'pAddW') { P.weeks.push(P.weeks.length ? P.weeks[P.weeks.length - 1].map(() => null) : [null, null, null]); draw(); }
    if (e.target.closest('[data-dupw]')) { P.weeks.splice(wi + 1, 0, P.weeks[wi].map(x => x && { ...x })); draw(); }
    if (e.target.closest('[data-delw]')) { P.weeks.splice(wi, 1); draw(); }
    if (e.target.closest('[data-adds]')) { P.weeks[wi].push(null); draw(); }
    const ds = e.target.closest('[data-dels]'); if (ds) { P.weeks[wi].splice(+ds.dataset.dels, 1); draw(); }
    const save = async go => {
      const weeks = P.weeks.map(wk => wk.filter(Boolean)).filter(wk => wk.length);
      if (!weeks.length) { toast('Bitte mindestens eine Einheit einplanen'); return; }
      const nid = await saveCustomPlan({ id: P.id, name: P.name.trim() || 'Mein Plan', perWeek: Math.max(...weeks.map(w => w.length)), wos: weeks.flat(), weeksLayout: weeks.map(w => w.length) });
      P.id = nid; toast('Plan gespeichert');
      if (go) { if (plan.active && plan.active.id !== nid && !(await dialog({ title: 'Plan wechseln?', html: '<p class="muted">Der aktuelle Plan wird beendet.</p>', buttons: [{ label: 'Abbrechen', value: false }, { label: 'Wechseln', value: true, cls: 'pri' }] }))) return; startPlan(nid); }
      location.hash = '#/plans';
    };
    if (e.target.id === 'pSave') save(false);
    if (e.target.id === 'pStart') save(true);
  };
  draw();
}
