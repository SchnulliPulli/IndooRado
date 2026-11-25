// Workouts: Bibliothek, Import (.zwo, .erg, .mrc), Zielberechnung, Vorschau
import { db, tomb } from './db.js';
import { zoneColor, fitCanvas } from './util.js';

// Abschnitt: { dur (s), a, b (Anteil FTP, null = frei), cad?, text? }
const ss = (dur, p, text) => ({ dur, a: p, b: p, text });
const ramp = (dur, a, b, text) => ({ dur, a, b, text });
const free = (dur, text) => ({ dur, a: null, b: null, text });
const rep = (n, ...segs) => Array.from({ length: n }, () => segs).flat();
export const WB = { ss, ramp, free, rep };
// Workouts aus Trainingsplänen (plans.js trägt sie hier ein)
export const EXTRA_W = new Map();
const W =(id, name, cat, desc, segs, extra = {}) => ({ id, name, cat, desc, segs, builtin: true, ...extra });

export const BUILTIN_W = [
  W('w-easy', 'Lockere Grundlage', 'Ausdauer', '45 Minuten ruhig in Zone 2. Fördert den Fettstoffwechsel und erholt aktiv.', [ramp(300, .45, .62, 'Einrollen'), ss(2100, .65), ramp(300, .6, .4, 'Ausrollen')]),
  W('w-endu90', 'Grundlage lang', 'Ausdauer', '90 Minuten Zone 2 mit kurzen Tempospitzen gegen Langeweile.', [ramp(600, .45, .65), ...rep(4, ss(1020, .68), ss(60, .85, 'Kurz anziehen'), ss(120, .6)), ss(240, .68), ramp(300, .6, .4)]),
  W('w-tempo', 'Tempo 3×12', 'Tempo', 'Drei Blöcke im Tempobereich, gut für die Grundlagenausdauer mit Biss.', [ramp(600, .45, .75), ...rep(3, ss(720, .82), ss(240, .55)), ramp(420, .6, .4)]),
  W('w-ss3', 'Sweet Spot 3×10', 'Sweet Spot', 'Der Klassiker: drei Mal zehn Minuten bei 88 bis 92 % FTP.', [ramp(600, .45, .75), ss(120, .95, 'Öffner'), ss(180, .55), ...rep(3, ss(600, .9), ss(300, .55)), ramp(300, .55, .4)]),
  W('w-ss2', 'Sweet Spot 2×20', 'Sweet Spot', 'Zwei lange Sweet-Spot-Blöcke für die Schwelle.', [ramp(600, .45, .78), ...rep(2, ss(1200, .9), ss(300, .55)), ramp(300, .55, .4)]),
  W('w-thr2', 'Schwelle 2×15', 'Schwelle', 'Zwei Mal 15 Minuten knapp an der FTP.', [ramp(600, .45, .8), ss(60, 1.05), ss(240, .55), ...rep(2, ss(900, .98), ss(360, .55)), ramp(300, .55, .4)]),
  W('w-overunder', 'Over-Under 4×8', 'Schwelle', 'Wechsel zwischen 95 und 108 % FTP. Lehrt, Laktat abzubauen.', [ramp(600, .45, .8), ...rep(4, ...rep(4, ss(90, .95), ss(30, 1.08)), ss(240, .55)), ramp(300, .55, .4)]),
  W('w-vo5', 'VO2max 5×3', 'VO2max', 'Fünf harte Intervalle mit 115 % FTP.', [ramp(600, .45, .75), ss(120, .95), ss(180, .55), ...rep(5, ss(180, 1.15), ss(180, .5)), ramp(420, .6, .4)]),
  W('w-3030', '30/30 Intervalle', 'VO2max', 'Zwei Sätze mit je zehn Mal 30 Sekunden hart, 30 Sekunden locker.', [ramp(600, .45, .75), ...rep(2, ...rep(10, ss(30, 1.25), ss(30, .5)), ss(300, .55)), ramp(300, .55, .4)]),
  W('w-pyr', 'Pyramide', 'Gemischt', 'Stufen von 80 bis 105 % FTP und zurück.', [ramp(480, .45, .7), ...[.8, .88, .95, 1.02, 1.05, 1.02, .95, .88, .8].flatMap(x => [ss(180, x), ss(60, .5)]), ramp(360, .6, .4)]),
  W('w-sprint', 'Sprints', 'Sprint', 'Acht kurze Sprints mit voller Erholung. Im Sprint frei fahren.', [ramp(600, .45, .75), ...rep(8, free(15, 'Sprint! Alles geben'), ss(225, .5)), ramp(300, .55, .4)]),
  W('w-free', 'Freie Fahrt mit Aufwärmen', 'Gemischt', 'Zehn Minuten Aufwärmen, danach frei mit virtuellen Gängen.', [ramp(600, .45, .7), free(3000, 'Frei fahren')]),
  W('w-ramp', 'Rampentest', 'Test', 'Jede Minute +6 % FTP bis zur Erschöpfung. Neue FTP = 75 % der besten Minute.', [ramp(300, .4, .55), ...Array.from({ length: 30 }, (_, i) => ss(60, .5 + i * .06 * (200 / 200), 'Stufe ' + (i + 1)))], { test: 'ramp' }),
  W('w-ftp20', 'FTP-Test 20 Minuten', 'Test', 'Klassischer Test. Neue FTP = 95 % der 20-Minuten-Leistung.', [ramp(600, .45, .75), ...rep(3, ss(60, 1.1), ss(60, .5)), ss(300, 1.05, 'Vorbelastung'), ss(600, .5), free(1200, '20 Minuten so hart wie möglich'), ramp(600, .55, .4)], { test: 'ftp20' }),
];

export async function listWorkouts() {
  const own = (await db.all('workouts')).sort((a, b) => (b.created || '').localeCompare(a.created || ''));
  return [...BUILTIN_W, ...own];
}
export async function getWorkout(id) { if (!id) return null; return BUILTIN_W.find(w => w.id === id) || EXTRA_W.get(id) || await db.get('workouts', id); }
export const saveWorkout = w => db.put('workouts', w);
export const deleteWorkout = async id => { await tomb('deletedWorkouts', id); await db.del('workouts', id); };

export const total = w => w.segs.reduce((s, x) => s + x.dur, 0);
export function stats(w) {
  // IF und TSS über 30-s-gleitende Mittel (frei = 0,7)
  let t = 0, sum4 = 0, n = 0, buf = [], bs = 0;
  for (const g of w.segs) for (let s = 0; s < g.dur; s++) {
    const f = g.a == null ? .7 : g.a + (g.b - g.a) * (s / g.dur);
    buf.push(f); bs += f; if (buf.length > 30) bs -= buf.shift();
    if (buf.length === 30) { sum4 += (bs / 30) ** 4; n++; } t++;
  }
  const IF = n ? Math.pow(sum4 / n, .25) : .6;
  return { dur: t, IF, tss: Math.round(t * IF * IF / 36) };
}
export function at(w, t) {
  if (!w) return null;
  let acc = 0;
  for (let i = 0; i < w.segs.length; i++) {
    const g = w.segs[i];
    if (t < acc + g.dur) { const f = (t - acc) / g.dur; return { i, g, start: acc, left: acc + g.dur - t, target: g.a == null ? null : g.a + (g.b - g.a) * f, next: w.segs[i + 1] }; }
    acc += g.dur;
  }
  return { done: true, i: w.segs.length };
}

/* ---------- Import ---------- */
export function parseZwo(text, fname) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  const w = doc.getElementsByTagName('workout')[0];
  if (!w) throw new Error('Kein <workout>-Element gefunden');
  const segs = [];
  const num = (el, a, d) => { for (const k of [a, a.toLowerCase()]) { const v = el.getAttribute(k); if (v != null && v !== '') return parseFloat(v); } return d; };
  for (const el of w.children) {
    const t = el.tagName.toLowerCase(), dur = num(el, 'Duration', 0);
    const cad = num(el, 'Cadence', null);
    if (t === 'steadystate') { const p = num(el, 'Power', null) ?? (num(el, 'PowerLow', .5) + num(el, 'PowerHigh', .5)) / 2; segs.push({ dur, a: p, b: p, cad }); }
    else if (t === 'warmup' || t === 'cooldown' || t === 'ramp') segs.push({ dur, a: num(el, 'PowerLow', .5), b: num(el, 'PowerHigh', .5), cad });
    else if (t === 'intervalst') {
      const n = num(el, 'Repeat', 1), on = num(el, 'OnDuration', 60), off = num(el, 'OffDuration', 60);
      const pon = num(el, 'OnPower', null) ?? num(el, 'PowerOnHigh', null) ?? num(el, 'PowerOnLow', 1);
      const poff = num(el, 'OffPower', null) ?? num(el, 'PowerOffLow', null) ?? num(el, 'PowerOffHigh', .5);
      for (let k = 0; k < n; k++) { segs.push({ dur: on, a: pon, b: pon, cad: num(el, 'Cadence', null) }); segs.push({ dur: off, a: poff, b: poff, cad: num(el, 'CadenceResting', null) }); }
    }
    else if (t === 'freeride' || t === 'maxeffort') segs.push({ dur, a: null, b: null, text: t === 'maxeffort' ? 'Maximale Anstrengung' : undefined });
    const msg = el.getElementsByTagName('textevent')[0]; if (msg && segs.length) segs[segs.length - 1].text = msg.getAttribute('message');
  }
  if (!segs.length) throw new Error('Keine Abschnitte gefunden');
  const name = (doc.getElementsByTagName('name')[0]?.textContent || fname).trim().slice(0, 60);
  const desc = (doc.getElementsByTagName('description')[0]?.textContent || '').trim().slice(0, 300);
  return { id: 'u-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name, cat: 'Eigene', desc, segs, builtin: false, created: new Date().toISOString() };
}
export function parseErg(text, fname, ftpNow) {
  let ftp = ftpNow, pct = /MINUTES\s+PERCENT/i.test(text) || /\.mrc$/i.test(fname), inData = false, name = fname, desc = '';
  const pts = [];
  for (const l of text.split(/\r?\n/)) {
    const s = l.trim();
    if (/^FTP\s*=/i.test(s)) ftp = parseFloat(s.split('=')[1]) || ftp;
    if (/^(DESCRIPTION|FILE NAME)\s*=/i.test(s)) name = s.split('=')[1].trim() || name;
    if (/\[COURSE DATA\]/i.test(s)) { inData = true; continue; }
    if (/\[END COURSE DATA\]/i.test(s)) inData = false;
    if (inData) { const m = s.split(/\s+/).map(parseFloat); if (m.length >= 2 && !isNaN(m[0]) && !isNaN(m[1])) pts.push([m[0], m[1]]); }
  }
  if (pts.length < 2) throw new Error('Keine Kursdaten gefunden');
  const segs = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const dur = (pts[i + 1][0] - pts[i][0]) * 60; if (dur <= 0) continue;
    const f = v => pct ? v / 100 : v / ftp;
    segs.push({ dur: Math.round(dur), a: f(pts[i][1]), b: f(pts[i + 1][1]) });
  }
  return { id: 'u-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name: name.replace(/\.\w+$/, '').slice(0, 60), cat: 'Eigene', desc, segs, builtin: false, created: new Date().toISOString() };
}

/* ---------- Diagramm ---------- */
export function drawWorkout(canvas, w, opt = {}) {
  const { w: W_, h, d } = fitCanvas(canvas);
  const x = canvas.getContext('2d'); x.clearRect(0, 0, W_, h);
  if (!w) return;
  const T = total(w), mx = Math.max(1.6, ...w.segs.map(g => Math.max(g.a ?? 0, g.b ?? 0) + .1));
  let t = 0;
  for (const g of w.segs) {
    const x0 = t / T * W_, x1 = (t + g.dur) / T * W_, a = g.a ?? .32, b = g.b ?? .32;
    x.fillStyle = g.a == null ? '#56606a' : zoneColor((a + b) / 2);
    x.globalAlpha = opt.pos != null && t + g.dur < opt.pos ? .4 : 1;
    x.beginPath(); x.moveTo(x0, h); x.lineTo(x0, h - a / mx * h); x.lineTo(x1, h - b / mx * h); x.lineTo(x1, h); x.fill();
    t += g.dur;
  }
  x.globalAlpha = 1;
  if (opt.actual?.length) {
    x.strokeStyle = 'rgba(255,255,255,.95)'; x.lineWidth = 1.4 * d; x.beginPath();
    opt.actual.forEach((p, i) => { const px = p[0] / T * W_, py = h - Math.min(1, p[1] / opt.ftp / mx) * h; i ? x.lineTo(px, py) : x.moveTo(px, py); });
    x.stroke();
  }
  x.strokeStyle = 'rgba(255,255,255,.3)'; x.setLineDash([4 * d, 4 * d]); x.beginPath(); x.moveTo(0, h - h / mx); x.lineTo(W_, h - h / mx); x.stroke(); x.setLineDash([]);
  if (opt.pos != null) { const px = opt.pos / T * W_; x.fillStyle = '#fff'; x.fillRect(px - d, 0, 2 * d, h); }
}
