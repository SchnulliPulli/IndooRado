// Workout-Bibliothek mit Import, Export und Vorschau
import { $, esc, fmtDur, toast, dialog, download } from '../util.js';
import { profile, sel, saveSel, saveProfile } from '../state.js';
import { listWorkouts, stats, drawWorkout, saveWorkout, deleteWorkout, fitInfo, fitToTime } from '../workouts.js';
import { readFiles, toZwo, toFitWorkout } from '../fileio.js';
import { addCustomPlan } from '../plans.js';

export async function render(el) {
  const all = await listWorkouts(), cats = [...new Set(all.map(w => w.cat))];
  // Verfügbare Zeit: passende Workouts zuerst, längere/kürzere sinnvoll angepasst (siehe fitToTime)
  const T = +profile.woTime || 0, showAll = !!profile.woTimeAll;
  const wos = !T ? all : all.map(w => { const i = fitInfo(w, T * 60); return { w, i }; })
    .filter(x => x.i.fits || x.i.adaptable || showAll)
    .sort((a, b) => (b.i.fits - a.i.fits) || Math.abs(Math.log(a.i.ratio)) - Math.abs(Math.log(b.i.ratio)))
    .map(({ w, i }) => i.fits || !i.adaptable ? { ...w, _orig: w, _fit: i.fits ? 'fits' : 'no' } : { ...fitToTime(w, T * 60), id: w.id, _orig: w, _fit: 'adapted', _from: Math.round(i.t / 60) });
  const hidden = T ? all.length - wos.length : 0;
  el.innerHTML = `
  <section class="pagehead"><h1>Workouts</h1><span class="row"><a class="btn" href="#/editor">+ Neues Workout</a><label class="btn pri" title="Workout-Dateien (.zwo, .erg, .mrc, .json) und Plan-Dateien (.json, .zip, .txt)">Workouts oder Pläne importieren<input type="file" id="wFile" accept=".zwo,.erg,.mrc,.json,.zip,.xml,.txt" multiple hidden></label><button class="btn" id="wUrl" title="Workout, Plan oder ZIP über eine Internetadresse laden (z. B. GitHub)">🔗 Aus Link</button></span></section>
  <p class="muted">Import: .zwo-Workouts, .erg und .mrc, IndooRado-Dateien (.json) und ZIP-Archive mit solchen Dateien. Ziele werden aus deiner FTP von ${profile.ftp} W berechnet. Dateien auch per Drag & Drop auf diese Seite ziehen. Alles bleibt im Browser gespeichert. <a href="#/help">Anleitung</a></p>
  <div class="timebar card"><div class="row between"><b>⏱️ Wie viel Zeit hast du?</b>${T ? `<span class="small muted">${wos.filter(w => w._fit === 'fits').length} passen genau, ${wos.filter(w => w._fit === 'adapted').length} angepasst${hidden ? ` · ${hidden} ausgeblendet` : ''}</span>` : ''}</div>
    <div class="row wrap" id="wTime">${[0, 20, 30, 45, 60, 75, 90, 120].map(m => `<button class="chipb ${T === m ? 'on' : ''}" data-t="${m}">${m ? m + ' min' : 'Beliebig'}</button>`).join('')}<label class="small row" style="gap:6px">oder <input class="inp sm" id="wTnum" type="number" min="15" max="240" step="5" inputmode="numeric" value="${T && ![20, 30, 45, 60, 75, 90, 120].includes(T) ? T : ''}" placeholder="min" style="width:80px"></label></div>
    ${T ? `<p class="small muted">Längere Workouts werden gekürzt, kürzere verlängert: Ein- und Ausfahren bleiben, im Hauptteil fallen ganze Wiederholungen weg oder kommen dazu, die Intervalle selbst bleiben gleich hart. Tests werden nicht verändert.</p><label class="switch small"><input type="checkbox" id="wTall" ${showAll ? 'checked' : ''}><span></span> <div class="swt">Auch unpassende zeigen</div></label>` : ''}</div>
  <div class="chips-row" id="cats"><button class="chipb on" data-c="">Alle</button>${cats.map(c => `<button class="chipb" data-c="${esc(c)}">${esc(c)}</button>`).join('')}</div>
  <div class="wgrid" id="wList">${wos.map(w => { const s = stats(w); return `
    <article class="wcard ${(w._fit === 'adapted' ? `fit:${w.id}:${T}` : w.id) === sel.workoutId ? 'on' : ''}" data-cat="${esc(w.cat)}" data-id="${esc(w.id)}">
      <div class="row between"><span class="tag">${esc(w.cat)}</span><span class="small muted num">${fmtDur(s.dur)} · TSS ${s.tss}</span></div>
      ${w._fit === 'fits' ? '<span class="fitb ok">✓ passt</span>' : w._fit === 'adapted' ? `<span class="fitb">⏱️ angepasst: ${w._from} → ${T} min</span>` : w._fit === 'no' ? '<span class="fitb no">passt nicht</span>' : ''}
      <h3>${esc(w.name)}</h3><canvas class="wc"></canvas><p class="small muted">${esc(w.desc || '')}</p>
      <div class="row end"><a class="btn sm ghost" href="#/editor/${esc(w.id)}" title="${w.builtin ? 'Als Vorlage für ein eigenes Workout' : 'Bearbeiten'}">${w.builtin ? 'Anpassen' : 'Bearbeiten'}</a><button class="btn sm ghost" data-exp title="Als Datei speichern: .fit für Garmin/Wahoo oder .zwo">Export</button>${w.builtin ? '' : '<button class="btn sm ghost danger" data-del>Löschen</button>'}${w._fit === 'adapted' ? '<button class="btn sm ghost" data-keep title="Angepasste Fassung als eigenes Workout speichern">💾 Behalten</button>' : ''}<button class="btn sm ${(w._fit === 'adapted' ? `fit:${w.id}:${T}` : w.id) === sel.workoutId ? '' : 'pri'}" data-sel>${(w._fit === 'adapted' ? `fit:${w.id}:${T}` : w.id) === sel.workoutId ? 'Ausgewählt' : 'Auswählen'}</button><button class="btn sm" data-go>Jetzt fahren</button></div>
    </article>`; }).join('')}</div>`;
  el.querySelectorAll('.wcard').forEach(c => drawWorkout(c.querySelector('canvas'), wos.find(w => w.id === c.dataset.id)));
  $('#wTime', el).onclick = e => { const b = e.target.closest('[data-t]'); if (!b) return; profile.woTime = +b.dataset.t; saveProfile(); render(el); };
  $('#wTnum', el).onchange = e => { const v = Math.round(+e.target.value / 5) * 5; profile.woTime = v ? Math.min(240, Math.max(15, v)) : 0; saveProfile(); render(el); };
  $('#wTall', el)?.addEventListener('change', e => { profile.woTimeAll = e.target.checked; saveProfile(); render(el); });
  $('#cats', el).onclick = e => { const b = e.target.closest('[data-c]'); if (!b) return; for (const x of $('#cats', el).children) x.classList.toggle('on', x === b); el.querySelectorAll('.wcard').forEach(c => c.hidden = b.dataset.c && c.dataset.cat !== b.dataset.c); };
  $('#wList', el).onclick = async e => {
    const card = e.target.closest('.wcard'); if (!card) return; const id = card.dataset.id, w = wos.find(x => x.id === id);
    if (e.target.closest('[data-sel]')) { const wid = w._fit === 'adapted' ? `fit:${id}:${T}` : id; sel.workoutId = sel.workoutId === wid ? null : wid; saveSel(); render(el); }
    const wid = w._fit === 'adapted' ? `fit:${id}:${T}` : id; // angepasste Fassung (wird beim Laden neu berechnet)
    if (e.target.closest('[data-go]')) { sel.workoutId = wid; saveSel(); location.hash = '#/ride'; }
    if (e.target.closest('[data-keep]')) { const { _orig, _fit, _from, fittedFrom, fitted, ...clean } = w; await saveWorkout({ ...clean, id: 'u-' + Date.now().toString(36), builtin: false, created: new Date().toISOString(), cat: w.cat }); toast(`„${w.name}“ als eigenes Workout gespeichert`); render(el); return; }
    if (e.target.closest('[data-exp]')) {
      const fmt = await dialog({ title: 'Workout exportieren', html: '<p class="muted"><b>FIT</b> für Radcomputer (Garmin Edge, Wahoo ELEMNT, Hammerhead …): Leistung in % FTP, dein Gerät rechnet mit seiner eigenen FTP. Datei per Garmin Express/Connect oder USB in den Ordner <code>NewFiles</code> bzw. über die Wahoo-App übertragen.</p><p class="muted"><b>ZWO</b> für andere Trainings-Apps und Plattformen (TrainingPeaks, intervals.icu …).</p>', buttons: [{ label: 'Abbrechen', value: null }, { label: '.zwo', value: 'zwo' }, { label: '.fit (Radcomputer)', value: 'fit', cls: 'pri' }] });
      const base = w.name.replace(/[^\wäöüÄÖÜß -]+/g, '').trim() || 'workout';
      if (fmt === 'fit') download(base + '.fit', toFitWorkout(w)); else if (fmt === 'zwo') download(base + '.zwo', toZwo(w), 'application/xml');
    }
    if (e.target.closest('[data-del]')) { if (await dialog({ title: 'Workout löschen?', buttons: [{ label: 'Abbrechen', value: false }, { label: 'Löschen', value: true, cls: 'danger' }] })) { await deleteWorkout(id); if (sel.workoutId === id) { sel.workoutId = null; saveSel(); } render(el); } }
  };
  const load = async files => {
    const r = await readFiles([...files], profile.ftp);
    for (const w of r.workouts) await saveWorkout(w);
    let plans = 0;
    for (const p of r.plans) { await addCustomPlan(p.name, p.perWeek, p.wos, p.weeksLayout); plans++; }
    for (const z of r.zips) {
      const asPlan = await dialog({ title: `${z.name}: ${z.wos.length} Workouts`, html: '<p>Als Trainingsplan anlegen (Reihenfolge nach Dateiname, 3 pro Woche) oder einzeln in die Bibliothek übernehmen?</p>', buttons: [{ label: 'Einzeln', value: false }, { label: 'Als Plan', value: true, cls: 'pri' }] });
      if (asPlan) { await addCustomPlan(z.name, 3, z.wos); plans++; } else for (const w of z.wos) { await saveWorkout(w); r.workouts.push(w); }
    }
    for (const m of r.errors) toast(m, 5000);
    if (r.workouts.length || plans) { toast(`${r.workouts.length} Workout${r.workouts.length === 1 ? '' : 's'}${plans ? ` und ${plans} Plan${plans > 1 ? 'pläne' : ''}` : ''} importiert`); render(el); }
  };
  $('#wFile', el).onchange = e => load(e.target.files);
  $('#wUrl', el).onclick = async () => {
    let url = '';
    const P = dialog({ title: '🔗 Workout oder Plan aus Link', html: `<label class="f">Adresse (https://…)<input class="inp" id="uIn" type="url" placeholder="https://github.com/…/workout.zwo" autocomplete="off" spellcheck="false"></label>
      <p class="small muted">Geht mit direkten Links auf .zwo, .erg, .mrc, .json, .zip oder .txt sowie mit Seiten, die solche Dateien verlinken. GitHub- und Gist-Links werden automatisch umgewandelt. Die Datei wird direkt von dieser Adresse geladen; manche Seiten erlauben das nicht – dann die Datei herunterladen und über „Importieren“ wählen.</p>`,
      buttons: [{ label: 'Abbrechen', value: false }, { label: 'Laden', value: true, cls: 'pri' }] });
    const inp = document.querySelector('.modal.on #uIn'); if (inp) { inp.oninput = () => { url = inp.value; }; inp.focus(); }
    if (!(await P) || !url.trim()) return;
    try { const { filesFromUrl } = await import('../urlimport.js'); await load(await filesFromUrl(url, t => toast(t, 1500))); }
    catch (e) { toast(e.message, 7000); }
  };
  el.ondragover = e => e.preventDefault(); el.ondrop = e => { e.preventDefault(); load(e.dataTransfer.files); };
}
