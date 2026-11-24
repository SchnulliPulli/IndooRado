// Strecken: eingebaute Welten, GPX-Import, Aufbereitung für Physik und 3D-Welt
import { clamp, lerp, smooth, fbm, noise1 } from './util.js';
import { db } from './db.js';

const R2D = 180 / Math.PI, M_DEG = 111320;
const TAU = Math.PI * 2;

/* ---------- Themen der Landschaft ---------- */
export const THEMES = {
  meadow: { sky: ['#3d86d4', '#cfe6f7'], grass: ['#5f9a46', '#78ad4f', '#8fb85a'], hillAmp: 22, hillScale: 520, valley: 0.04, trees: 0.6, conifer: 0.35, houses: 0.08, rocks: 0.05, snow: 9999, mountains: 0.5 },
  lake: { sky: ['#3f8ed8', '#d4ebf8'], grass: ['#5b9844', '#74ab4c', '#93bb5c'], hillAmp: 16, hillScale: 480, valley: 0.05, trees: 0.55, conifer: 0.4, houses: 0.06, rocks: 0.04, snow: 9999, mountains: 0.8, lake: true },
  alpine: { sky: ['#2f74c4', '#d9ecf8'], grass: ['#5a8f43', '#6d9a4a', '#8aa46a'], hillAmp: 45, hillScale: 650, valley: 0.22, trees: 0.7, conifer: 0.95, houses: 0.02, rocks: 0.25, snow: 1750, mountains: 1.6 },
  coast: { sky: ['#4a92d8', '#e2f1fa'], grass: ['#86a85a', '#9db66a', '#c7c08a'], hillAmp: 26, hillScale: 600, valley: 0.06, trees: 0.25, conifer: 0.2, houses: 0.1, rocks: 0.15, snow: 9999, mountains: 0.4, coast: -1 },
  forest: { sky: ['#4b8fd0', '#d6eaf5'], grass: ['#4c853a', '#5d9343', '#6f9d48'], hillAmp: 20, hillScale: 380, valley: 0.05, trees: 1.0, conifer: 0.6, houses: 0.01, rocks: 0.08, snow: 9999, mountains: 0.3 },
  plains: { sky: ['#4790db', '#e4f1f8'], grass: ['#7ea94c', '#a8b85a', '#c9b864'], hillAmp: 6, hillScale: 700, valley: 0.01, trees: 0.25, conifer: 0.1, houses: 0.12, rocks: 0.01, snow: 9999, mountains: 0.2 },
};

/* ---------- Eingebaute Strecken ---------- */
function polarLoop({ len, lobes, seed, ele, lat0, lon0 }) {
  const N = 6000, P = [];
  const R = th => 1 + lobes.reduce((s, [k, a, ph]) => s + a * Math.sin(k * th + ph), 0);
  for (let i = 0; i <= N; i++) { const th = i / N * TAU; const r = R(th); P.push([Math.cos(th) * r, Math.sin(th) * r, th]); }
  let L = 0; for (let i = 1; i <= N; i++) L += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
  const sc = len / L;
  return resampleXY(P.map(p => [p[0] * sc, p[1] * sc, ele(p[2])]), lat0, lon0, { center: [-P[0][0] * sc, -P[0][1] * sc], rAt: th => R(th) * sc });
}
function pathOpen({ len, heading, ele, lat0, lon0 }) {
  const P = []; let x = 0, z = 0;
  for (let d = 0; d <= len; d += 2) { const h = heading(d); P.push([x, z, ele(d)]); x += Math.sin(h) * 2; z -= Math.cos(h) * 2; }
  return resampleXY(P, lat0, lon0, null);
}
function resampleXY(P, lat0, lon0, shape) {
  const pts = []; let acc = 0, next = 0;
  for (let i = 0; i < P.length; i++) {
    if (i) acc += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
    if (acc >= next || i === P.length - 1) {
      const [x, z, e] = P[i];
      pts.push([lat0 + (-z) / M_DEG, lon0 + x / (M_DEG * Math.cos(lat0 / R2D)), +e.toFixed(2)]);
      next += 10;
    }
  }
  return { pts, shape };
}
const S = (k, a, ph) => [k, a, ph];
const BUILTIN_DEF = [
  { id: 'b-hills', name: 'Hügelland-Runde', theme: 'meadow', desc: 'Welliger Rundkurs durch Wiesen, Wälder und Dörfer.', make: () => polarLoop({ len: 24000, lobes: [S(2, .18, .5), S(3, .12, 1.3), S(5, .05, 2)], lat0: 49.55, lon0: 11.0, ele: th => 330 + 38 * Math.sin(th * 3 + .4) + 16 * Math.sin(th * 7 + 1.2) + 5 * Math.sin(th * 15 + .3) + 2 * Math.sin(th * 23) }), loop: true, climbNames: ['Kirchberg', 'Hohe Leite', 'Lindenbuck', 'Steinacker'] },
  { id: 'b-lake', name: 'Seenrunde', theme: 'lake', desc: 'Flache Runde um einen Bergsee, ideal für Intervalle.', make: () => polarLoop({ len: 16000, lobes: [S(2, .22, 0), S(3, .08, 2.1), S(4, .04, .7)], lat0: 47.7, lon0: 11.75, ele: th => 780 + 3 * Math.sin(th * 2) + 1.5 * Math.sin(th * 9 + 1) }), loop: true, climbNames: [] },
  { id: 'b-pass', name: 'Passo Bianco', theme: 'alpine', desc: '13 km Bergauffahrt mit Kehren bis über die Baumgrenze.', make: () => pathOpen({ len: 13000, heading: d => 0.3 + 1.5 * Math.sin(d / 230) + 0.25 * Math.sin(d / 71), ele: d => 920 + d * 0.074 + 9 * Math.sin(d / 400) + 4 * Math.sin(d / 130) + (d > 12400 ? -(d - 12400) * 0.05 : 0), lat0: 46.55, lon0: 11.85 }), loop: false, climbNames: ['Passo Bianco'] },
  { id: 'b-coast', name: 'Küstenstraße', theme: 'coast', desc: '28 km entlang des Meeres, leicht wellig.', make: () => pathOpen({ len: 28000, heading: d => 1.2 + 0.35 * Math.sin(d / 1700) + 0.18 * Math.sin(d / 430 + 1), ele: d => 40 + 22 * Math.sin(d / 2100) + 12 * Math.sin(d / 760 + .5) + 5 * Math.sin(d / 230) + 18 * Math.max(0, Math.sin(d / 5200 - 1)), lat0: 43.6, lon0: 7.2 }), loop: false, climbNames: ['Capo Rosso', 'Punta Verde', 'Belvedere'] },
  { id: 'b-forest', name: 'Waldrunde', theme: 'forest', desc: 'Kurze, knackige Runde im dichten Mischwald.', make: () => polarLoop({ len: 9000, lobes: [S(2, .2, 1), S(3, .15, 0), S(6, .05, 1)], lat0: 50.1, lon0: 10.4, ele: th => 450 + 14 * Math.sin(th * 2 + 1) + 9 * Math.sin(th * 5) + 4 * Math.sin(th * 11 + 2) }), loop: true, climbNames: ['Buchenrampe', 'Fuchsbau'] },
  { id: 'b-tour', name: 'Königsetappe', theme: 'alpine', desc: '55 km mit Talfahrt und zwei harten Anstiegen.', make: () => pathOpen({ len: 55000, heading: d => 0.8 * Math.sin(d / 3100) + 0.5 * Math.sin(d / 900 + .3) + (d > 18000 && d < 25000 ? 1.2 * Math.sin((d - 18000) / 200) : 0) + (d > 42000 && d < 47000 ? 1.3 * Math.sin((d - 42000) / 170) : 0), ele: d => { let e = 600 + 8 * Math.sin(d / 1300) + 4 * Math.sin(d / 400); if (d > 18000) e += Math.min(d - 18000, 7000) * 0.062; if (d > 25000) e -= Math.min(d - 25000, 9000) * 0.042; if (d > 42000) e += Math.min(d - 42000, 5000) * 0.078; if (d > 47000) e -= Math.min(d - 47000, 8000) * 0.04; return e; }, lat0: 46.9, lon0: 10.8 }), loop: false, climbNames: ['Colle di Fieno', 'Muro Finale'] },
  { id: 'b-flat', name: 'Flachland-Achter', theme: 'plains', desc: 'Topfebene Runde durch Felder für ERG-Workouts.', make: () => polarLoop({ len: 20000, lobes: [S(2, .35, .3), S(4, .06, 1)], lat0: 52.3, lon0: 9.7, ele: th => 60 + 1.2 * Math.sin(th * 3) }), loop: true, climbNames: [] },
];
// Ortschaften [Beginn m, Länge m, Name] und Tunnel [von m, bis m]
const EXTRAS = {
  'b-hills': { towns: [[2500, 650, 'Kirchdorf'], [11000, 800, 'Lindenau'], [18500, 550, 'Steinach']] },
  'b-lake': { towns: [[4000, 700, 'Seehausen'], [12000, 500, 'Uferweiler']] },
  'b-pass': { towns: [[250, 500, 'Fondovalle']], tunnels: [[6200, 6650]] },
  'b-coast': { towns: [[2500, 900, 'Marina Chiara'], [15500, 700, 'San Vento'], [25500, 800, 'Capo Lume']], tunnels: [[9500, 9900], [20000, 20380]] },
  'b-forest': { towns: [[6000, 300, 'Forsthaus']] },
  'b-tour': { towns: [[2000, 1000, 'Talstadt'], [30000, 1200, 'Mittelberg'], [52800, 900, 'Gipfeldorf']], tunnels: [[27000, 27550], [38000, 38420]] },
  'b-flat': { towns: [[5000, 900, 'Feldheim'], [14000, 700, 'Kornau']] },
};
export const BUILTIN = BUILTIN_DEF.map(r => ({ id: r.id, name: r.name, theme: r.theme, desc: r.desc, loop: r.loop, builtin: true, climbNames: r.climbNames, _make: r.make, ...EXTRAS[r.id] }));

let cache = new Map();
export async function listRoutes() {
  const own = (await db.all('routes')).sort((a, b) => (b.created || '').localeCompare(a.created || ''));
  return [...BUILTIN, ...own];
}
export async function getRaw(id) {
  const b = BUILTIN.find(r => r.id === id);
  if (b) { if (!b.pts) { const m = b._make(); b.pts = m.pts; b.shape = m.shape; } return b; }
  return db.get('routes', id);
}
export async function getRoute(id) {
  if (cache.has(id)) return cache.get(id);
  const raw = await getRaw(id) || await getRaw('b-hills');
  const r = prepare(raw);
  cache.set(id, r);
  return r;
}
export function quickStats(raw) {
  if (raw.stats) return raw.stats;
  if (!raw.pts) { const m = raw._make(); raw.pts = m.pts; raw.shape = m.shape; }
  let d = 0, asc = 0;
  for (let i = 1; i < raw.pts.length; i++) {
    d += hav(raw.pts[i - 1], raw.pts[i]);
    const de = raw.pts[i][2] - raw.pts[i - 1][2]; if (de > 0) asc += de;
  }
  raw.stats = { dist: d, asc };
  return raw.stats;
}
function hav(a, b) { const r = 6371000, dl = (b[0] - a[0]) / R2D, dn = (b[1] - a[1]) / R2D, x = Math.sin(dl / 2) ** 2 + Math.cos(a[0] / R2D) * Math.cos(b[0] / R2D) * Math.sin(dn / 2) ** 2; return 2 * r * Math.asin(Math.sqrt(x)); }

/* ---------- GPX ---------- */
export function parseGpx(text, fname) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('Datei ist kein gültiges GPX');
  let nodes = [...doc.getElementsByTagName('trkpt')];
  if (!nodes.length) nodes = [...doc.getElementsByTagName('rtept')];
  if (nodes.length < 2) throw new Error('Keine Trackpunkte gefunden');
  const raw = nodes.map(n => [+n.getAttribute('lat'), +n.getAttribute('lon'), parseFloat(n.getElementsByTagName('ele')[0]?.textContent)]);
  const hasEle = raw.some(p => !isNaN(p[2]));
  const pts = []; let last = null, acc = 0;
  for (const p of raw) {
    if (isNaN(p[2])) p[2] = 0;
    if (!last) { pts.push(p); last = p; continue; }
    acc += hav(last, p); last = p;
    if (acc >= 8) { pts.push(p); acc = 0; }
  }
  if (pts.length < 3) throw new Error('Strecke ist zu kurz');
  const nm = (doc.getElementsByTagName('name')[0]?.textContent || fname || 'Eigene Strecke').trim().slice(0, 60);
  const loop = hav(pts[0], pts[pts.length - 1]) < 150;
  const r = { id: 'g-' + Date.now().toString(36), name: nm, theme: 'auto', loop, builtin: false, created: new Date().toISOString(), pts: pts.map(p => [+p[0].toFixed(6), +p[1].toFixed(6), +p[2].toFixed(1)]), noEle: !hasEle };
  r.stats = quickStats(r);
  if (r.stats.dist < 500) throw new Error('Strecke ist kürzer als 500 m');
  return r;
}
export async function saveRoute(r) { await db.put('routes', r); cache.delete(r.id); }
export async function deleteRoute(id) { await db.del('routes', id); cache.delete(id); }

/* ---------- Aufbereitung ---------- */
export function prepare(raw) {
  const P = raw.pts, lat0 = P[0][0], lon0 = P[0][1], kx = M_DEG * Math.cos(lat0 / R2D);
  // lokale Koordinaten (x Ost, z Süd), dann auf 5 m neu abtasten
  const L = P.map(p => [(p[1] - lon0) * kx, -(p[0] - lat0) * M_DEG, p[2]]);
  if (raw.loop) L.push([...L[0]]);
  const cum = [0]; for (let i = 1; i < L.length; i++) cum.push(cum[i - 1] + Math.hypot(L[i][0] - L[i - 1][0], L[i][1] - L[i - 1][1]));
  const total0 = cum[cum.length - 1], STEP = 5, N = Math.max(4, Math.floor(total0 / STEP));
  let x = new Float64Array(N + 1), z = new Float64Array(N + 1), e = new Float64Array(N + 1);
  let j = 0;
  for (let i = 0; i <= N; i++) {
    const d = i * total0 / N;
    while (j < L.length - 2 && cum[j + 1] < d) j++;
    const t = cum[j + 1] > cum[j] ? clamp((d - cum[j]) / (cum[j + 1] - cum[j]), 0, 1) : 0;
    x[i] = lerp(L[j][0], L[j + 1][0], t); z[i] = lerp(L[j][1], L[j + 1][1], t); e[i] = lerp(L[j][2], L[j + 1][2], t);
  }
  const wrap = i => raw.loop ? ((i % N) + N) % N : clamp(i, 0, N);
  const smoothArr = (a, w) => { const o = new Float64Array(a.length); for (let i = 0; i <= N; i++) { let s = 0, c = 0; for (let k = -w; k <= w; k++) { const q = wrap(i + k); s += a[q]; c++; } o[i] = s / c; } return o; };
  if (!raw.builtin) { x = smoothArr(x, 3); z = smoothArr(z, 3); e = smoothArr(e, 8); }
  else e = smoothArr(e, 2);
  if (raw.loop) { x[N] = x[0]; z[N] = z[0]; e[N] = e[0]; }
  const step = total0 / N, total = total0;
  // Kurs, Steigung
  const head = new Float64Array(N + 1), grade = new Float64Array(N + 1);
  for (let i = 0; i <= N; i++) {
    const a = wrap(i - 2), b = wrap(i + 2);
    head[i] = Math.atan2(x[b] - x[a], -(z[b] - z[a]));
    const ga = wrap(i - 5), gb = wrap(i + 5);
    const span = raw.loop ? 10 * step : (Math.min(N, i + 5) - Math.max(0, i - 5)) * step;
    grade[i] = span > 0 ? clamp((e[gb] - e[ga]) / span * 100, -25, 25) : 0;
  }
  let asc = 0, minE = Infinity, maxE = -Infinity;
  for (let i = 0; i <= N; i++) { if (i && e[i] > e[i - 1]) asc += e[i] - e[i - 1]; minE = Math.min(minE, e[i]); maxE = Math.max(maxE, e[i]); }
  const lat = i => lat0 - z[i] / M_DEG, lon = i => lon0 + x[i] / kx;

  // Themenwahl für GPX: Höhe entscheidet
  let themeKey = raw.theme;
  if (themeKey === 'auto') themeKey = maxE > 1300 ? 'alpine' : (maxE - minE > 250 ? 'meadow' : (asc / total * 1000 < 5 ? 'plains' : 'forest'));
  const theme = THEMES[themeKey] || THEMES.meadow;
  const water = theme.lake ? minE - 2.5 : theme.coast ? Math.min(0, minE - 25) : null;

  // Räumlicher Index: grob (25 m) und fein (5 m)
  const CELL = 100, grid = new Map(), FAR = 600, far = new Map();
  const key = (a, b) => a * 73856093 ^ b * 19349663;
  for (let i = 0; i <= N; i += 5) {
    const k = key(Math.floor(x[i] / CELL), Math.floor(z[i] / CELL));
    if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i);
  }
  for (let i = 0; i <= N; i += 20) {
    const k = key(Math.floor(x[i] / FAR), Math.floor(z[i] / FAR));
    if (!far.has(k)) far.set(k, []); far.get(k).push(i);
  }
  let meanE = 0; for (let i = 0; i <= N; i++) meanE += e[i]; meanE /= N + 1;

  function nearest(px, pz) {
    const cx = Math.floor(px / CELL), cz = Math.floor(pz / CELL);
    let best = -1, bd = Infinity;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const l = grid.get(key(cx + a, cz + b)); if (!l) continue;
      for (const i of l) { const dd = (x[i] - px) ** 2 + (z[i] - pz) ** 2; if (dd < bd) { bd = dd; best = i; } }
    }
    if (best < 0) return null;
    // fein: Segmentprojektion in der Umgebung
    let res = null, rd = Infinity;
    for (let k = best - 6; k < best + 6; k++) {
      const a = raw.loop ? wrap(k) : clamp(k, 0, N - 1), b = raw.loop ? wrap(a + 1) : a + 1;
      if (b > N) continue;
      const ux = x[b] - x[a], uz = z[b] - z[a], l2 = ux * ux + uz * uz || 1;
      const t = clamp(((px - x[a]) * ux + (pz - z[a]) * uz) / l2, 0, 1);
      const qx = x[a] + ux * t, qz = z[a] + uz * t, dd = (px - qx) ** 2 + (pz - qz) ** 2;
      if (dd < rd) { rd = dd; res = { i: a, t, dist: Math.sqrt(dd), ele: lerp(e[a], e[b], t), side: Math.sign(ux * (pz - z[a]) - uz * (px - x[a])) }; }
    }
    return res;
  }
  function farBase(px, pz) {
    const cx = Math.floor(px / FAR), cz = Math.floor(pz / FAR);
    let bd = Infinity, be = meanE, bi = -1;
    for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) {
      const l = far.get(key(cx + a, cz + b)); if (!l) continue;
      for (const i of l) { const dd = (x[i] - px) ** 2 + (z[i] - pz) ** 2; if (dd < bd) { bd = dd; be = e[i]; bi = i; } }
    }
    let side = 0;
    if (bi >= 0) { const j = Math.min(N, bi + 1), i0 = j === bi ? bi - 1 : bi; const ux = x[j] - x[i0], uz = z[j] - z[i0]; side = Math.sign(ux * (pz - z[i0]) - uz * (px - x[i0])); }
    return { ele: be, dist: bi >= 0 ? Math.sqrt(bd) : 5000, side };
  }
  const shape = raw.shape;
  // Orte und Tunnel (GPX: Orte automatisch, keine Tunnel)
  let towns = (raw.towns || []).map(([at, len, name]) => ({ from: at, to: Math.min(total - 50, at + len), name }));
  if (!raw.builtin && !raw.towns && total > 8000) towns = [[.3, 'Ortschaft'], [.7, 'Weiler']].map(([f, name]) => ({ from: total * f, to: total * f + 600, name }));
  const tunnels = (raw.tunnels || []).map(([from, to]) => ({ from, to })).filter(t => t.to < total - 60);
  const townAt = d => towns.find(t => d >= t.from && d <= t.to) || null;
  const tunnelAt = (d, pad = 0) => tunnels.find(t => d >= t.from - pad && d <= t.to + pad) || null;
  const cover = d => { let c = 0; for (const t of tunnels) c = Math.max(c, smooth(t.from - 30, t.from + 15, d) * (1 - smooth(t.to - 15, t.to + 30, d))); return c; };
  function heightAt(px, pz) {
    const n = nearest(px, pz);
    let base, d, side = 0;
    if (n && n.dist < 260) { base = n.ele; d = n.dist; side = n.side; }
    else { const f = farBase(px, pz); base = f.ele; d = Math.max(260, f.dist); side = f.side; }
    const sc = theme.hillScale;
    let hills = theme.hillAmp * (fbm(px / sc, pz / sc, 4, 3) + 0.25 * fbm(px / 90, pz / 90, 2, 9));
    let h = base + hills * smooth(14, 150, d) + Math.min(d, 900) * theme.valley * (0.6 + 0.4 * fbm(px / 800, pz / 800, 2, 5));
    if (theme.mountains) h += theme.mountains * 180 * smooth(500, 2200, d) * (0.55 + 0.45 * fbm(px / 1500, pz / 1500, 3, 11));
    if (water != null) {
      if (theme.coast && side === theme.coast) h = lerp(h, water - 14, smooth(22, 150, d));
      if (theme.lake && shape) {
        const ang = Math.atan2(pz - shape.center[1], px - shape.center[0]);
        const th = ang < 0 ? ang + TAU : ang;
        const r = Math.hypot(px - shape.center[0], pz - shape.center[1]), R = shape.rAt(th);
        if (r < R) h = lerp(h, water - 10, smooth(R - 25, R - 140, r));
      }
    }
    const cv = n && tunnels.length && n.dist < 90 ? cover(n.i * step) * smooth(90, 50, n.dist) : 0;
    if (n && n.dist < 40) h = lerp(lerp(n.ele - 0.7, h, smooth(4.6, 32, n.dist)), h, cv);
    // Tunnel: Bergrücken über der Straße
    if (cv > 0) h = lerp(h, Math.max(h, n.ele + 13 + n.dist * .55 + hills * .5), cv);
    // Orte: Gelände flacher
    if (n && n.dist < 70 && towns.length) { const tw = townAt(n.i * step); if (tw) h = lerp(n.ele - .5, h, smooth(20, 70, n.dist)); }
    return h;
  }

  // Anstiege erkennen
  const climbs = [];
  {
    let low = 0, hi = 0, inC = false;
    for (let i = 1; i <= N; i++) {
      if (!inC) { if (e[i] < e[low]) low = i; if (e[i] - e[low] > 12) { inC = true; hi = i; } }
      else {
        if (e[i] > e[hi]) hi = i;
        if (e[hi] - e[i] > 10 || i === N) {
          const g200 = (a, dir) => { const b = clamp(a + dir * Math.round(200 / step), 0, N); return (e[Math.max(a, b)] - e[Math.min(a, b)]) / (Math.abs(b - a) * step || 1); };
          while (low < hi - 40 && g200(low, 1) < 0.02) low += 10;
          while (hi > low + 40 && g200(hi, -1) < 0.02) hi -= 10;
          const len = (hi - low) * step, gain = e[hi] - e[low];
          if (gain >= 25 && len >= 500 && gain / len >= 0.03) climbs.push({ from: low * step, to: hi * step, len, gain, avg: gain / len * 100 });
          inC = false; low = i;
        }
      }
    }
    climbs.forEach((c, k) => { c.name = raw.climbNames?.[k] || 'Anstieg ' + (k + 1); c.id = k; let mx = 0; for (let i = Math.floor(c.from / step); i < c.to / step; i += 4) mx = Math.max(mx, grade[i]); c.max = mx; });
  }

  // Sprintwertungen: 300 m in Ortschaften
  const sprints = towns.filter(t => t.to - t.from >= 400).map((t, k) => ({ id: k, name: 'Sprint ' + t.name, from: t.from + 60, to: t.from + 360, len: 300 }));

  const idxAt = d => { const u = d / step; return [Math.floor(u), u - Math.floor(u)]; };
  function sample(arr, d) {
    if (raw.loop) d = ((d % total) + total) % total; else d = clamp(d, 0, total);
    const [i, t] = idxAt(d); const a = clamp(i, 0, N), b = clamp(i + 1, 0, N);
    return lerp(arr[a], arr[b], t);
  }
  function headAt(d) {
    if (raw.loop) d = ((d % total) + total) % total; else d = clamp(d, 0, total);
    const [i, t] = idxAt(d); const a = clamp(i, 0, N), b = clamp(i + 1, 0, N);
    let h1 = head[a], h2 = head[b]; let dh = h2 - h1; while (dh > Math.PI) dh -= TAU; while (dh < -Math.PI) dh += TAU;
    return h1 + dh * t;
  }
  return {
    id: raw.id, name: raw.name, desc: raw.desc, builtin: raw.builtin, loop: raw.loop, themeKey, theme, water,
    N, step, total, x, z, e, head, grade, asc, minE, maxE, climbs, lat, lon, towns, tunnels, sprints, townAt, tunnelAt,
    eleAt: d => sample(e, d), gradeAt: d => sample(grade, d), xAt: d => sample(x, d), zAt: d => sample(z, d), headAt,
    latAt: d => lat0 - sample(z, d) / M_DEG, lonAt: d => lon0 + sample(x, d) / kx,
    heightAt, nearest,
  };
}
