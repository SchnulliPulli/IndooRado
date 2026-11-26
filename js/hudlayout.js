// Anzeige-Ebene der Fahrt: Widgets anordnen, Größe ändern, ein- und ausblenden, eigene Widgets, Vorlagen, Stile und Farben
// Gespeichert in profile.hudLayout[small|large] = { w: { key: { x, y, w, h, z, hid } }, extras: [{ id, type, metric }], tbw }
// Skaliert wird mit der CSS-Eigenschaft "scale" (nicht "zoom"), damit Maus und Touch dieselben Maße sehen.
import { profile, saveProfile } from './state.js';
import { esc } from './util.js';

export const WIDGETS = [
  ['top', 'Leistung und Werte', 'zoom'], ['wo', 'Workout', 'zoom'], ['riders', 'Fahrerliste', 'zoom'], ['right', 'Steigung und Gang', 'zoom'],
  ['mini', 'Karte', 'size'], ['elev', 'Höhenprofil', 'size'], ['msg', 'Meldungen', 'zoom'], ['ring', 'Watt-Ring', 'zoom'],
];
// Zusätzliche Widgets: einzelne Werte oder Verlaufskurven
export const METRICS = {
  p3: 'Leistung 3 s', wkg: 'W/kg', hr: 'Puls', cad: 'Trittfrequenz', spd: 'Tempo', dist: 'Distanz', time: 'Fahrzeit', asc: 'Höhenmeter',
  avg: 'Ø Leistung', np: 'Normalisierte Leistung', kj: 'Arbeit (kJ)', kcal: 'Kalorien', grade: 'Steigung', target: 'Zielleistung',
  left: 'Intervall-Rest', woLeft: 'Workout-Rest', xp: 'XP der Fahrt', clock: 'Uhrzeit', tss: 'TSS bisher', ghost: 'Abstand zum Geist', hrz: 'Pulszone', pz: 'Leistungszone',
  lap: 'Rundenzeit', place: 'Platz im Feld', xspeed: 'Tempo (Sensor)', xtemp: 'Temperatur (Sensor)', xcustom: 'Eigener Sensorwert',
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

// Drei Anordnungen: großer Bildschirm, Handy hochkant (small) und Handy/kleines Tablet quer (land)
const cls = () => (innerWidth <= 820 || innerHeight <= 560) ? (innerWidth > innerHeight * 1.2 ? 'land' : 'small') : 'large';
function lay() {
  const all = profile.hudLayout ||= {}; let L = all[cls()];
  if (L?.preset && PRESETS[L.preset]) { const P = PRESETS[L.preset]; L = all[cls()] = { w: JSON.parse(JSON.stringify(P.w)), extras: (P.extras || []).map((x, i) => ({ ...x, id: Date.now().toString(36) + i })), fit: L.fit }; saveProfile(); }
  // Neues Gerät oder neuer Browser ohne gespeicherte Anordnung: automatisch anordnen und an die Fenstergröße anpassen
  if (!L || !L.w) { const old = L || {}; L = all[cls()] = { w: {}, extras: [], fit: cls() !== 'small' }; for (const k in old) if (old[k]?.x != null) L.w[k] = old[k]; }
  L.extras ||= []; return L;
}
// "An Fenstergröße anpassen": Werte-Widgets wachsen und schrumpfen mit dem Fenster (Bezug 1600 × 900 bzw. 900 × 560 auf kleinen Bildschirmen).
// Karten, Höhenprofil und Verläufe speichern ihre Größe ohnehin als Anteil des Fensters.
export const fitOn = () => !!lay().fit;
export function fitFactor() {
  if (!fitOn()) return 1;
  const [bw, bh] = cls() === 'small' ? [900, 560] : cls() === 'land' ? [960, 440] : [1600, 900];
  return Math.round(clampN(Math.min(innerWidth / bw, innerHeight / bh), .55, 1.8) * 100) / 100;
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
// Positionen gelten für das Seitenverhältnis, auf dem sie gespeichert wurden. Auf einem deutlich anderen Bildschirm
// (z. B. Anordnung vom 16:9-Monitor, jetzt Tablet 4:3) ordnen sich die Widgets automatisch, Größen und Sichtbarkeit bleiben.
const ar = () => innerWidth / innerHeight;
export const posValid = L => !L.ar || Math.abs(L.ar - ar()) / L.ar < .18;
export function applySaved(root) {
  applyTheme(root);
  ensureExtras(root);
  const L = lay(), F = fitFactor(), usePos = posValid(L);
  for (const el of root.querySelectorAll('[data-drag]')) {
    const p = L.w[el.dataset.drag] || {};
    el.classList.toggle('w-hidden', !!p.hid);
    el.style.zoom = '';
    const z = kindOf(el) === 'zoom' ? (p.z || 1) * F : 1;
    el.style.scale = z !== 1 ? String(z) : ''; el.style.setProperty('--inv', String(1 / z));
    if (kindOf(el) === 'size' && p.w) { el.style.width = Math.min(p.w * innerWidth, innerWidth * .96) + 'px'; el.style.height = Math.min(p.h * innerHeight, innerHeight * .9) + 'px'; }
    else if (kindOf(el) === 'size' && (p.x == null || !usePos)) { el.style.width = ''; el.style.height = ''; }
    if (p.x != null && usePos) place(el, p.x * innerWidth, p.y * innerHeight); else unplace(el);
  }
  const tb = root.querySelector('.toolbar');
  if (tb) { tb.style.width = L.tbw ? Math.min(innerWidth - 24, L.tbw * innerWidth) + 'px' : ''; tb.style.maxWidth = L.tbw ? 'none' : ''; }
}
function place(el, x, y) {
  // Größe festhalten, sonst fällt z. B. das Höhenprofil ohne festen Rahmen in sich zusammen
  if (kindOf(el) === 'size' && !el.style.width) { const r0 = el.getBoundingClientRect(); el.style.width = Math.max(80, r0.width) + 'px'; el.style.height = Math.max(50, r0.height) + 'px'; }
  // Breite der Zoom-Widgets einfrieren, bevor sie aus ihrem Container gelöst werden (Workout-Widget hatte sonst Breite "auto")
  else if (kindOf(el) === 'zoom' && !el.dataset.user && el.dataset.drag === 'wo') { const r0 = el.getBoundingClientRect(); el.style.setProperty('--ww', Math.round(r0.width / scaleOf(el)) + 'px'); }
  Object.assign(el.style, { position: 'fixed', right: 'auto', bottom: 'auto', transform: 'none', translate: 'none', margin: '0', transformOrigin: '0 0' });
  const r = el.getBoundingClientRect();
  el.style.left = clampN(x, 0, Math.max(0, innerWidth - r.width)) + 'px';
  el.style.top = clampN(y, 0, Math.max(0, innerHeight - r.height)) + 'px';
  el.dataset.user = '1';
}
function unplace(el) { for (const k of ['position', 'left', 'top', 'right', 'bottom', 'transform', 'translate', 'margin', 'transformOrigin']) el.style[k] = ''; delete el.dataset.user; }

// Überlappungen auflösen: Widgets nacheinander platzieren, kollidierende verschieben
const ORDER = ['top', 'right', 'mini', 'elev', 'wo', 'riders', 'msg', 'ring'];
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
// Verschieben mit einem Finger/der Maus. Größe an allen Kanten und Ecken ziehen, mit zwei Fingern zusammenziehen/auseinanderziehen,
// mit dem Mausrad oder den Knöpfen −/+ über dem gewählten Widget zoomen.
// Sinnvolle Grenzen je Widget (Anteile der Fenstergröße bzw. Zoomfaktor)
const LIMITS = { mini: { w: [100, .6], h: [80, .7] }, elev: { w: [160, 1], h: [50, .45] }, graph: { w: [120, .6], h: [50, .45] } };
const ZMIN = .4, ZMAX = 2.5;
const limOf = el => LIMITS[el.dataset.drag] || (el.classList.contains('xgraph') ? LIMITS.graph : { w: [80, .9], h: [40, .8] });
const HANDLES = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
export function editMode(root, on, onDone) {
  // Positionen vor dem Umschalten messen (die Klasse „hudedit“ verändert Ränder und Abstände)
  const vis0 = on ? [...root.querySelectorAll('[data-drag]')].filter(el => !el.classList.contains('w-hidden') && el.getClientRects().length) : [];
  const rects0 = vis0.map(el => el.getBoundingClientRect());
  root.classList.toggle('hudedit', on);
  root.querySelectorAll('.rh,.rzl,.wzoom').forEach(h => h.remove());
  root.querySelectorAll('[data-drag].sel').forEach(el => el.classList.remove('sel'));
  const bar = root.querySelector('#editBar'); bar.hidden = !on;
  root.onpointerdown = null; root.ontouchstart = null;
  if (root._wheel) { root.removeEventListener('wheel', root._wheel); root._wheel = null; }
  if (!on) return;
  // Alle sichtbaren Widgets genau dort festhalten, wo sie gerade stehen (inkl. automatischer Ausweich-Verschiebung):
  // sonst springen sie beim Einschalten zurück oder rutschen nach, wenn ein Nachbar aus seinem Container gezogen wird
  vis0.forEach((el, i) => place(el, rects0[i].left, rects0[i].top));
  for (const el of root.querySelectorAll('[data-drag]')) {
    el.style.translate = ''; el.style.setProperty('--inv', String(1 / scaleOf(el)));
    for (const h of HANDLES) { const i = document.createElement('i'); i.className = 'rh ' + (h.length === 1 ? 'edge' : 'corner'); i.dataset.h = h; i.title = 'Größe ändern'; el.appendChild(i); }
  }
  const tb = root.querySelector('.toolbar'), th = document.createElement('i'); th.className = 'rzl'; th.title = 'Breite ändern'; tb.appendChild(th);
  panel(root, bar, onDone);

  const L = lay(), touches = new Map(); // aktive Finger: pointerId -> { x, y }
  let g = null, selEl = null; // laufende Geste, gewähltes Widget
  // Zoomleiste über dem gewählten Widget
  const zb = document.createElement('div'); zb.className = 'wzoom'; zb.hidden = true;
  zb.innerHTML = '<button class="btn xs" data-z="-" title="Kleiner">−</button><b class="num" data-zv>100 %</b><button class="btn xs" data-z="+" title="Größer">+</button><button class="btn xs ghost" data-z="0" title="Ursprüngliche Größe">⟲</button>';
  root.appendChild(zb);
  const pct = el => kindOf(el) === 'size' ? Math.round((parseFloat(el.style.width) || el.getBoundingClientRect().width) / (+el.dataset.w0 || parseFloat(el.style.width) || 1) * 100) : Math.round(scaleOf(el) / fitFactor() * 100);
  const showZoom = () => {
    if (!selEl || !root.contains(selEl)) { zb.hidden = true; return; }
    zb.hidden = false; const r = selEl.getBoundingClientRect(), zr = zb.getBoundingClientRect();
    const top = r.top - zr.height - 10 >= 0 ? r.top - zr.height - 10 : Math.min(innerHeight - zr.height, r.bottom + 10);
    Object.assign(zb.style, { left: clampN(r.left + r.width / 2 - zr.width / 2, 4, innerWidth - zr.width - 4) + 'px', top: top + 'px' });
    zb.querySelector('[data-zv]').textContent = pct(selEl) + ' %';
  };
  const select = el => {
    if (selEl !== el) { selEl?.classList.remove('sel'); selEl = el; el?.classList.add('sel'); }
    if (el && kindOf(el) === 'size' && !el.dataset.w0) { const r = el.getBoundingClientRect(); el.dataset.w0 = parseFloat(el.style.width) || r.width; }
    showZoom();
  };
  const save = (el) => {
    const q = el.getBoundingClientRect(), key = el.dataset.drag, p = L.w[key] ||= {};
    // Beim ersten Verschieben auf einem Bildschirm mit anderem Seitenverhältnis: die übrigen (automatisch platzierten) Widgets an ihrer jetzigen Stelle festhalten
    if (!posValid(L)) for (const o of root.querySelectorAll('[data-drag]')) { if (o === el || o.classList.contains('w-hidden') || !o.getClientRects().length) continue; const r = o.getBoundingClientRect(), po = L.w[o.dataset.drag] ||= {}; po.x = r.left / innerWidth; po.y = r.top / innerHeight; }
    // Die übrigen (festgehaltenen) Widgets mit ihrer sichtbaren Position speichern, damit sie nach dem Anordnen nicht woanders landen
    for (const o of root.querySelectorAll('[data-drag]')) { if (o === el || !o.dataset.user || o.classList.contains('w-hidden') || !o.getClientRects().length) continue; const r = o.getBoundingClientRect(), po = L.w[o.dataset.drag] ||= {}; po.x = r.left / innerWidth; po.y = r.top / innerHeight; }
    L.ar = Math.round(ar() * 100) / 100;
    p.x = q.left / innerWidth; p.y = q.top / innerHeight;
    if (kindOf(el) === 'size') { p.w = parseFloat(el.style.width) / innerWidth; p.h = parseFloat(el.style.height) / innerHeight; } else p.z = Math.round(scaleOf(el) / fitFactor() * 100) / 100;
    saveProfile();
  };
  const setScale = (el, s, bw, bh) => {
    const max = Math.min(ZMAX, innerWidth * .98 / bw, innerHeight * .9 / bh);
    s = Math.round(clampN(s, ZMIN, Math.max(ZMIN, max)) * 100) / 100;
    el.style.scale = String(s); el.style.setProperty('--inv', String(1 / s)); return s;
  };
  const setBox = (el, w, h) => {
    const lm = limOf(el);
    w = clampN(w, lm.w[0], Math.max(lm.w[0], lm.w[1] * innerWidth)); h = clampN(h, lm.h[0], Math.max(lm.h[0], lm.h[1] * innerHeight));
    el.style.width = w + 'px'; el.style.height = h + 'px'; return [w, h];
  };
  // Zoomen um Faktor f, Mittelpunkt bleibt stehen
  const zoomBy = (el, f) => {
    if (!el.dataset.user) { const r = el.getBoundingClientRect(); place(el, r.left, r.top); }
    const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if (kindOf(el) === 'size') setBox(el, (parseFloat(el.style.width) || r.width) * f, (parseFloat(el.style.height) || r.height) * f);
    else { const s0 = scaleOf(el); setScale(el, s0 * f, r.width / s0, r.height / s0); }
    const q = el.getBoundingClientRect(); place(el, cx - q.width / 2, cy - q.height / 2);
    save(el); showZoom(); root.dispatchEvent(new Event('hudresize'));
  };
  zb.onclick = e => {
    const b = e.target.closest('[data-z]'); if (!b || !selEl) return;
    if (b.dataset.z === '+') zoomBy(selEl, 1.1);
    else if (b.dataset.z === '-') zoomBy(selEl, 1 / 1.1);
    else {
      const r = selEl.getBoundingClientRect(), p = L.w[selEl.dataset.drag] || {};
      delete p.z; delete p.w; delete p.h; const F = kindOf(selEl) === 'zoom' ? fitFactor() : 1; selEl.style.scale = F !== 1 ? String(F) : ''; selEl.style.setProperty('--inv', String(1 / F));
      if (kindOf(selEl) === 'size') { selEl.style.width = ''; selEl.style.height = ''; delete selEl.dataset.w0; }
      place(selEl, r.left, r.top); save(selEl); showZoom(); root.dispatchEvent(new Event('hudresize'));
    }
  };
  zb.onpointerdown = e => e.stopPropagation();
  root._wheel = e => { const el = e.target.closest?.('[data-drag]'); if (!el) return; e.preventDefault(); select(el); zoomBy(el, e.deltaY < 0 ? 1.06 : 1 / 1.06); };
  root.addEventListener('wheel', root._wheel, { passive: false });

  root.onpointerdown = e => {
    if (e.target.closest('.editbar') || e.target.closest('.wzoom')) return;
    // Breite der Knopfleiste (bleibt unten rechts verankert)
    if (e.target.classList.contains('rzl')) {
      e.preventDefault(); try { e.target.setPointerCapture(e.pointerId); } catch (_) { }
      const r0 = tb.getBoundingClientRect(), x0 = e.clientX; tb.style.maxWidth = 'none';
      const mv = ev => { tb.style.width = clampN(r0.width + (x0 - ev.clientX), 120, innerWidth - 24) + 'px'; };
      const up = () => { e.target.removeEventListener('pointermove', mv); e.target.removeEventListener('pointerup', up); e.target.removeEventListener('pointercancel', up); L.tbw = tb.getBoundingClientRect().width / innerWidth; saveProfile(); };
      e.target.addEventListener('pointermove', mv); e.target.addEventListener('pointerup', up); e.target.addEventListener('pointercancel', up); return;
    }
    const el = e.target.closest('[data-drag]'); if (!el) { select(null); return; }
    e.preventDefault();
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { root.setPointerCapture(e.pointerId); } catch (_) { }
    if (!el.dataset.user) { const r = el.getBoundingClientRect(); place(el, r.left, r.top); }
    select(el); zb.hidden = true;
    const r = el.getBoundingClientRect(), s0 = scaleOf(el);
    const base = { el, s0, bw: r.width / s0, bh: r.height / s0, w0: parseFloat(el.style.width) || r.width, h0: parseFloat(el.style.height) || r.height, r0: { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height } };
    if (touches.size === 2 && g?.el === el) {
      // zweiter Finger auf demselben Widget: Zwei-Finger-Größenänderung
      const [a, b] = [...touches.values()];
      g = { ...base, mode: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, dx0: Math.abs(a.x - b.x) || 1, dy0: Math.abs(a.y - b.y) || 1 };
      return;
    }
    if (e.target.classList.contains('rh')) g = { ...base, mode: 'edge', h: e.target.dataset.h, px: e.clientX, py: e.clientY };
    else g = { el, mode: 'move', ox: e.clientX - r.left, oy: e.clientY - r.top };
    el.classList.add('grab');
  };
  root.onpointermove = e => {
    if (!g || !touches.has(e.pointerId)) return;
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const el = g.el;
    if (g.mode === 'move') { place(el, e.clientX - g.ox, e.clientY - g.oy); return; }
    if (g.mode === 'edge') {
      // Gegenüberliegende Kante bleibt stehen
      const h = g.h, dx = e.clientX - g.px, dy = e.clientY - g.py, R = g.r0;
      const sx = h.includes('e') ? 1 : h.includes('w') ? -1 : 0, sy = h.includes('s') ? 1 : h.includes('n') ? -1 : 0;
      let W, H;
      if (kindOf(el) === 'size') [W, H] = setBox(el, g.w0 + sx * dx, g.h0 + sy * dy);
      else {
        const fx = sx ? (R.width + sx * dx) / R.width : null, fy = sy ? (R.height + sy * dy) / R.height : null;
        const f = fx != null && fy != null ? (fx + fy) / 2 : (fx ?? fy);
        const s = setScale(el, g.s0 * f, g.bw, g.bh); W = g.bw * s; H = g.bh * s;
      }
      const left = sx < 0 ? R.right - W : sx > 0 ? R.left : R.left + (R.width - W) / 2;
      const top = sy < 0 ? R.bottom - H : sy > 0 ? R.top : R.top + (R.height - H) / 2;
      place(el, left, top);
      return;
    }
    if (g.mode === 'pinch' && touches.size >= 2) {
      const [a, b] = [...touches.values()], d = Math.hypot(a.x - b.x, a.y - b.y), R = g.r0;
      if (kindOf(el) === 'size') setBox(el, g.w0 * Math.max(.3, Math.abs(a.x - b.x) / g.dx0 * .5 + d / g.d0 * .5), g.h0 * Math.max(.3, Math.abs(a.y - b.y) / g.dy0 * .5 + d / g.d0 * .5));
      else setScale(el, g.s0 * d / g.d0, g.bw, g.bh);
      const q = el.getBoundingClientRect(); place(el, R.left + R.width / 2 - q.width / 2, R.top + R.height / 2 - q.height / 2);
    }
  };
  const end = e => {
    touches.delete(e.pointerId);
    if (!g) return;
    if (g.mode === 'pinch' && touches.size === 1) { const [p] = touches.values(), r = g.el.getBoundingClientRect(); g = { el: g.el, mode: 'move', ox: p.x - r.left, oy: p.y - r.top }; return; }
    if (touches.size === 0) { g.el.classList.remove('grab'); save(g.el); if (g.mode !== 'move') root.dispatchEvent(new Event('hudresize')); g = null; showZoom(); }
  };
  root.onpointerup = end; root.onpointercancel = end;
}

// Alle Widgets ins Fenster holen: zu große verkleinern, überstehende hereinschieben, Positionen speichern
export function fitInside(root) {
  const L = lay(), F = fitFactor();
  for (const el of root.querySelectorAll('[data-drag]')) {
    if (el.classList.contains('w-hidden') || !el.getClientRects().length) continue;
    const key = el.dataset.drag, p = L.w[key] ||= {}, r = el.getBoundingClientRect();
    if (kindOf(el) === 'zoom') {
      const s0 = scaleOf(el), k = Math.min(1, innerWidth * .96 / r.width, innerHeight * .9 / r.height);
      if (k < 1) p.z = Math.max(ZMIN, Math.round(s0 * k / F * 100) / 100);
    } else if (p.w) { p.w = Math.min(p.w, limOf(el).w[1], .96); p.h = Math.min(p.h, limOf(el).h[1], .9); }
    if (p.x != null) { p.x = clampN(p.x, 0, Math.max(0, 1 - Math.min(r.width / innerWidth, 1))); p.y = clampN(p.y, 0, Math.max(0, 1 - Math.min(r.height / innerHeight, 1))); }
  }
  saveProfile();
}

// Bearbeitungsfenster: verschiebbar und einklappbar, damit Widgets dahinter erreichbar sind
function panel(root, bar, onDone) {
  const L = lay(), names = { ...Object.fromEntries(WIDGETS.map(w => [w[0], w[1]])) };
  for (const x of L.extras) names['x' + x.id] = (x.type === 'graph' ? GRAPHS : METRICS)[x.metric];
  const P = profile.hudEditPos ||= {};
  bar.classList.toggle('collapsed', !!P.c);
  if (P.x != null) Object.assign(bar.style, { left: clampN(P.x, 0, innerWidth - 120) + 'px', top: clampN(P.y, 0, innerHeight - 48) + 'px', transform: 'none' });
  else Object.assign(bar.style, { left: '', top: '', transform: '' });
  const op = Math.round((profile.hudOpacity ?? -1) * 100), tab = P.t || 'w';
  const ICO = { top: '📊', wo: '🏋️', riders: '🚴', right: '⛰️', mini: '🗺️', elev: '📈', msg: '💬', ring: '⭕' };
  bar.innerHTML = `
    <div class="edhead" title="Ziehen zum Verschieben"><span class="edgrip">⠿</span><b>Anzeige anordnen</b><span class="edscr muted small">${{ small: 'Handy hochkant', land: 'Handy quer', large: 'großer Bildschirm' }[cls()]}</span><span class="row"><button class="btn xs ghost" id="edMin" title="Einklappen">${P.c ? '▸' : '▾'}</button><button class="btn xs pri" id="edDone">Fertig</button></span></div>
    <div class="edbody">
      <div class="seg sm edtabs" id="edTabs">${[['w', 'Widgets'], ['a', 'Aussehen'], ['h', 'Hilfe']].map(([k, l]) => `<button data-t="${k}" aria-pressed="${tab === k}">${l}</button>`).join('')}</div>
      <section class="edsec" data-tab="w" ${tab === 'w' ? '' : 'hidden'}>
        <h4>Vorlage</h4>
        <div class="edchips" id="edPreset">${Object.entries(PRESETS).map(([k, v]) => `<button class="chipb" data-p="${k}">${v.n}</button>`).join('')}</div>
        <h4>Sichtbare Widgets</h4>
        <div class="edwgrid edlist">${Object.entries(names).map(([k, n]) => `<label class="edw ${L.w[k]?.hid ? '' : 'on'}"><input type="checkbox" data-w="${k}" ${L.w[k]?.hid ? '' : 'checked'}><span class="edwi">${ICO[k] || (k.startsWith('x') ? '➕' : '▫️')}</span><span class="edwn">${esc(n || k)}</span>${k.startsWith('x') ? `<button class="btn xs ghost danger" data-delx="${k.slice(1)}" title="Entfernen">✕</button>` : ''}</label>`).join('')}</div>
        <h4>Widget hinzufügen</h4>
        <div class="row edadd"><select class="inp sm" id="edAdd"><optgroup label="Wert">${Object.entries(METRICS).map(([k, v]) => `<option value="metric:${k}">${v}</option>`).join('')}</optgroup><optgroup label="Verlauf">${Object.entries(GRAPHS).map(([k, v]) => `<option value="graph:${k}">${v}</option>`).join('')}</optgroup></select><button class="btn sm" id="edAddBtn">+ Hinzufügen</button></div>
      </section>
      <section class="edsec" data-tab="a" ${tab === 'a' ? '' : 'hidden'}>
        <h4>Stil</h4>
        <div class="edchips" id="edStyle">${Object.entries(STYLES).map(([k, v]) => `<button class="chipb" data-s="${k}" aria-pressed="${(profile.hudStyle || 'dark') === k}">${v}</button>`).join('')}</div>
        <h4>Akzentfarbe</h4>
        <div class="swatches sm" id="edAcc">${ACCENTS.map(c => `<button style="background:${c}" data-c="${c}" aria-pressed="${(profile.hudAccent || '#ff6a3d') === c}" aria-label="Farbe ${c}"></button>`).join('')}<input type="color" id="edAccC" value="${profile.hudAccent || '#ff6a3d'}" title="Eigene Farbe"></div>
        <h4>Deckkraft der Flächen <b id="edOpV" class="num">${op < 0 ? 'wie Stil' : op + ' %'}</b></h4>
        <input type="range" id="edOp" min="0" max="100" step="5" value="${op < 0 ? 72 : op}">
        <label class="switch sm"><input type="checkbox" id="edFit" ${L.fit ? 'checked' : ''}><span></span><div class="swt">An Fenstergröße anpassen<small class="muted">Widgets wachsen und schrumpfen mit dem Fenster${L.fit ? ' (gerade ' + Math.round(fitFactor() * 100) + ' %)' : ''}</small></div></label>
      </section>
      <section class="edsec small" data-tab="h" ${tab === 'h' ? '' : 'hidden'}>
        <ul class="edhelp">
          <li><b>Verschieben:</b> Widget ziehen.</li>
          <li><b>Größe:</b> an einer Kante oder Ecke ziehen, mit zwei Fingern auf dem Widget oder mit dem Mausrad.</li>
          <li><b>Antippen:</b> zeigt − / + zum Zoomen und ⟲ für die ursprüngliche Größe.</li>
          <li><b>Dieses Fenster:</b> an der Kopfzeile verschieben oder mit ▾ einklappen.</li>
          <li>Die Anordnung gilt für ${{ small: 'Handys hochkant', land: 'Handys quer', large: 'große Bildschirme' }[cls()]}. Auf Geräten mit anderem Seitenverhältnis ordnen sich die Widgets automatisch.</li>
        </ul>
      </section>
      <div class="row edfoot"><button class="btn sm" id="edFitNow" title="Alle Widgets so verkleinern bzw. verschieben, dass nichts aus dem Fenster ragt">Alles ins Fenster holen</button><button class="btn sm ghost danger" id="edReset">Zurücksetzen</button></div>
    </div>`;
  bar.querySelector('#edTabs').onclick = e => { const b = e.target.closest('[data-t]'); if (!b) return; P.t = b.dataset.t; saveProfile(); for (const x of bar.querySelectorAll('#edTabs [data-t]')) x.setAttribute('aria-pressed', String(x === b)); for (const sct of bar.querySelectorAll('.edsec')) sct.hidden = sct.dataset.tab !== P.t; };
  const refresh = () => { applySaved(root); editMode(root, true, onDone); };
  const reset = () => root.querySelectorAll('[data-drag]').forEach(el => { el.style.scale = ''; el.style.width = ''; el.style.height = ''; unplace(el); });
  bar.querySelector('#edDone').onclick = () => { editMode(root, false); onDone?.(); };
  bar.querySelector('#edMin').onclick = () => { P.c = !P.c; saveProfile(); bar.classList.toggle('collapsed', P.c); bar.querySelector('#edMin').textContent = P.c ? '▸' : '▾'; };
  bar.querySelector('#edReset').onclick = () => { profile.hudLayout[cls()] = { w: {}, extras: [], fit: L.fit }; saveProfile(); reset(); refresh(); };
  bar.querySelector('#edFit').onchange = e => { L.fit = e.target.checked; saveProfile(); refresh(); root.dispatchEvent(new Event('hudresize')); };
  bar.querySelector('#edFitNow').onclick = () => { fitInside(root); refresh(); root.dispatchEvent(new Event('hudresize')); };
  bar.querySelector('#edStyle').onclick = e => { const b = e.target.closest('[data-s]'); if (!b) return; profile.hudStyle = b.dataset.s; saveProfile(); applyTheme(root); for (const x of bar.querySelectorAll('#edStyle [data-s]')) x.setAttribute('aria-pressed', String(x === b)); root.dispatchEvent(new Event('hudresize')); };
  const setAcc = c => { profile.hudAccent = c; saveProfile(); applyTheme(root); for (const b of bar.querySelectorAll('#edAcc [data-c]')) b.setAttribute('aria-pressed', String(b.dataset.c === c)); };
  bar.querySelector('#edAcc').onclick = e => { const b = e.target.closest('[data-c]'); if (b) setAcc(b.dataset.c); };
  bar.querySelector('#edAccC').oninput = e => setAcc(e.target.value);
  bar.querySelector('#edOp').oninput = e => { profile.hudOpacity = +e.target.value / 100; saveProfile(); applyTheme(root); bar.querySelector('#edOpV').textContent = e.target.value + ' %'; };
  bar.querySelector('#edPreset').onclick = e => {
    const b = e.target.closest('[data-p]'), Pr = b && PRESETS[b.dataset.p]; if (!Pr) return;
    profile.hudLayout[cls()] = { w: JSON.parse(JSON.stringify(Pr.w)), extras: (Pr.extras || []).map((x, i) => ({ ...x, id: Date.now().toString(36) + i })), fit: L.fit };
    saveProfile(); reset(); refresh();
  };
  bar.querySelector('.edlist').onchange = e => { const k = e.target.dataset.w; if (!k) return; (L.w[k] ||= {}).hid = e.target.checked ? 0 : 1; saveProfile(); e.target.closest('.edw')?.classList.toggle('on', e.target.checked); root.querySelector(`[data-drag="${k}"]`)?.classList.toggle('w-hidden', !e.target.checked); };
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
