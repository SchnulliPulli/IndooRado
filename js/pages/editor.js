// Workout-Editor: eigene Workouts aus Bausteinen zusammenstellen
import { $, esc, fmtDur, toast, dialog, clamp } from '../util.js';
import { profile, sel, saveSel } from '../state.js';
import { getWorkout, saveWorkout, stats, drawWorkout } from '../workouts.js';

const TYPES = { warm: 'Aufwärmen', steady: 'Konstant', int: 'Intervalle', ramp: 'Rampe', free: 'Frei fahren', cool: 'Ausrollen' };
const blankBlock = t => ({ t, dur: t === 'int' ? 60 : t === 'free' ? 600 : t === 'warm' || t === 'cool' ? 600 : 300, a: t === 'warm' ? 45 : t === 'cool' ? 65 : t === 'int' ? 110 : 75, b: t === 'warm' ? 70 : t === 'cool' ? 40 : 90, n: 5, off: 60, offP: 50, cad: '', text: '' });

// Bausteine in Abschnitte (segs) umwandeln
function toSegs(blocks) {
  const segs = [];
  for (const k of blocks) {
    const cad = +k.cad || undefined, text = k.text || undefined;
    if (k.t === 'free') segs.push({ dur: k.dur, a: null, b: null, text });
    else if (k.t === 'steady') segs.push({ dur: k.dur, a: k.a / 100, b: k.a / 100, cad, text });
    else if (k.t === 'int') for (let i = 0; i < k.n; i++) { segs.push({ dur: k.dur, a: k.a / 100, b: k.a / 100, cad, text: text || `Intervall ${i + 1}/${k.n}` }); segs.push({ dur: k.off, a: k.offP / 100, b: k.offP / 100, text: 'Erholen' }); }
    else segs.push({ dur: k.dur, a: k.a / 100, b: k.b / 100, cad, text });
  }
  return segs.filter(s => s.dur > 0);
}
// Vorhandenes Workout grob zurück in Bausteine (für eigene Workouts ohne Bausteine)
const fromSegs = segs => segs.map(s => s.a == null ? { ...blankBlock('free'), dur: s.dur, text: s.text || '' } : Math.abs(s.a - s.b) < .005 ? { ...blankBlock('steady'), dur: s.dur, a: Math.round(s.a * 100), cad: s.cad || '', text: s.text || '' } : { ...blankBlock('ramp'), dur: s.dur, a: Math.round(s.a * 100), b: Math.round(s.b * 100), cad: s.cad || '', text: s.text || '' });

const mmss = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const parseT = v => { const m = String(v).trim().match(/^(\d+)(?::(\d{1,2}))?$/); return m ? +m[1] * 60 + (+m[2] || 0) : null; };

export async function render(el, [id]) {
  const src = id ? await getWorkout(id) : null;
  const W = { id: src && !src.builtin ? src.id : null, name: src ? (src.builtin ? src.name + ' (Kopie)' : src.name) : 'Mein Workout', desc: src?.desc || '', blocks: src?.blocks ? JSON.parse(JSON.stringify(src.blocks)) : src ? fromSegs(src.segs) : [blankBlock('warm'), blankBlock('int'), blankBlock('cool')] };
  const draw = () => {
    el.innerHTML = `
    <section class="pagehead"><h1>Workout-Editor</h1><span class="row"><a class="btn sm ghost" href="#/workouts">Abbrechen</a><button class="btn sm" id="eRide">Speichern und fahren</button><button class="btn sm pri" id="eSave">Speichern</button></span></section>
    <section class="card form">
      <div class="grid2 tight"><label class="f">Name<input class="inp" id="eName" value="${esc(W.name)}" maxlength="60"></label><label class="f">Beschreibung<input class="inp" id="eDesc" value="${esc(W.desc)}" maxlength="200"></label></div>
      <canvas id="ePrev" class="eprev"></canvas>
      <div class="small muted num" id="eStat"></div>
    </section>
    <section class="eblocks">${W.blocks.map((k, i) => `
      <div class="card eblock" data-i="${i}">
        <div class="row between"><select class="inp sm" data-f="t">${Object.entries(TYPES).map(([v, l]) => `<option value="${v}" ${k.t === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
          <span class="row"><button class="btn xs ghost" data-m="-1" title="Nach oben">↑</button><button class="btn xs ghost" data-m="1" title="Nach unten">↓</button><button class="btn xs ghost" data-dup title="Kopieren">⧉</button><button class="btn xs ghost danger" data-del title="Entfernen">✕</button></span></div>
        <div class="egrid">
          ${k.t === 'int' ? `<label class="f">Anzahl<input class="inp sm" data-f="n" type="number" min="1" max="50" value="${k.n}"></label>` : ''}
          <label class="f">${k.t === 'int' ? 'Belastung' : 'Dauer'} (m:ss)<input class="inp sm" data-f="dur" value="${mmss(k.dur)}"></label>
          ${k.t === 'free' ? '' : `<label class="f">${k.t === 'warm' || k.t === 'cool' || k.t === 'ramp' ? 'Von' : 'Leistung'} (% FTP)<input class="inp sm" data-f="a" type="number" min="20" max="250" value="${k.a}"></label>`}
          ${['warm', 'cool', 'ramp'].includes(k.t) ? `<label class="f">Bis (% FTP)<input class="inp sm" data-f="b" type="number" min="20" max="250" value="${k.b}"></label>` : ''}
          ${k.t === 'int' ? `<label class="f">Pause (m:ss)<input class="inp sm" data-f="off" value="${mmss(k.off)}"></label><label class="f">Pause (% FTP)<input class="inp sm" data-f="offP" type="number" min="20" max="120" value="${k.offP}"></label>` : ''}
          ${k.t === 'free' ? '' : `<label class="f">Kadenz (optional)<input class="inp sm" data-f="cad" type="number" min="40" max="130" value="${k.cad}"></label>`}
          <label class="f wide">Hinweis (optional)<input class="inp sm" data-f="text" value="${esc(k.text)}" maxlength="80"></label>
        </div>
        <div class="small muted num">${k.t === 'free' ? 'frei' : k.t === 'int' ? `${k.n} × ${mmss(k.dur)} bei ${Math.round(k.a * profile.ftp / 100)} W, Pause ${mmss(k.off)} bei ${Math.round(k.offP * profile.ftp / 100)} W` : ['warm', 'cool', 'ramp'].includes(k.t) ? `${Math.round(k.a * profile.ftp / 100)} → ${Math.round(k.b * profile.ftp / 100)} W` : `${Math.round(k.a * profile.ftp / 100)} W`}</div>
      </div>`).join('')}</section>
    <section class="row">${Object.entries(TYPES).map(([v, l]) => `<button class="btn sm" data-add="${v}">+ ${l}</button>`).join('')}</section>`;
    upd();
  };
  const upd = () => { const w = { segs: toSegs(W.blocks) }; drawWorkout($('#ePrev', el), w); const s = stats(w); $('#eStat', el).textContent = w.segs.length ? `${fmtDur(s.dur)} · TSS ${s.tss} · IF ${s.IF.toFixed(2).replace('.', ',')} · bei FTP ${profile.ftp} W` : 'Noch keine Abschnitte'; };
  el.oninput = e => {
    const b = e.target.closest('.eblock'), f = e.target.dataset.f;
    if (e.target.id === 'eName') W.name = e.target.value; if (e.target.id === 'eDesc') W.desc = e.target.value;
    if (!b || !f || f === 't') return;
    const k = W.blocks[+b.dataset.i];
    if (f === 'dur' || f === 'off') { const v = parseT(e.target.value); if (v == null) return; k[f] = clamp(v, 5, 6 * 3600); }
    else if (f === 'text' || f === 'cad') k[f] = e.target.value;
    else { const v = +e.target.value; if (!isNaN(v)) k[f] = v; }
    upd();
  };
  el.onchange = e => { const b = e.target.closest('.eblock'); if (b && e.target.dataset.f === 't') { const i = +b.dataset.i, old = W.blocks[i]; W.blocks[i] = { ...blankBlock(e.target.value), dur: old.dur, text: old.text }; draw(); } else if (b) draw(); };
  el.onclick = async e => {
    const add = e.target.closest('[data-add]'); if (add) { W.blocks.push(blankBlock(add.dataset.add)); draw(); return; }
    const b = e.target.closest('.eblock'); const i = b ? +b.dataset.i : -1;
    if (e.target.closest('[data-del]')) { W.blocks.splice(i, 1); draw(); }
    if (e.target.closest('[data-dup]')) { W.blocks.splice(i + 1, 0, JSON.parse(JSON.stringify(W.blocks[i]))); draw(); }
    const m = e.target.closest('[data-m]'); if (m) { const j = i + +m.dataset.m; if (j >= 0 && j < W.blocks.length) { [W.blocks[i], W.blocks[j]] = [W.blocks[j], W.blocks[i]]; draw(); } }
    const save = async ride => {
      const segs = toSegs(W.blocks); if (!segs.length) { toast('Bitte mindestens einen Abschnitt anlegen'); return; }
      const wo = { id: W.id || 'u-' + Date.now().toString(36), name: W.name.trim() || 'Mein Workout', cat: 'Eigene', desc: W.desc, segs, blocks: W.blocks, builtin: false, created: new Date().toISOString() };
      await saveWorkout(wo); W.id = wo.id; toast('Workout gespeichert');
      if (ride) { sel.workoutId = wo.id; saveSel(); location.hash = '#/ride'; } else location.hash = '#/workouts';
    };
    if (e.target.id === 'eSave') save(false);
    if (e.target.id === 'eRide') save(true);
  };
  draw();
}
