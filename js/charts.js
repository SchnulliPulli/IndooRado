// Diagramme auf Canvas mit Fadenkreuz und Werteanzeige
import { fitCanvas, clamp, zoneColor } from './util.js';

const FONT = d => `${12 * d}px Barlow, system-ui, sans-serif`;

// Mehrere Spuren übereinander (gestapelte Bänder), gemeinsame x-Achse
export function multiChart(canvas, { x, xFmt, tracks, onHover }) {
  const draw = (hx = null) => {
    const { w, h, d } = fitCanvas(canvas); const c = canvas.getContext('2d'); c.clearRect(0, 0, w, h);
    if (!x.length) return;
    const pad = 46 * d, bandGap = 10 * d, n = tracks.length, bh = (h - 20 * d - bandGap * (n - 1)) / n;
    const x0 = x[0], x1 = x[x.length - 1] || 1, X = v => pad + (v - x0) / (x1 - x0 || 1) * (w - pad - 8 * d);
    let hi = null;
    if (hx != null) { const v = x0 + (hx - pad) / (w - pad - 8 * d) * (x1 - x0); let lo = 0, up = x.length - 1; while (up - lo > 1) { const m = (lo + up) >> 1; if (x[m] < v) lo = m; else up = m; } hi = Math.abs(x[lo] - v) < Math.abs(x[up] - v) ? lo : up; }
    tracks.forEach((t, k) => {
      const top = k * (bh + bandGap), vals = t.y.filter(v => v != null);
      if (!vals.length) return;
      let mn = t.min ?? Math.min(...vals), mx = t.max ?? Math.max(...vals); if (mx - mn < 1) mx = mn + 1;
      const Y = v => top + bh - (v - mn) / (mx - mn) * bh;
      c.fillStyle = 'rgba(255,255,255,.03)'; c.fillRect(pad, top, w - pad, bh);
      c.font = FONT(d); c.fillStyle = '#94a1ad'; c.textBaseline = 'top';
      c.fillText(t.label, 4 * d, top + 2 * d);
      c.fillText(Math.round(mx), 4 * d, top + 18 * d); c.textBaseline = 'bottom'; c.fillText(Math.round(mn), 4 * d, top + bh);
      const step = Math.max(1, Math.floor(x.length / (w / d)));
      c.beginPath(); let started = false;
      for (let i = 0; i < x.length; i += step) { const v = t.y[i]; if (v == null) { started = false; continue; } const px = X(x[i]), py = Y(v); started ? c.lineTo(px, py) : c.moveTo(px, py); started = true; }
      if (t.fill) { c.lineTo(X(x[x.length - 1]), top + bh); c.lineTo(X(x[0]), top + bh); c.closePath(); const g = c.createLinearGradient(0, top, 0, top + bh); g.addColorStop(0, t.color + 'aa'); g.addColorStop(1, t.color + '10'); c.fillStyle = g; c.fill(); }
      else { c.strokeStyle = t.color; c.lineWidth = 1.5 * d; c.stroke(); }
      if (t.avg != null) { c.setLineDash([4 * d, 4 * d]); c.strokeStyle = t.color + '99'; c.beginPath(); c.moveTo(pad, Y(t.avg)); c.lineTo(w, Y(t.avg)); c.stroke(); c.setLineDash([]); }
      if (hi != null && t.y[hi] != null) { c.fillStyle = t.color; c.beginPath(); c.arc(X(x[hi]), Y(t.y[hi]), 3.5 * d, 0, 7); c.fill(); }
    });
    c.textBaseline = 'alphabetic'; c.fillStyle = '#94a1ad'; c.font = FONT(d);
    for (let k = 0; k <= 4; k++) { const v = x0 + (x1 - x0) * k / 4, s = xFmt(v); const tw = c.measureText(s).width; c.fillText(s, clamp(X(v) - tw / 2, pad, w - tw), h - 4 * d); }
    if (hi != null) { c.fillStyle = 'rgba(255,255,255,.6)'; c.fillRect(X(x[hi]), 0, d, h - 18 * d); onHover?.(hi); }
  };
  draw();
  const mv = e => { const r = canvas.getBoundingClientRect(); draw((e.clientX - r.left) * (canvas.width / r.width)); };
  canvas.onpointermove = mv; canvas.onpointerdown = mv;
  canvas.onpointerleave = () => { draw(); onHover?.(null); };
  return draw;
}

// Leistungskurve mit logarithmischer Zeitachse
export function curveChart(canvas, series, labels) {
  const { w, h, d } = fitCanvas(canvas); const c = canvas.getContext('2d'); c.clearRect(0, 0, w, h);
  const keys = [...new Set(series.flatMap(s => Object.keys(s.data).map(Number)))].sort((a, b) => a - b);
  if (!keys.length) return;
  const pad = 40 * d, bot = 22 * d, mx = Math.max(...series.flatMap(s => Object.values(s.data))) * 1.08;
  const lx = Math.log(keys[0]), rx = Math.log(keys[keys.length - 1]) || 1;
  const X = k => pad + (Math.log(k) - lx) / (rx - lx || 1) * (w - pad - 10 * d), Y = v => (h - bot) - v / mx * (h - bot - 8 * d);
  c.strokeStyle = 'rgba(255,255,255,.08)'; c.fillStyle = '#94a1ad'; c.font = FONT(d);
  for (let g = 0; g <= 4; g++) { const v = mx * g / 4, y = Y(v); c.beginPath(); c.moveTo(pad, y); c.lineTo(w, y); c.stroke(); c.fillText(Math.round(v), 4 * d, y + 4 * d); }
  for (const k of keys) { const s = labels(k), tw = c.measureText(s).width; c.fillText(s, clamp(X(k) - tw / 2, pad, w - tw), h - 5 * d); }
  for (const s of series) {
    const ks = Object.keys(s.data).map(Number).sort((a, b) => a - b);
    c.strokeStyle = s.color; c.lineWidth = (s.width || 2) * d; c.setLineDash(s.dash ? [5 * d, 4 * d] : []);
    c.beginPath(); ks.forEach((k, i) => { const px = X(k), py = Y(s.data[k]); i ? c.lineTo(px, py) : c.moveTo(px, py); }); c.stroke();
    if (!s.dash) for (const k of ks) { c.fillStyle = s.color; c.beginPath(); c.arc(X(k), Y(s.data[k]), 3 * d, 0, 7); c.fill(); }
  }
  c.setLineDash([]);
}

// Streckenkarte, eingefärbt nach Leistung oder einfarbig
export function trackMap(canvas, pts, opt = {}) {
  const { w, h, d } = fitCanvas(canvas); const c = canvas.getContext('2d'); c.clearRect(0, 0, w, h);
  const ok = pts.filter(p => p[0] != null);
  if (ok.length < 2) { c.fillStyle = '#94a1ad'; c.font = FONT(d); c.fillText('Keine Kartendaten', 10 * d, 20 * d); return; }
  let a = 1e9, b = -1e9, e = 1e9, f = -1e9; for (const p of ok) { a = Math.min(a, p[0]); b = Math.max(b, p[0]); e = Math.min(e, p[1]); f = Math.max(f, p[1]); }
  const k = Math.cos(a * Math.PI / 180), sx = (f - e) * k || 1e-6, sy = (b - a) || 1e-6, pad = (opt.pad ?? 14) * d;
  const s = Math.min((w - 2 * pad) / sx, (h - 2 * pad) / sy), ox = (w - sx * s) / 2, oy = (h - sy * s) / 2;
  const P = p => [ox + (p[1] - e) * k * s, h - oy - (p[0] - a) * s];
  c.lineJoin = c.lineCap = 'round';
  c.strokeStyle = opt.base || 'rgba(255,255,255,.18)'; c.lineWidth = (opt.width || 6) * d; c.beginPath(); ok.forEach((p, i) => { const [x, y] = P(p); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.stroke();
  c.lineWidth = (opt.width ? opt.width - 2 : 3.5) * d;
  for (let i = 1; i < ok.length; i++) {
    const [x0, y0] = P(ok[i - 1]), [x1, y1] = P(ok[i]);
    c.strokeStyle = opt.ftp && ok[i][2] != null ? zoneColor(ok[i][2] / opt.ftp) : (opt.color || '#ff6a3d');
    if (opt.until != null && i > opt.until) c.strokeStyle = opt.rest || 'rgba(255,255,255,.35)';
    c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
  }
  const dot = (p, col) => { const [x, y] = P(p); c.fillStyle = col; c.beginPath(); c.arc(x, y, 5 * d, 0, 7); c.fill(); c.strokeStyle = '#fff'; c.lineWidth = 2 * d; c.stroke(); };
  if (opt.marker != null && ok[opt.marker]) dot(ok[opt.marker], '#ff6a3d');
  else if (!opt.noEnds) { dot(ok[0], '#4fd18b'); dot(ok[ok.length - 1], '#ef4458'); }
}

// Höhenprofil (Strecke), optional mit Position
export function profileChart(canvas, dist, ele, opt = {}) {
  const { w, h, d } = fitCanvas(canvas); const c = canvas.getContext('2d'); c.clearRect(0, 0, w, h);
  if (dist.length < 2) return;
  let mn = Math.min(...ele), mx = Math.max(...ele); if (mx - mn < 30) { mx = mn + 30; }
  const top = (opt.top ?? 6) * d, bot = (opt.bottom ?? 4) * d;
  const D = dist[dist.length - 1], X = v => v / D * w, Y = v => h - bot - (v - mn) / (mx - mn) * (h - top - bot);
  const step = Math.max(1, Math.floor(dist.length / w));
  for (let i = 0; i + step < dist.length; i += step) {
    const g = (ele[i + step] - ele[i]) / ((dist[i + step] - dist[i]) || 1) * 100;
    c.fillStyle = g > 8 ? '#ef4458' : g > 5 ? '#ff8a3d' : g > 2.5 ? '#f5c542' : g > -1.5 ? '#4fd18b' : '#3fa7f5';
    if (opt.mono) c.fillStyle = opt.mono;
    const x0 = X(dist[i]), x1 = X(dist[i + step]);
    c.beginPath(); c.moveTo(x0, h); c.lineTo(x0, Y(ele[i])); c.lineTo(x1, Y(ele[i + step])); c.lineTo(x1, h); c.fill();
  }
  if (opt.climbs) for (const cl of opt.climbs) { c.fillStyle = 'rgba(255,255,255,.12)'; c.fillRect(X(cl.from), 0, X(cl.to) - X(cl.from), h); }
  if (opt.pos != null) {
    const px = X(opt.pos); let i = Math.min(dist.length - 1, Math.round(opt.pos / D * (dist.length - 1)));
    c.fillStyle = '#fff'; c.fillRect(px - d, 0, 2 * d, h); c.beginPath(); c.arc(px, Y(ele[i]), 5 * d, 0, 7); c.fill();
  }
  if (opt.ghost != null) { const px = X(opt.ghost); c.fillStyle = '#b06cf0'; c.fillRect(px - d, 0, 2 * d, h); }
  return { mn, mx };
}

// Balken (z. B. Wochen)
export function barChart(canvas, items, { color = '#ff6a3d', fmt = v => v } = {}) {
  const { w, h, d } = fitCanvas(canvas); const c = canvas.getContext('2d'); c.clearRect(0, 0, w, h);
  const mx = Math.max(1, ...items.map(i => i.v)), bot = 20 * d, gap = 4 * d, bw = (w - gap * (items.length - 1)) / items.length;
  c.font = FONT(d); c.textAlign = 'center';
  items.forEach((it, i) => {
    const bh = it.v / mx * (h - bot - 16 * d), x = i * (bw + gap);
    c.fillStyle = it.hl ? color : color + '88'; c.fillRect(x, h - bot - bh, bw, bh);
    c.fillStyle = '#94a1ad'; if (bw > 22 * d || i % 2 === 0) c.fillText(it.l, x + bw / 2, h - 5 * d);
    if (it.v && bw > 26 * d) { c.fillStyle = '#eef2f5'; c.fillText(fmt(it.v), x + bw / 2, h - bot - bh - 4 * d); }
  });
  c.textAlign = 'start';
}
