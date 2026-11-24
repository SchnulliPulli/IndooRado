// Workout-Bibliothek mit Import und Vorschau
import { $, esc, fmtDur, toast, dialog, fmtT } from '../util.js';
import { profile, sel, saveSel } from '../state.js';
import { listWorkouts, stats, drawWorkout, parseZwo, parseErg, saveWorkout, deleteWorkout } from '../workouts.js';

export async function render(el) {
  const wos = await listWorkouts(), cats = [...new Set(wos.map(w => w.cat))];
  el.innerHTML = `
  <section class="pagehead"><h1>Workouts</h1><label class="btn pri">Datei importieren<input type="file" id="wFile" accept=".zwo,.erg,.mrc,.xml,.txt" multiple hidden></label></section>
  <p class="muted">Zwift-Workouts (.zwo) sowie .erg- und .mrc-Dateien werden unterstützt. Ziele werden aus deiner FTP von ${profile.ftp} W berechnet. Datei auch per Drag & Drop auf diese Seite ziehen.</p>
  <div class="chips-row" id="cats"><button class="chipb on" data-c="">Alle</button>${cats.map(c => `<button class="chipb" data-c="${esc(c)}">${esc(c)}</button>`).join('')}</div>
  <div class="wgrid" id="wList">${wos.map(w => { const s = stats(w); return `
    <article class="wcard ${w.id === sel.workoutId ? 'on' : ''}" data-cat="${esc(w.cat)}" data-id="${esc(w.id)}">
      <div class="row between"><span class="tag">${esc(w.cat)}</span><span class="small muted num">${fmtDur(s.dur)} · TSS ${s.tss}</span></div>
      <h3>${esc(w.name)}</h3><canvas class="wc"></canvas><p class="small muted">${esc(w.desc || '')}</p>
      <div class="row end"><button class="btn sm ${w.id === sel.workoutId ? '' : 'pri'}" data-sel>${w.id === sel.workoutId ? 'Ausgewählt' : 'Auswählen'}</button><button class="btn sm" data-go>Jetzt fahren</button>${w.builtin ? '' : '<button class="btn sm ghost danger" data-del>Löschen</button>'}</div>
    </article>`; }).join('')}</div>`;
  const list = wos;
  el.querySelectorAll('.wcard').forEach(c => drawWorkout(c.querySelector('canvas'), list.find(w => w.id === c.dataset.id)));
  $('#cats', el).onclick = e => { const b = e.target.closest('[data-c]'); if (!b) return; for (const x of $('#cats', el).children) x.classList.toggle('on', x === b); el.querySelectorAll('.wcard').forEach(c => c.hidden = b.dataset.c && c.dataset.cat !== b.dataset.c); };
  $('#wList', el).onclick = async e => {
    const card = e.target.closest('.wcard'); if (!card) return; const id = card.dataset.id;
    if (e.target.closest('[data-sel]')) { sel.workoutId = sel.workoutId === id ? null : id; saveSel(); render(el); }
    if (e.target.closest('[data-go]')) { sel.workoutId = id; saveSel(); location.hash = '#/ride'; }
    if (e.target.closest('[data-del]')) { if (await dialog({ title: 'Workout löschen?', buttons: [{ label: 'Abbrechen', value: false }, { label: 'Löschen', value: true, cls: 'danger' }] })) { await deleteWorkout(id); if (sel.workoutId === id) { sel.workoutId = null; saveSel(); } render(el); } }
  };
  const load = async files => {
    let n = 0;
    for (const f of files) { try { const t = await f.text(); const w = /\.zwo$/i.test(f.name) || /<workout/i.test(t.slice(0, 4000)) ? parseZwo(t, f.name) : parseErg(t, f.name, profile.ftp); await saveWorkout(w); n++; } catch (e) { toast(f.name + ': ' + e.message, 5000); } }
    if (n) { toast(n + ' Workout' + (n > 1 ? 's' : '') + ' importiert'); render(el); }
  };
  $('#wFile', el).onchange = e => load(e.target.files);
  el.ondragover = e => e.preventDefault(); el.ondrop = e => { e.preventDefault(); load(e.dataTransfer.files); };
}
