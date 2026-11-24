// Auswertung: Kennwerte, Leistungskurve, Zonen, XP, Abzeichen, Fitnessverlauf
import { ZONES, HRZONES } from './util.js';

export const CURVE = [1, 5, 10, 30, 60, 120, 300, 600, 1200, 1800, 3600];
export const curveLabel = s => s < 60 ? s + ' s' : s < 3600 ? (s / 60) + ' min' : (s / 3600) + ' h';

export function bestAvg(arr, win) {
  if (arr.length < win) return null;
  let s = 0; for (let i = 0; i < win; i++) s += arr[i];
  let best = s;
  for (let i = win; i < arr.length; i++) { s += arr[i] - arr[i - win]; if (s > best) best = s; }
  return best / win;
}
export function normPower(p) {
  if (p.length < 30) return p.reduce((a, b) => a + b, 0) / (p.length || 1);
  let s = 0, n = 0, w = 0; for (let i = 0; i < 30; i++) w += p[i];
  for (let i = 30; i <= p.length; i++) { s += (w / 30) ** 4; n++; if (i < p.length) w += p[i] - p[i - 30]; }
  return Math.pow(s / n, .25);
}

export function summarize(samples, { ftp, kg, hrMax }) {
  const n = samples.length || 1;
  const P = samples.map(s => s.p), HR = samples.filter(s => s.hr).map(s => s.hr), CAD = samples.filter(s => s.cad > 0).map(s => s.cad);
  const sum = a => a.reduce((x, y) => x + y, 0);
  const avgP = sum(P) / n, np = normPower(P), IF = np / ftp;
  const dur = samples.length;
  const last = samples[samples.length - 1] || { d: 0 };
  let asc = 0; for (let i = 1; i < samples.length; i++) { const de = samples[i].e - samples[i - 1].e; if (de > 0 && de < 5) asc += de; }
  const curve = {}; for (const c of CURVE) { const b = bestAvg(P, c); if (b != null) curve[c] = Math.round(b); }
  const zones = ZONES.map(() => 0); for (const p of P) zones[ZONES.findIndex(z => p / ftp < z.max)]++;
  const hrz = HRZONES.map(() => 0); for (const h of HR) hrz[HRZONES.findIndex(z => h / (hrMax * .93) < z.max)]++;
  const kj = sum(P) / 1000;
  return {
    dur, dist: last.d, asc: Math.round(asc), avgP: Math.round(avgP), maxP: Math.max(0, ...P), np: Math.round(np), IF: +IF.toFixed(2),
    tss: Math.round(dur * np * IF / (ftp * 36)), kj: Math.round(kj), kcal: Math.round(kj / 0.24 / 4.184),
    avgHr: HR.length ? Math.round(sum(HR) / HR.length) : null, maxHr: HR.length ? Math.max(...HR) : null,
    avgCad: CAD.length ? Math.round(sum(CAD) / CAD.length) : null, maxCad: CAD.length ? Math.round(Math.max(...CAD)) : null,
    avgV: dur ? last.d / dur : 0, maxV: Math.max(0, ...samples.map(s => s.v)), wkg: +(avgP / kg).toFixed(2), npWkg: +(np / kg).toFixed(2),
    curve, zones, hrz, ftp, kg,
  };
}

// Intervalle eines Workouts auswerten
export function intervals(samples, w) {
  if (!w) return [];
  const out = []; let acc = 0;
  for (const g of w.segs) {
    const part = samples.filter(s => s.wt != null && s.wt >= acc && s.wt < acc + g.dur);
    if (part.length) {
      const hr = part.filter(s => s.hr);
      out.push({ dur: g.dur, a: g.a, b: g.b, text: g.text, avg: Math.round(part.reduce((x, s) => x + s.p, 0) / part.length), hr: hr.length ? Math.round(hr.reduce((x, s) => x + s.hr, 0) / hr.length) : null, done: part.length });
    }
    acc += g.dur;
  }
  return out;
}

export function xpFor(sum, extra = {}) {
  let xp = Math.round(sum.dist / 1000 * 20 + sum.dur / 60 * 2 + sum.asc * 0.5);
  if (extra.workoutDone) xp += 100;
  xp += (extra.climbs || 0) * 25 + (extra.prs || 0) * 15;
  return xp;
}

export const BADGES = [
  { id: 'first', name: 'Erste Fahrt', desc: 'Die erste Fahrt gespeichert', test: (s, t) => t.rides >= 1 },
  { id: 'r10', name: 'Stammgast', desc: '10 Fahrten', test: (s, t) => t.rides >= 10 },
  { id: 'r50', name: 'Unermüdlich', desc: '50 Fahrten', test: (s, t) => t.rides >= 50 },
  { id: 'h1', name: 'Eine Stunde', desc: 'Eine Fahrt über 60 Minuten', test: s => s.dur >= 3600 },
  { id: 'h2', name: 'Langer Atem', desc: 'Eine Fahrt über 2 Stunden', test: s => s.dur >= 7200 },
  { id: 'k50', name: 'Halbes Hundert', desc: '50 km in einer Fahrt', test: s => s.dist >= 50000 },
  { id: 'k100', name: 'Centurio', desc: '100 km in einer Fahrt', test: s => s.dist >= 100000 },
  { id: 'hm500', name: 'Kletterer', desc: '500 Höhenmeter in einer Fahrt', test: s => s.asc >= 500 },
  { id: 'hm1000', name: 'Bergziege', desc: '1000 Höhenmeter in einer Fahrt', test: s => s.asc >= 1000 },
  { id: 'tk500', name: '500 km gesamt', desc: 'Insgesamt 500 km gefahren', test: (s, t) => t.dist >= 500000 },
  { id: 'tk2000', name: '2000 km gesamt', desc: 'Insgesamt 2000 km gefahren', test: (s, t) => t.dist >= 2000000 },
  { id: 'wo', name: 'Plan erfüllt', desc: 'Ein Workout vollständig beendet', test: (s, t, x) => x.workoutDone },
  { id: 'test', name: 'Vermessen', desc: 'Einen FTP-Test absolviert', test: (s, t, x) => x.testDone },
  { id: 'wkg4', name: 'Kraftpaket', desc: '20 Minuten über 4 W/kg', test: s => (s.curve[1200] || 0) / s.kg >= 4 },
  { id: 'kj1000', name: 'Ofen an', desc: '1000 kJ in einer Fahrt', test: s => s.kj >= 1000 },
  { id: 'streak', name: 'Dranbleiben', desc: 'An 3 Tagen in Folge gefahren', test: (s, t) => t.streak >= 3 },
  { id: 'streak7', name: 'Eiserne Woche', desc: 'An 7 Tagen in Folge gefahren', test: (s, t) => t.streak >= 7 },
  { id: 'wo10', name: 'Trainingsweltmeister', desc: '10 Workouts vollständig beendet', test: (s, t) => t.workouts >= 10 },
  { id: 'plan1', name: 'Planerfüller', desc: 'Einen ganzen Trainingsplan abgeschlossen', test: (s, t, x) => x.planFinished },
  { id: 'gf', name: 'Gran Fondista', desc: 'Den Gran-Fondo-Plan abgeschlossen', test: (s, t, x) => x.planFinished === 'gf' },
  { id: 'pass50', name: 'Überholspur', desc: '50 Fahrer in einer Fahrt überholt', test: (s, t, x) => (x.overtakes || 0) >= 50 },
  { id: 'sprint', name: 'Sprinter', desc: 'Eine Sprintwertung gefahren', test: (s, t, x) => x.sprints > 0 },
  { id: 'mission', name: 'Auftrag erfüllt', desc: 'Alle drei Wochenmissionen geschafft', test: (s, t, x) => x.allMissions },
  { id: 'early', name: 'Frühaufsteher', desc: 'Eine Fahrt vor 7 Uhr begonnen', test: (s, t, x) => x.hour < 7 },
  { id: 'night', name: 'Nachteule', desc: 'Eine Fahrt nach 21 Uhr begonnen', test: (s, t, x) => x.hour >= 21 },
];

export function totals(rides) {
  const t = { rides: rides.length, dist: 0, dur: 0, asc: 0, kj: 0, streak: 0, workouts: 0 };
  const days = new Set();
  for (const r of rides) { if (r.workoutDone) t.workouts++; t.dist += r.sum.dist; t.dur += r.sum.dur; t.asc += r.sum.asc; t.kj += r.sum.kj; days.add(r.date.slice(0, 10)); }
  let st = 0, d = new Date(); d.setHours(12);
  if (!days.has(d.toISOString().slice(0, 10))) d.setDate(d.getDate() - 1);
  while (days.has(d.toISOString().slice(0, 10))) { st++; d.setDate(d.getDate() - 1); }
  t.streak = st;
  return t;
}

// Leistungs-Management: CTL (42 Tage), ATL (7 Tage), TSB
export function fitness(rides, days = 120) {
  const byDay = new Map();
  for (const r of rides) { const k = r.date.slice(0, 10); byDay.set(k, (byDay.get(k) || 0) + (r.sum.tss || 0)); }
  const first = rides.length ? new Date(Math.min(...rides.map(r => +new Date(r.date)))) : new Date();
  const start = new Date(Math.min(+first, Date.now() - days * 864e5)); start.setHours(12, 0, 0, 0);
  const out = []; let ctl = 0, atl = 0;
  for (let d = new Date(start); d <= new Date(); d.setDate(d.getDate() + 1)) {
    const k = d.toISOString().slice(0, 10), tss = byDay.get(k) || 0;
    const tsb = ctl - atl;
    ctl += (tss - ctl) / 42; atl += (tss - atl) / 7;
    out.push({ day: k, tss, ctl, atl, tsb });
  }
  return out.slice(-days);
}
export function bestCurve(rides, sinceDays) {
  const lim = sinceDays ? Date.now() - sinceDays * 864e5 : 0, best = {};
  for (const r of rides) if (+new Date(r.date) >= lim) for (const k in r.sum.curve) if (!best[k] || r.sum.curve[k] > best[k].w) best[k] = { w: r.sum.curve[k], id: r.id, date: r.date };
  return best;
}
