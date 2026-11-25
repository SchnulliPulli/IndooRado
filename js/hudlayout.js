// Anzeige-Ebene der Fahrt: Widgets anordnen, Größe ändern, ein- und ausblenden, eigene Widgets, Vorlagen, Stile und Farben
// Gespeichert in profile.hudLayout[small|large] = { w: { key: { x, y, w, h, z, hid } }, extras: [{ id, type, metric }], tbw }
// Skaliert wird mit der CSS-Eigenschaft "scale" (nicht "zoom"), damit Maus und Touch dieselben Maße sehen.
import { profile, saveProfile } from './state.js';
import { esc } from './util.js';

export const WIDGETS = [
  ['top', 'Leistung und Werte', 'zoom'], ['wo', 'Workout', 'zoom'], ['riders', 'Fahrerliste', 'zoom'], ['right', 'Steigung und Gang', 'zoom'],
  ['mini', 'Karte', 'size'], ['elev', 'Höhenprofil', 'size'], ['msg', 'Meldungen', 'zoom'],
];
// Zusätzliche Widgets: einzelne Werte oder Verlaufskurven
export const METRICS = {
  p3: 'Leistung 3 s', wkg: 'W/kg', hr: 'Puls', cad: 'Trittfrequenz', spd: 'Tempo', dist: 'Distanz', time: 'Fahrzeit', asc: 'Höhenmeter',
  avg: 'Ø Leistung', np: 'Normalisierte Leistung', kj: 'Arbeit (kJ)', kcal: 'Kalorien', grade: 'Steigung', target: 'Zielleistung',
  left: 'Intervall-Rest', woLeft: 'Workout-Rest', xp: 'XP der Fahrt', clock: 'Uhrzeit', tss: 'TSS bisher', ghost: 'Abstand zum Geist', hrz: 'Pulszone', pz: 'Leistungszone',
  lap: 'Rundenzeit', place: 'Platz im Feld',
};
export const GRAPHS = { gp: 'Leistung (letzte 2 min)', gh: 'Puls (letzte 5 min)', gc: 'Trittfrequenz (letzte 2 min)' };

export const STYLES = { dark: 'Dunkel', glass: 'Glas', tint: 'Farbig', neon: 'Neon', contrast: 'Kontrast', light: 'Hell', clear: 'Durchsichtig' };
export const ACCENTS = ['#ff6a3d', '#ef4458', '#f5c542', '#4fd18b', '#00c2c7', '#3fa7f5', '#7b4fd6', '#ff4fa3', '#e9eef2'];
// Vorlagen: Teilangaben, alles andere ordnet sich automatisch
const PRESETS = {
  standard: { n: 'Standard', w: {} },
  compact: { n: 'Kompakt', w: { top: { z: .8 }, wo: { z: .85 }, right: { z: .8 }, riders: { hid: 1 }, msg: { z: .85 } } },
  minimal: { n: 'Minimal', w: { riders: { hid: 1 }, mini: { hid: 1 }, right: { z: .85 }, top: { z: .9 } } },
  race: { n: 'Rennen', w: { wo: { z: .85 }, riders: { z: 1.1 } }, extras: [{ type: 'metric', metric: 'place' }, { type: 'metric', metric: 'ghost' }, { type: 'graph', metric: 'gp' }] },
  focus: { n: 'Workout-Fokus', w: { wo: { z: 1.25 }, top: { z: .85 }, riders: { hid: 1 }, mini: { hid: 1 } }, extras: [{ type: 'metric', metric: 'target' }, { type: 'metric', metric: 'left' }] },
  data: { n: 'Datenfreak', w: { riders: { hid: 1 } }, extras: [{ type: 'metric', metric: 'np' }, { type: 'metric', metric: 'tss' }, { type: 'metric', metric: 'kj' }, { type: 'graph', metric: 'gp' }, { type: 'graph', metric: 'gh' }] },
};
export const PRESET_NAMES = Object.fromEntries(Object.entries(PRESETS).map(([k, v]) => [k, v.n]));

const cls = () => (innerWidth <= 820 || innerHeight <= 560) ? 'small' : 'large';
function lay() {
  const all = profile.hudLayout ||= {}; let L = all[cls()];
  if (L?.preset && PRESETS[L.preset]) { const P = PRESETS[L.preset]; L = all[cls()] = { w: JSON.parse(JSON.stringify(P.w)), extras: (P.extras || []).map((x, i) => ({ ...x, id: Date.now().toString(36) + i })) }; saveProfile(); }
  if (!L || !L.w) { const old = L || {}; L = all[cls()] = { w: {}, extras: [] }; for (const k in old) if (old[k]?.x != null) L.w[k] = old[k]; }
  L.extras ||= []; return L;
}
const kindOf = el => el.dataset.kind || (WIDGETS.find(w => w[0] === el.dataset.drag)?.[2]) || 'zoom';
const scaleOf = el => parseFloat(el.style.scale) || 1;
const clampN = (v, a, b) => Math.max(a, Math.min(b, v));

// Farbe, Stil und Deckkraft auf die Fahransicht anwenden
export function applyTheme(root) {
  root.dataset.hudstyle = profile.hudStyle || 'dark';
  root.style.setProperty('--hudacc', profile.hudAccent || '#ff6a3d');
  if (profile.hudOpacity != null) root.style.setProperty('--hudop', Math.round(profile.hudOpacity * 100) + '%'); else root.style.removeProperty('--hudop');
}

// Zusätzliche Widgets im DOM anlegen
function ensureExtras(root) {
  const L = lay(), have = new Set();
  for (const x of L.extras) {
    have.add('x' + x.id);
    if (root.querySelector(`[data-drag="x${x.id}"]`)) continue;
    const d = document.createElement('div');
    d.dataset.drag = 'x' + x.id;
    if (x.type === 'graph') { d.className = 'xw xgraph'; d.dataset.kind = 'size'; d.dataset.metric = x.metric; d.innerHTML = `<canvas></canvas><span>${esc(GRAPHS[x.metric] || '')}</span>`; }
    else { d.className = 'hbox xw'; d.dataset.metric = x.metric; d.innerHTML = `<b class="num">–</b><span>${esc(METRICS[x.metric] || '')}</span>`; }
    root.querySelector('.xlayer').appendChild(d);
  }
  for (const el of root.querySelectorAll('.xlayer [data-drag]')) if (!have.has(el.dataset.drag)) el.remove();
}

// Gespeicherte Anordnung anwenden (Positionen und Größen als Anteile der Fenstergröße)
export function applySaved(root) {
  applyTheme(root);
  ensureExtras(root);
  const L = lay();
  for (const el of root.querySelectorAll('[data-drag]')) {
    const p = L.w[el.dataset.drag] || {};
    el.classList.toggle('w-hidden', !!p.hid);
    el.style.zoom = '';
    el.style.scale = p.z && p.z !== 1 && kindOf(el) === 'zoom' ? String(p.z) : '';
    if (kindOf(el) === 'size' && p.w) { el.style.width = p.w * innerWidth + 'px'; el.style.height = p.h * innerHeight + 'px'; }
    else if (kindOf(el) === 'size' && p.x == null) { el.style.width = ''; el.style.height = ''; }
    if (p.x != null) place(el, p.x * innerWidth, p.y * innerHeight); else unplace(el);
  }
  const tb = root.querySelector('.toolbar');
  if (tb) { tb.style.width = L.tbw ? Math.min(innerWidth - 24, L.tbw * innerWidth) + 'px' : ''; tb.style.maxWidth = L.tbw ? 'none' : ''; }
}
function place(el, x, y) {
  // Größe festhalten, sonst fällt z. B. das Höhenprofil ohne festen Rahmen in sich zusammen
  if (kindOf(el) === 'size' && !el.style.width) { const r0 = el.getBoundingClientRect(); el.style.width = Math.max(80, r0.width) + 'px'; el.style.height = Math.max(50, r0.height) + 'px'; }
  Object.assign(el.style, { position: 'fixed', right: 'auto', bottom: 'auto', transform: 'none', translate: 'none', margin: '0', transformOrigin: '0 0' });
  const r = el.getBoundingClientRect();
  el.style.left = clampN(x, 0, Math.max(0, innerWidth - r.width)) + 'px';
  el.style.top = clampN(y, 0, Math.max(0, innerHeight - r.height)) + 'px';
  el.dataset.user = '1';
}
function unplace(el) { for (const k of ['position', 'left', 'top', 'right', 'bottom', 'transform', 'translate', 'margin', 'transformOrigin']) el.style[k] = ''; delete el.dataset.user; }

// Überlappungen auflösen: Widgets nacheinander platzieren, kollidierende verschieben
const ORDER = ['top', 'right', 'mini', 'elev', 'wo', 'riders', 'msg'];
export function arrange(root) {
  if (root.classList.contains('hudedit')) return;
  const obst = [], vis = el => el && !el.hidden && !el.classList.contains('w-hidden') && el.getClientRects().length > 0;
  const add = el => { if (vis(el)) { const r = el.getBoundingClientRect(); if (r.width && r.height) obst.push(r); } };
  add(root.querySelector('.toolbar'));
  const els = [...ORDER.map(k => root.querySelector(`[data-drag="${k}"]`)), ...root.querySelectorAll('.xlayer [data-drag]')].filter(Boolean);
  for (const el of els) if (el.dataset.user) add(el);
  for (const el of els) {
    if (el.dataset.user || !vis(el)) continue;
    el.style.translate = '';
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    // Kandidaten: an der Stelle bleiben, direkt unter/über/neben einem Hindernis; der nächstgelegene freie gewinnt
    const free = (dx, dy) => { const R = { left: r.left + dx, right: r.right + dx, top: r.top + dy, bottom: r.bottom + dy }; return R.left >= 0 && R.top >= 0 && R.right <= innerWidth && R.bottom <= innerHeight && !obst.some(o => R.left < o.right - 1 && R.right > o.left + 1 && R.top < o.bottom - 1 && R.bottom > o.top + 1); };
    const cands = [[0, 0]];
    for (const o of obst) { cands.push([0, o.bottom + 6 - r.top], [0, o.top - 6 - r.bottom], [o.right + 6 - r.left, 0], [o.left - 6 - r.right, 0]); for (const p of obst) cands.push([o.right + 6 - r.left, p.bottom + 6 - r.top], [o.left - 6 - r.right, p.bottom + 6 - r.top]); }
    let best = null, bd = Infinity;
    for (const [cx, cy] of cands) { const d = Math.abs(cx) * 1.3 + Math.abs(cy); if (d < bd && free(cx, cy)) { bd = d; best = [cx, cy]; } }
    const [dx, dy] = best || [0, 0];
    if (dx || dy) el.style.translate = `${Math.round(dx)}px ${Math.round(dy)}px`;
    obst.push({ left: r.left + dx, right: r.right + dx, top: r.top + dy, bottom: r.bottom + dy });
  }
}

/* ---------- Anordnen-Modus ---------- */
// Verschieben mit einem Finger/der Maus, Größe über den Eckgriff oder mit zwei Fingern (Zusammenziehen/Auseinanderziehen)
export function editMode(root, on, onDone) {
  root.classList.toggle('hudedit', on);
  root.querySelectorAll('.rz,.rzl').forEach(h => h.remove());
  const bar = root.querySelector('#editBar'); bar.hidden = !on;
  root.onpointerdown = null; root.ontouchstart = null;
  if (!on) return;
  for (const el of root.querySelectorAll('[data-drag]')) { el.style.translate = ''; const h = document.createElement('i'); h.className = 'rz'; h.title = 'Größe ändern'; el.appendChild(h); }
  const tb = root.querySelector('.toolbar'), th = document.createElement('i'); th.className = 'rzl'; th.title = 'Breite ändern'; tb.appendChild(th);
  panel(root, bar, onDone);

  const L = lay(), touches = new Map(); // aktive Finger: pointerId -> { x, y }
  let g = null; // laufende Geste
  const save = (el) => {
    const q = el.getBoundingClientRect(), key = el.dataset.drag, p = L.w[key] ||= {};
    p.x = q.left / innerWidth; p.y = q.top / innerHeight;
    if (kindOf(el) === 'size') { p.w = parseFloat(el.style.width) / innerWidth; p.h = parseFloat(el.style.height) / innerHeight; } else p.z = scaleOf(el);
    saveProfile();
  };
  // Größe setzen: Widgets mit Inhalt skalieren gleichmäßig, Karte/Profil/Kurven ändern Breite und Höhe
  const resize = (el, f, fx, fy) => {
    if (kindOf(el) === 'size') { el.style.width = clampN(g.w0 * (fx ?? f), 80, innerWidth) + 'px'; el.style.height = clampN(g.h0 * (fy ?? f), 40, innerHeight) + 'px'; }
    else { const max = Math.min(2.5, innerWidth * .98 / g.bw, innerHeight * .9 / g.bh); el.style.scale = String(Math.round(clampN(g.s0 * f, .5, Math.max(.5, max)) * 100) / 100); }
  };
  root.onpointerdown = e => {
    if (e.target.closest('.editbar')) return;
    // Breite der Knopfleiste (bleibt unten rechts verankert)
    if (e.target.classList.contains('rzl')) {
      e.preventDefault(); try { e.target.setPointerCapture(e.pointerId); } catch (_) { }
      const r0 = tb.getBoundingClientRect(), x0 = e.clientX; tb.style.maxWidth = 'none';
      const mv = ev => { tb.style.width = clampN(r0.width + (x0 - ev.clientX), 120, innerWidth - 24) + 'px'; };
      const up = () => { e.target.removeEventListener('pointermove', mv); e.target.removeEventListener('pointerup', up); e.target.removeEventListener('pointercancel', up); L.tbw = tb.getBoundingClientRect().width / innerWidth; saveProfile(); };
      e.target.addEventListener('pointermove', mv); e.target.addEventListener('pointerup', up); e.target.addEventListener('pointercancel', up); return;
    }
    const el = e.target.closest('[data-drag]'); if (!el) return;
    e.preventDefault();
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { root.setPointerCapture(e.pointerId); } catch (_) { }
    if (!el.dataset.user) { const r = el.getBoundingClientRect(); place(el, r.left, r.top); }
    const r = el.getBoundingClientRect();
    if (touches.size === 2 && g?.el === el) {
      // zweiter Finger auf demselben Widget: Zwei-Finger-Größenänderung
      const [a, b] = [...touches.values()];
      g = { el, mode: 'pinch', bw: r.width / scaleOf(el), bh: r.height / scaleOf(el), d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, dx0: Math.abs(a.x - b.x) || 1, dy0: Math.abs(a.y - b.y) || 1, s0: scaleOf(el), w0: parseFloat(el.style.width) || r.width, h0: parseFloat(el.style.height) || r.height, x0: r.left, y0: r.top };
      return;
    }
    if (e.target.classList.contains('rz')) g = { el, mode: 'rz', bw: r.width / scaleOf(el), bh: r.height / scaleOf(el), px: e.clientX, py: e.clientY, s0: scaleOf(el), w0: parseFloat(el.style.width) || r.width, h0: parseFloat(el.style.height) || r.height, rw: r.width, rh: r.height };
    else g = { el, mode: 'move', ox: e.clientX - r.left, oy: e.clientY - r.top };
    el.classList.add('grab');
  };
  root.onpointermove = e => {
    if (!g || !touches.has(e.pointerId)) return;
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const el = g.el;
    if (g.mode === 'move') { place(el, e.clientX - g.ox, e.clientY - g.oy); return; }
    if (g.mode === 'rz') {
      // Faktor aus der Diagonalen: wirkt auf Touch und Maus gleich ruhig
      const dx = e.clientX - g.px, dy = e.clientY - g.py;
      if (kindOf(el) === 'size') resize(el, 1, (g.rw + dx) / g.rw, (g.rh + dy) / g.rh);
      else resize(el, (g.rw + g.rh + dx + dy) / (g.rw + g.rh));
      return;
    }
    if (g.mode === 'pinch' && touches.size >= 2) {
      const [a, b] = [...touches.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (kindOf(el) === 'size') resize(el, 1, Math.max(.3, Math.abs(a.x - b.x) / g.dx0 * .5 + d / g.d0 * .5), Math.max(.3, Math.abs(a.y - b.y) / g.dy0 * .5 + d / g.d0 * .5));
      else resize(el, d / g.d0);
      place(el, g.x0, g.y0);
    }
  };
  const end = e => {
    touches.delete(e.pointerId);
    if (!g) return;
    if (g.mode === 'pinch' && touches.size === 1) { const [p] = touches.values(), r = g.el.getBoundingClientRect(); g = { el: g.el, mode: 'move', ox: p.x - r.left, oy: p.y - r.top }; return; }
    if (touches.size === 0) { g.el.classList.remove('grab'); save(g.el); if (g.mode !== 'move') root.dispatchEvent(new Event('hudresize')); g = null; }
  };
  root.onpointerup = end; root.onpointercancel = end;
}

// Bearbeitungsfenster: verschiebbar und einklappbar, damit Widgets dahinter erreichbar sind
function panel(root, bar, onDone) {
  const L = lay(), names = { ...Object.fromEntries(WIDGETS.map(w => [w[0], w[1]])) };
  for (const x of L.extras) names['x' + x.id] = (x.type === 'graph' ? GRAPHS : METRICS)[x.metric];
  const P = profile.hudEditPos ||= {};
  bar.classList.toggle('collapsed', !!P.c);
  if (P.x != null) Object.assign(bar.style, { left: clampN(P.x, 0, innerWidth - 120) + 'px', top: clampN(P.y, 0, innerHeight - 48) + 'px', transform: 'none' });
  else Object.assign(bar.style, { left: '', top: '', transform: '' });
  const op = Math.round((profile.hudOpacity ?? -1) * 100);
  bar.innerHTML = `
    <div class="edhead" title="Ziehen zum Verschieben"><span class="edgrip">⠿</span><b>Anzeige anordnen</b><span class="row"><button class="btn xs ghost" id="edMin" title="Einklappen">${P.c ? '▸' : '▾'}</button><button class="btn xs pri" id="edDone">Fertig</button></span></div>
    <div class="edbody">
      <div class="small muted">Ziehen verschiebt. Größe: Eckgriff unten rechts oder mit zwei Fingern auf dem Widget. Gilt für ${cls() === 'small' ? 'kleine' : 'große'} Bildschirme.</div>
      <div class="edgrid">
        <label class="f">Vorlage<select class="inp sm" id="edPreset"><option value="">– wählen –</option>${Object.entries(PRESETS).map(([k, v]) => `<option value="${k}">${v.n}</option>`).join('')}</select></label>
        <label class="f">Stil<select class="inp sm" id="edStyle">${Object.entries(STYLES).map(([k, v]) => `<option value="${k}" ${(profile.hudStyle || 'dark') === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      </div>
      <div class="f small">Farbe<div class="swatches sm" id="edAcc">${ACCENTS.map(c => `<button style="background:${c}" data-c="${c}" aria-pressed="${(profile.hudAccent || '#ff6a3d') === c}" aria-label="Farbe ${c}"></button>`).join('')}<input type="color" id="edAccC" value="${profile.hudAccent || '#ff6a3d'}" title="Eigene Farbe"></div></div>
      <label class="f small">Deckkraft der Flächen: <b id="edOpV">${op < 0 ? 'Stil' : op + ' %'}</b><input type="range" id="edOp" min="0" max="100" step="5" value="${op < 0 ? 72 : op}"></label>
      <div class="edlist">${Object.entries(names).map(([k, n]) => `<label class="switch sm"><input type="checkbox" data-w="${k}" ${L.w[k]?.hid ? '' : 'checked'}><span></span> ${esc(n || k)}${k.startsWith('x') ? ` <button class="btn xs ghost danger" data-delx="${k.slice(1)}" title="Entfernen">✕</button>` : ''}</label>`).join('')}</div>
      <div class="row"><select class="inp sm" id="edAdd"><optgroup label="Wert">${Object.entries(METRICS).map(([k, v]) => `<option value="metric:${k}">${v}</option>`).join('')}</optgroup><optgroup label="Verlauf">${Object.entries(GRAPHS).map(([k, v]) => `<option value="graph:${k}">${v}</option>`).join('')}</optgroup></select><button class="btn sm" id="edAddBtn">+ Widget</button><button class="btn sm ghost" id="edReset">Zurücksetzen</button></div>
    </div>`;
  const refresh = () => { applySaved(root); editMode(root, true, onDone); };
  const reset = () => root.querySelectorAll('[data-drag]').forEach(el => { el.style.scale = ''; el.style.width = ''; el.style.height = ''; unplace(el); });
  bar.querySelector('#edDone').onclick = () => { editMode(root, false); onDone?.(); };
  bar.querySelector('#edMin').onclick = () => { P.c = !P.c; saveProfile(); bar.classList.toggle('collapsed', P.c); bar.querySelector('#edMin').textContent = P.c ? '▸' : '▾'; };
  bar.querySelector('#edReset').onclick = () => { profile.hudLayout[cls()] = { w: {}, extras: [] }; saveProfile(); reset(); refresh(); };
  bar.querySelector('#edStyle').onchange = e => { profile.hudStyle = e.target.value; saveProfile(); applyTheme(root); root.dispatchEvent(new Event('hudresize')); };
  const setAcc = c => { profile.hudAccent = c; saveProfile(); applyTheme(root); for (const b of bar.querySelectorAll('#edAcc [data-c]')) b.setAttribute('aria-pressed', String(b.dataset.c === c)); };
  bar.querySelector('#edAcc').onclick = e => { const b = e.target.closest('[data-c]'); if (b) setAcc(b.dataset.c); };
  bar.querySelector('#edAccC').oninput = e => setAcc(e.target.value);
  bar.querySelector('#edOp').oninput = e => { profile.hudOpacity = +e.target.value / 100; saveProfile(); applyTheme(root); bar.querySelector('#edOpV').textContent = e.target.value + ' %'; };
  bar.querySelector('#edPreset').onchange = e => {
    const Pr = PRESETS[e.target.value]; if (!Pr) return;
    profile.hudLayout[cls()] = { w: JSON.parse(JSON.stringify(Pr.w)), extras: (Pr.extras || []).map((x, i) => ({ ...x, id: Date.now().toString(36) + i })) };
    saveProfile(); reset(); refresh();
  };
  bar.querySelector('.edlist').onchange = e => { const k = e.target.dataset.w; if (!k) return; (L.w[k] ||= {}).hid = e.target.checked ? 0 : 1; saveProfile(); root.querySelector(`[data-drag="${k}"]`)?.classList.toggle('w-hidden', !e.target.checked); };
  bar.querySelector('.edlist').onclick = e => { const b = e.target.closest('[data-delx]'); if (!b) return; e.preventDefault(); L.extras = L.extras.filter(x => x.id !== b.dataset.delx); delete L.w['x' + b.dataset.delx]; saveProfile(); refresh(); };
  bar.querySelector('#edAddBtn').onclick = () => { const [type, metric] = bar.querySelector('#edAdd').value.split(':'); L.extras.push({ id: Date.now().toString(36), type, metric }); saveProfile(); refresh(); };
  // Fenster an der Kopfzeile ziehen
  const head = bar.querySelector('.edhead');
  head.onpointerdown = e => {
    if (e.target.closest('button')) return;
    e.preventDefault(); try { head.setPointerCapture(e.pointerId); } catch (_) { }
    const r = bar.getBoundingClientRect(), ox = e.clientX - r.left, oy = e.clientY - r.top;
    const mv = ev => { P.x = clampN(ev.clientX - ox, 0, innerWidth - 120); P.y = clampN(ev.clientY - oy, 0, innerHeight - 40); Object.assign(bar.style, { left: P.x + 'px', top: P.y + 'px', transform: 'none' }); };
    const up = () => { head.removeEventListener('pointermove', mv); head.removeEventListener('pointerup', up); head.removeEventListener('pointercancel', up); saveProfile(); };
    head.addEventListener('pointermove', mv); head.addEventListener('pointerup', up); head.addEventListener('pointercancel', up);
  };
}

// Zusatz-Widgets mit Werten füllen; vals: { key: [Text, Farbe?] }, series: { gp: [...], gh: [...], gc: [...] }
export function updateExtras(root, vals, series) {
  for (const el of root.querySelectorAll('.xlayer [data-metric]')) {
    const m = el.dataset.metric;
    if (el.classList.contains('xgraph')) drawGraph(el.querySelector('canvas'), series[m] || [], m);
    else { const v = vals[m] || ['–'], b = el.firstElementChild; b.textContent = v[0]; b.style.color = v[1] || ''; }
  }
}
function drawGraph(cv, data, m) {
  const r = cv.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1), sc = scaleOf(cv.parentElement), w = Math.max(1, Math.round(r.width / sc * d)), h = Math.max(1, Math.round(r.height / sc * d));
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  const c = cv.getContext('2d'); c.clearRect(0, 0, w, h);
  const v = data.filter(x => x != null); if (v.length < 2) return;
  const mx = Math.max(...v) * 1.1 || 1, mn = m === 'gp' ? 0 : Math.min(...v) * .9, col = { gp: '#ff6a3d', gh: '#ef4458', gc: '#3fa7f5' }[m];
  const path = () => { c.beginPath(); data.forEach((x, i) => { const px = i / (data.length - 1) * w, py = h - ((x ?? mn) - mn) / (mx - mn) * h; i ? c.lineTo(px, py) : c.moveTo(px, py); }); };
  path(); c.lineTo(w, h); c.lineTo(0, h); c.closePath(); c.fillStyle = col + '44'; c.fill();
  path(); c.strokeStyle = col; c.lineWidth = 2 * d; c.stroke();
  c.fillStyle = 'rgba(255,255,255,.85)'; c.font = `600 ${11 * d}px Barlow, sans-serif`; c.fillText(Math.round(v[v.length - 1]), 4 * d, 13 * d);
}
