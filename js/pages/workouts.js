// Workout-Bibliothek mit Import, Export und Vorschau
import { $, esc, fmtDur, toast, dialog, download } from '../util.js';
import { profile, sel, saveSel } from '../state.js';
import { listWorkouts, stats, drawWorkout, saveWorkout, deleteWorkout } from '../workouts.js';
import { readFiles, toZwo } from '../fileio.js';
import { addCustomPlan } from '../plans.js';

export async function render(el) {
  const wos = await listWorkouts(), cats = [...new Set(wos.map(w => w.cat))];
  el.innerHTML = `
  <section class="pagehead"><h1>Workouts</h1><span class="row"><a class="btn" href="#/editor">+ Neues Workout</a><label class="btn pri">Dateien importieren<input type="file" id="wFile" accept=".zwo,.erg,.mrc,.json,.zip,.xml,.txt" multiple hidden></label></span></section>
  <p class="muted">Import: Zwift-Workouts (.zwo), .erg und .mrc, VeloVerse-Dateien (.json) und ZIP-Archive mit solchen Dateien. Ziele werden aus deiner FTP von ${profile.ftp} W berechnet. Dateien auch per Drag & Drop auf diese Seite ziehen. Alles bleibt im Browser gespeichert. <a href="#/help">Anleitung</a></p>
  <div class="chips-row" id="cats"><button class="chipb on" data-c="">Alle</button>${cats.map(c => `<button class="chipb" data-c="${esc(c)}">${esc(c)}</button>`).join('')}</div>
  <div class="wgrid" id="wList">${wos.map(w => { const s = stats(w); return `
    <article class="wcard ${w.id === sel.workoutId ? 'on' : ''}" data-cat="${esc(w.cat)}" data-id="${esc(w.id)}">
      <div class="row between"><span class="tag">${esc(w.cat)}</span><span class="small muted num">${fmtDur(s.dur)} · TSS ${s.tss}</span></div>
      <h3>${esc(w.name)}</h3><canvas class="wc"></canvas><p class="small muted">${esc(w.desc || '')}</p>
      <div class="row end"><a class="btn sm ghost" href="#/editor/${esc(w.id)}" title="${w.builtin ? 'Als Vorlage für ein eigenes Workout' : 'Bearbeiten'}">${w.builtin ? 'Anpassen' : 'Bearbeiten'}</a><button class="btn sm ghost" data-exp title="Als .zwo speichern">Export</button>${w.builtin ? '' : '<button class="btn sm ghost danger" data-del>Löschen</button>'}<button class="btn sm ${w.id === sel.workoutId ? '' : 'pri'}" data-sel>${w.id === sel.workoutId ? 'Ausgewählt' : 'Auswählen'}</button><button class="btn sm" data-go>Jetzt fahren</button></div>
    </article>`; }).join('')}</div>`;
  el.querySelectorAll('.wcard').forEach(c => drawWorkout(c.querySelector('canvas'), wos.find(w => w.id === c.dataset.id)));
  $('#cats', el).onclick = e => { const b = e.target.closest('[data-c]'); if (!b) return; for (const x of $('#cats', el).children) x.classList.toggle('on', x === b); el.querySelectorAll('.wcard').forEach(c => c.hidden = b.dataset.c && c.dataset.cat !== b.dataset.c); };
  $('#wList', el).onclick = async e => {
    const card = e.target.closest('.wcard'); if (!card) return; const id = card.dataset.id, w = wos.find(x => x.id === id);
    if (e.target.closest('[data-sel]')) { sel.workoutId = sel.workoutId === id ? null : id; saveSel(); render(el); }
    if (e.target.closest('[data-go]')) { sel.workoutId = id; saveSel(); location.hash = '#/ride'; }
    if (e.target.closest('[data-exp]')) download(w.name.replace(/[^\wäöüÄÖÜß -]+/g, '').trim() + '.zwo', toZwo(w), 'application/xml');
    if (e.target.closest('[data-del]')) { if (await dialog({ title: 'Workout löschen?', buttons: [{ label: 'Abbrechen', value: false }, { label: 'Löschen', value: true, cls: 'danger' }] })) { await deleteWorkout(id); if (sel.workoutId === id) { sel.workoutId = null; saveSel(); } render(el); } }
  };
  const load = async files => {
    const r = await readFiles([...files], profile.ftp);
    for (const w of r.workouts) await saveWorkout(w);
    let plans = 0;
    for (const p of r.plans) { await addCustomPlan(p.name, p.perWeek, p.wos); plans++; }
    for (const z of r.zips) {
      const asPlan = await dialog({ title: `${z.name}: ${z.wos.length} Workouts`, html: '<p>Als Trainingsplan anlegen (Reihenfolge nach Dateiname, 3 pro Woche) oder einzeln in die Bibliothek übernehmen?</p>', buttons: [{ label: 'Einzeln', value: false }, { label: 'Als Plan', value: true, cls: 'pri' }] });
      if (asPlan) { await addCustomPlan(z.name, 3, z.wos); plans++; } else for (const w of z.wos) { await saveWorkout(w); r.workouts.push(w); }
    }
    for (const m of r.errors) toast(m, 5000);
    if (r.workouts.length || plans) { toast(`${r.workouts.length} Workout${r.workouts.length === 1 ? '' : 's'}${plans ? ` und ${plans} Plan${plans > 1 ? 'pläne' : ''}` : ''} importiert`); render(el); }
  };
  $('#wFile', el).onchange = e => load(e.target.files);
  el.ondragover = e => e.preventDefault(); el.ondrop = e => { e.preventDefault(); load(e.dataTransfer.files); };
}
