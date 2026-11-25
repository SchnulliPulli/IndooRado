// Anzeige-Ebene der Fahrt: Widgets anordnen, Größe ändern, ein- und ausblenden, eigene Widgets, Vorlagen und Stile
// Gespeichert in profile.hudLayout[small|large] = { w: { key: { x, y, w, h, z, hid } }, extras: [{ id, type, metric }], tbw }
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
};
export const GRAPHS = { gp: 'Leistung (letzte 2 min)', gh: 'Puls (letzte 5 min)', gc: 'Trittfrequenz (letzte 2 min)' };

export const STYLES = { dark: 'Dunkel', glass: 'Glas', contrast: 'Kontrast', light: 'Hell', clear: 'Durchsichtig' };
// Vorlagen: Teilangaben, alles andere ordnet sich automatisch
const PRESETS = {
  standard: { n: 'Standard', w: {} },
  compact: { n: 'Kompakt', w: { top: { z: .8 }, wo: { z: .85 }, right: { z: .8 }, riders: { hid: 1 }, msg: { z: .85 } } },
  minimal: { n: 'Minimal', w: { riders: { hid: 1 }, mini: { hid: 1 }, right: { z: .85 }, top: { z: .9 } } },
  race: { n: 'Rennen', w: { wo: { z: .85 }, riders: { z: 1.1 } }, extras: [{ type: 'metric', metric: 'ghost' }, { type: 'graph', metric: 'gp' }] },
  focus: { n: 'Workout-Fokus', w: { wo: { z: 1.25 }, top: { z: .85 }, riders: { hid: 1 }, mini: { hid: 1 } }, extras: [{ type: 'metric', metric: 'target' }, { type: 'metric', metric: 'left' }] },
  data: { n: 'Datenfreak', w: { riders: { hid: 1 } }, extras: [{ type: 'metric', metric: 'np' }, { type: 'metric', metric: 'tss' }, { type: 'metric', metric: 'kj' }, { type: 'graph', metric: 'gp' }, { type: 'graph', metric: 'gh' }] },
};
export const PRESET_NAMES = Object.fromEntries(Object.entries(PRESETS).map(([k, v]) => [k, v.n]));

const cls = () => (innerWidth <= 820 || innerHeight <= 560) ? 'small' : 'large';
function lay() {
  const all = profile.hudLayout ||= {}; let L = all[cls()];
  if (!L || !L.w) { const old = L || {}; L = all[cls()] = { w: {}, extras: [] }; for (const k in old) if (old[k]?.x != null) L.w[k] = old[k]; }
  L.extras ||= []; return L;
}
const kindOf = el => el.dataset.kind || (WIDGETS.find(w => w[0] === el.dataset.drag)?.[2]) || 'zoom';

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
  root.dataset.hudstyle = profile.hudStyle || 'dark';
  ensureExtras(root);
  const L = lay();
  for (const el of root.querySelectorAll('[data-drag]')) {
    const p = L.w[el.dataset.drag] || {};
    el.classList.toggle('w-hidden', !!p.hid);
    el.style.zoom = p.z && kindOf(el) === 'zoom' ? p.z : '';
    if (kindOf(el) === 'size' && p.w) { el.style.width = p.w * innerWidth + 'px'; el.style.height = p.h * innerHeight + 'px'; }
    else if (kindOf(el) === 'size' && !p.x) { el.style.width = ''; el.style.height = ''; }
    if (p.x != null) place(el, p.x * innerWidth, p.y * innerHeight); else unplace(el);
  }
  const tb = root.querySelector('.toolbar');
  if (tb) { tb.style.width = L.tbw ? Math.min(innerWidth - 24, L.tbw * innerWidth) + 'px' : ''; tb.style.maxWidth = L.tbw ? 'none' : ''; }
}
function place(el, x, y) {
  const r = el.getBoundingClientRect();
  // Größe festhalten, sonst fällt z. B. das Höhenprofil ohne festen Rahmen in sich zusammen
  if (kindOf(el) === 'size' && !el.style.width) { el.style.width = Math.max(80, r.width) + 'px'; el.style.height = Math.max(50, r.height) + 'px'; }
  const z = parseFloat(el.style.zoom) || 1;
  x = Math.max(0, Math.min(innerWidth - r.width, x)); y = Math.max(0, Math.min(innerHeight - r.height, y));
  Object.assign(el.style, { position: 'fixed', left: x / z + 'px', top: y / z + 'px', right: 'auto', bottom: 'auto', transform: 'none', translate: 'none', margin: '0' });
  el.dataset.user = '1';
}
function unplace(el) { for (const k of ['position', 'left', 'top', 'right', 'bottom', 'transform', 'translate', 'margin']) el.style[k] = ''; delete el.dataset.user; }

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

// Anordnen-Modus: verschieben, Größe ändern, ein-/ausblenden, Widgets hinzufügen, Vorlagen, Stile
export function editMode(root, on, onDone) {
  root.classList.toggle('hudedit', on);
  root.querySelectorAll('.rz,.rzl').forEach(h => h.remove());
  const bar = root.querySelector('#editBar'); bar.hidden = !on;
  if (!on) { root.onpointerdown = null; return; }
  for (const el of root.querySelectorAll('[data-drag]')) { el.style.translate = ''; const h = document.createElement('i'); h.className = 'rz'; h.title = 'Größe ändern'; el.appendChild(h); }
  const tb = root.querySelector('.toolbar'), th = document.createElement('i'); th.className = 'rzl'; th.title = 'Breite ändern'; tb.appendChild(th);
  panel(root, bar, onDone);
  root.onpointerdown = e => {
    if (e.target.closest('.editbar')) return;
    const L = lay();
    // Breite der Knopfleiste (bleibt unten rechts verankert)
    if (e.target.classList.contains('rzl')) {
      e.preventDefault(); const r0 = tb.getBoundingClientRect(), x0 = e.clientX; tb.style.maxWidth = 'none';
      const mv = ev => { tb.style.width = Math.max(120, Math.min(innerWidth - 24, r0.width + (x0 - ev.clientX))) + 'px'; };
      const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); L.tbw = tb.getBoundingClientRect().width / innerWidth; saveProfile(); };
      addEventListener('pointermove', mv); addEventListener('pointerup', up); return;
    }
    const el = e.target.closest('[data-drag]'); if (!el) return;
    e.preventDefault();
    const r = el.getBoundingClientRect(), key = el.dataset.drag, kind = kindOf(el);
    place(el, r.left, r.top);
    const save = () => { const q = el.getBoundingClientRect(), p = L.w[key] ||= {}; p.x = q.left / innerWidth; p.y = q.top / innerHeight; if (kind === 'size') { p.w = q.width / innerWidth; p.h = q.height / innerHeight; } else p.z = parseFloat(el.style.zoom) || 1; saveProfile(); };
    // Größe ändern: Ecke unten rechts
    if (e.target.classList.contains('rz')) {
      const z0 = parseFloat(el.style.zoom) || 1, w0 = r.width, h0 = r.height, x0 = e.clientX, y0 = e.clientY;
      const mv = ev => {
        const dw = ev.clientX - x0, dh = ev.clientY - y0;
        if (kind === 'size') { el.style.width = Math.max(80, w0 + dw) + 'px'; el.style.height = Math.max(40, h0 + dh) + 'px'; }
        else { const z = Math.max(.5, Math.min(2.2, z0 * (w0 + dw) / w0)); el.style.zoom = z; el.style.left = r.left / z + 'px'; el.style.top = r.top / z + 'px'; }
      };
      const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); save(); root.dispatchEvent(new Event('hudresize')); };
      addEventListener('pointermove', mv); addEventListener('pointerup', up); return;
    }
    const ox = e.clientX - r.left, oy = e.clientY - r.top; el.classList.add('grab');
    const mv = ev => place(el, ev.clientX - ox, ev.clientY - oy);
    const up = () => { el.classList.remove('grab'); removeEventListener('pointermove', mv); removeEventListener('pointerup', up); save(); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  };
}

function panel(root, bar, onDone) {
  const L = lay(), names = { ...Object.fromEntries(WIDGETS.map(w => [w[0], w[1]])) };
  for (const x of L.extras) names['x' + x.id] = (x.type === 'graph' ? GRAPHS : METRICS)[x.metric];
  bar.innerHTML = `
    <div class="row between"><b>Anzeige anordnen</b><span class="row"><button class="btn sm ghost" id="edReset">Zurücksetzen</button><button class="btn sm pri" id="edDone">Fertig</button></span></div>
    <div class="small muted">Ziehen zum Verschieben, Ecke unten rechts zum Vergrößern, linker Rand der Knopfleiste ändert deren Breite. Gilt für ${cls() === 'small' ? 'kleine' : 'große'} Bildschirme.</div>
    <div class="edgrid">
      <label class="f">Vorlage<select class="inp sm" id="edPreset"><option value="">– wählen –</option>${Object.entries(PRESETS).map(([k, v]) => `<option value="${k}">${v.n}</option>`).join('')}</select></label>
      <label class="f">Stil<select class="inp sm" id="edStyle">${Object.entries(STYLES).map(([k, v]) => `<option value="${k}" ${(profile.hudStyle || 'dark') === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
    </div>
    <div class="edlist">${Object.entries(names).map(([k, n]) => `<label class="switch sm"><input type="checkbox" data-w="${k}" ${L.w[k]?.hid ? '' : 'checked'}><span></span> ${esc(n || k)}${k.startsWith('x') ? ` <button class="btn xs ghost danger" data-delx="${k.slice(1)}" title="Entfernen">✕</button>` : ''}</label>`).join('')}</div>
    <div class="row"><select class="inp sm" id="edAdd"><optgroup label="Wert">${Object.entries(METRICS).map(([k, v]) => `<option value="metric:${k}">${v}</option>`).join('')}</optgroup><optgroup label="Verlauf">${Object.entries(GRAPHS).map(([k, v]) => `<option value="graph:${k}">${v}</option>`).join('')}</optgroup></select><button class="btn sm" id="edAddBtn">+ Widget</button></div>`;
  const refresh = () => { applySaved(root); editMode(root, true, onDone); };
  bar.querySelector('#edDone').onclick = () => { editMode(root, false); onDone?.(); };
  bar.querySelector('#edReset').onclick = () => { profile.hudLayout[cls()] = { w: {}, extras: [] }; saveProfile(); root.querySelectorAll('[data-drag]').forEach(el => { el.style.zoom = ''; el.style.width = ''; el.style.height = ''; unplace(el); }); refresh(); };
  bar.querySelector('#edStyle').onchange = e => { profile.hudStyle = e.target.value; saveProfile(); root.dataset.hudstyle = e.target.value; root.dispatchEvent(new Event('hudresize')); };
  bar.querySelector('#edPreset').onchange = e => {
    const P = PRESETS[e.target.value]; if (!P) return;
    profile.hudLayout[cls()] = { w: JSON.parse(JSON.stringify(P.w)), extras: (P.extras || []).map((x, i) => ({ ...x, id: Date.now().toString(36) + i })) };
    saveProfile(); root.querySelectorAll('[data-drag]').forEach(el => { el.style.zoom = ''; el.style.width = ''; el.style.height = ''; unplace(el); }); refresh();
  };
  bar.querySelector('.edlist').onchange = e => { const k = e.target.dataset.w; if (!k) return; (L.w[k] ||= {}).hid = e.target.checked ? 0 : 1; saveProfile(); root.querySelector(`[data-drag="${k}"]`)?.classList.toggle('w-hidden', !e.target.checked); };
  bar.querySelector('.edlist').onclick = e => { const b = e.target.closest('[data-delx]'); if (!b) return; e.preventDefault(); L.extras = L.extras.filter(x => x.id !== b.dataset.delx); delete L.w['x' + b.dataset.delx]; saveProfile(); refresh(); };
  bar.querySelector('#edAddBtn').onclick = () => { const [type, metric] = bar.querySelector('#edAdd').value.split(':'); L.extras.push({ id: Date.now().toString(36), type, metric }); saveProfile(); refresh(); };
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
  const r = cv.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1), w = Math.max(1, Math.round(r.width * d)), h = Math.max(1, Math.round(r.height * d));
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  const c = cv.getContext('2d'); c.clearRect(0, 0, w, h);
  const v = data.filter(x => x != null); if (v.length < 2) return;
  const mx = Math.max(...v) * 1.1 || 1, mn = m === 'gp' ? 0 : Math.min(...v) * .9, col = { gp: '#ff6a3d', gh: '#ef4458', gc: '#3fa7f5' }[m];
  c.beginPath(); data.forEach((x, i) => { const px = i / (data.length - 1) * w, py = h - ((x ?? mn) - mn) / (mx - mn) * h; i ? c.lineTo(px, py) : c.moveTo(px, py); });
  c.lineTo(w, h); c.lineTo(0, h); c.closePath(); c.fillStyle = col + '44'; c.fill();
  c.beginPath(); data.forEach((x, i) => { const px = i / (data.length - 1) * w, py = h - ((x ?? mn) - mn) / (mx - mn) * h; i ? c.lineTo(px, py) : c.moveTo(px, py); });
  c.strokeStyle = col; c.lineWidth = 2 * d; c.stroke();
  c.fillStyle = 'rgba(255,255,255,.85)'; c.font = `600 ${11 * d}px Barlow, sans-serif`; c.fillText(Math.round(v[v.length - 1]), 4 * d, 13 * d);
}
