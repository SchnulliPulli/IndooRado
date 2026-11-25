// Trainingspläne: mehrwöchige Folgen von Workouts, Fortschritt im Browser (kv 'plan')
import { WB, EXTRA_W, stats } from './workouts.js';
import { kv } from './db.js';
import { bus } from './util.js';

const { ss, ramp, free, rep } = WB;
const warm = (min = 10, top = .7) => [ramp(min * 60, .45, top, 'Einrollen')];
const cool = (min = 6) => [ramp(min * 60, .6, .4, 'Ausrollen')];
const cad = (seg, c) => ({ ...seg, cad: c });

// Bausteine, alle Ziele relativ zur FTP (passen sich also immer an)
const B = {
  endurance: (min, k = .66) => [...warm(8, .62), ...rep(Math.max(1, Math.round((min - 14) / 15)), ss(780, k), cad(ss(120, k + .06, 'Kadenz 100+'), 100)), ...cool()],
  longRide: (min) => [...warm(10, .62), ...Array.from({ length: Math.max(1, Math.round((min - 16) / 20)) }, (_, i) => [ss(960, .68), cad(ss(180, .78, i % 2 ? 'Anziehen, Kadenz 65' : 'Anziehen, Kadenz 100'), i % 2 ? 65 : 100), ss(60, .6)]).flat(), ...cool()],
  // Tempo abwechselnd mit niedriger und normaler Kadenz
  tempo: (n, len) => [...warm(10, .72), ...Array.from({ length: n }, (_, i) => [cad(ss(len * 60, .82, i % 2 ? 'Tempo, Kadenz 70' : 'Tempo, Kadenz 90'), i % 2 ? 70 : 90), ss(180, .55)]).flat(), ...cool()],
  // Sweet Spot: Blöcke mit 90, 70 und 100 U/min für Kraft und Trittökonomie
  sweet: (n, len) => [...warm(10, .75), cad(ss(60, .95, 'Öffner, Kadenz 100'), 100), ss(120, .55), ...Array.from({ length: n }, (_, i) => { const c = [90, 70, 100][i % 3]; return [cad(ss(len * 60, .9, `Sweet Spot, Kadenz ${c}`), c), ss(240, .55)]; }).flat(), ...cool()],
  thr: (n, len) => [...warm(12, .78), ...rep(n, cad(ss(len * 60, .98, 'An der Schwelle, Kadenz 95'), 95), ss(300, .55)), ...cool()],
  overUnder: (n, sets) => [...warm(12, .78), ...rep(sets, ...rep(n, cad(ss(120, .92, 'Unter, Kadenz 90'), 90), cad(ss(60, 1.07, 'Über, Kadenz 100'), 100)), ss(300, .55)), ...cool()],
  vo2: (n, len, k = 1.15) => [...warm(12, .75), cad(ss(60, 1, 'Öffner'), 100), ss(120, .5), ...rep(n, cad(ss(len, k, 'VO2max, Kadenz 100+'), 102), ss(len, .5)), ...cool()],
  micro: (sets, k = 1.25) => [...warm(10, .75), ...rep(sets, ...rep(8, cad(ss(30, k, 'Hart, Kadenz 105'), 105), ss(30, .5)), ss(240, .55)), ...cool()],
  climb: (n, len) => [...warm(10, .75), ...rep(n, cad(ss(len * 60, .88, 'Bergauf, Kadenz 65'), 65), ss(240, .55)), ...cool()],
  cadence: () => [...warm(8, .62), ...rep(6, cad(ss(60, .65, 'Kadenz 105'), 105), ss(60, .62), cad(ss(30, .7, 'Kadenz 115'), 115), ss(90, .6)), ss(600, .7), ...cool()],
  recovery: (min = 35) => [ramp(300, .4, .55), ss((min - 10) * 60, .52, 'Ganz locker'), ramp(300, .52, .4)],
  sprint: (n) => [...warm(12, .75), ...rep(n, free(12, 'Sprint! Alles geben'), ss(228, .5)), ss(600, .7), ...cool()],
  gfSim: (min) => [...warm(10, .65), ...rep(Math.max(1, Math.round((min - 16) / 30)), ss(900, .7), cad(ss(480, .88, 'Anstieg'), 75), ss(420, .66), ss(120, .5, 'Abfahrt, erholen')), ...cool()],
  ftpTest: () => [...warm(10, .75), ...rep(3, ss(60, 1.1), ss(60, .5)), ss(300, 1.05, 'Vorbelastung'), ss(600, .5), free(1200, '20 Minuten so hart wie möglich'), ...cool(10)],
};

// Wochen: Liste von [Name, Segmente, Tag-Hinweis]
const PLAN_DEF = [
  {
    id: 'gf', name: 'Gran Fondo', level: 'Fortgeschritten', color: '#ff6a3d', weeks: 8, perWeek: 4,
    desc: 'Acht Wochen Vorbereitung auf eine lange Radmarathon-Ausfahrt: viel Grundlage, Sweet Spot für die Anstiege und lange Wochenendfahrten bis zur Simulation am Ende.',
    make: w => {
      const easy = w === 4 || w === 8;
      const long = [90, 105, 120, 75, 135, 150, 165, 90][w - 1];
      return [
        ['Grundlage', B.endurance(easy ? 45 : 60 + w * 3)],
        easy ? ['Kadenz-Drills', B.cadence()] : ['Sweet Spot', B.sweet(Math.min(4, 2 + Math.floor(w / 3)), 8 + w)],
        easy ? ['Erholung', B.recovery(40)] : w % 2 ? ['Tempo', B.tempo(3, 8 + w)] : ['Bergauf', B.climb(3 + Math.floor(w / 3), 6 + w)],
        w === 8 ? ['Gran-Fondo-Simulation', B.gfSim(150)] : ['Lange Ausfahrt', B.longRide(long)],
      ];
    },
  },
  {
    id: 'ftp', name: 'FTP-Booster', level: 'Mittel', color: '#f5c542', weeks: 6, perWeek: 3,
    desc: 'Sechs Wochen für eine höhere Schwelle. Startet und endet mit einem FTP-Test, die Ziele wachsen mit deiner neuen FTP.',
    make: w => w === 1 ? [['FTP-Test', B.ftpTest()], ['Grundlage', B.endurance(50)], ['Sweet Spot', B.sweet(3, 10)]]
      : w === 6 ? [['Lockern', B.recovery(40)], ['Öffner', B.vo2(3, 120, 1.1)], ['FTP-Test', B.ftpTest()]]
        : [['Sweet Spot', B.sweet(w < 4 ? 3 : 2, w < 4 ? 10 + w * 2 : 20)], ['Over-Under', B.overUnder(3, w < 4 ? 2 : 3)], w === 4 ? ['Erholung', B.recovery(45)] : ['Schwelle', B.thr(2, 10 + w * 2)]],
  },
  {
    id: 'climb', name: 'Bergziege', level: 'Mittel', color: '#4fd18b', weeks: 6, perWeek: 3,
    desc: 'Kraft am Berg: niedrige Kadenz, lange Anstiege bei Sweet Spot und Über-Unter-Wechsel wie bei Attacken.',
    make: w => [['Kraftausdauer', B.climb(3 + Math.floor(w / 2), 6 + w)], w === 3 || w === 6 ? ['Erholung', B.recovery(40)] : ['Over-Under', B.overUnder(3, 2 + (w > 3 ? 1 : 0))], ['Lange Anstiege', B.sweet(2, 12 + w * 2)]],
  },
  {
    id: 'vo2', name: 'Kurz und hart', level: 'Fortgeschritten', color: '#ef4458', weeks: 4, perWeek: 3,
    desc: 'Vier Wochen mit wenig Zeit, aber hoher Intensität. Jede Einheit dauert höchstens eine Stunde.',
    make: w => [['VO2max', B.vo2(4 + w, 180, 1.12 + w * .01)], ['30/30', B.micro(w < 3 ? 2 : 3)], w === 4 ? ['Sprints', B.sprint(8)] : ['Schwelle', B.thr(2, 8 + w * 2)]],
  },
  {
    id: 'base', name: 'Wiedereinstieg', level: 'Einsteiger', color: '#3fa7f5', weeks: 4, perWeek: 3,
    desc: 'Locker wieder anfangen: vier Wochen Grundlage, Kadenzgefühl und erste kurze Tempoblöcke.',
    make: w => [['Grundlage', B.endurance(35 + w * 5, .62)], w % 2 ? ['Kadenz', B.cadence()] : ['Tempo', B.tempo(2, 5 + w)], ['Lange Grundlage', B.longRide(45 + w * 10)]],
  },
];

export const PLANS = PLAN_DEF.map(p => {
  const weeks = [];
  for (let w = 1; w <= p.weeks; w++) weeks.push(p.make(w).map(([name, segs], i) => {
    const id = `p-${p.id}-${w}-${i + 1}`;
    const wo = { id, name: `${name}`, cat: 'Plan: ' + p.name, desc: `${p.name}, Woche ${w}, Einheit ${i + 1} von ${p.perWeek}.`, segs, builtin: true, planId: p.id, week: w, n: i + 1, test: /FTP-Test/.test(name) ? 'ftp20' : undefined };
    EXTRA_W.set(id, wo);
    return wo;
  }));
  const all = weeks.flat();
  const tss = all.reduce((s, w) => s + stats(w).tss, 0), dur = all.reduce((s, w) => s + stats(w).dur, 0);
  return { id: p.id, name: p.name, level: p.level, color: p.color, desc: p.desc, weeks, perWeek: p.perWeek, all, tss, dur };
});
// Eigene Pläne aus importierten .zwo-Dateien: { id, name, perWeek, created, wos: [{ name, desc, segs }] }
export const CUSTOM = [];
function registerCustom(c) {
  const weeks = [];
  // Wochenaufteilung: feste Anzahl pro Woche oder (Plan-Editor) eigene Anzahl je Woche
  const pos = []; if (c.weeksLayout) c.weeksLayout.forEach((cnt, wi) => { for (let n = 1; n <= cnt; n++) pos.push([wi + 1, n]); });
  c.wos.forEach((w, k) => {
    const [wk, n] = pos[k] || [Math.floor(k / c.perWeek) + 1, k % c.perWeek + 1], id = `p-${c.id}-${wk}-${n}`;
    const wo = { id, name: w.name, cat: 'Plan: ' + c.name, desc: w.desc || `${c.name}, Woche ${wk}, Einheit ${n}.`, segs: w.segs, builtin: true, planId: c.id, week: wk, n };
    EXTRA_W.set(id, wo); (weeks[wk - 1] = weeks[wk - 1] || []).push(wo);
  });
  const all = weeks.flat();
  return { id: c.id, name: c.name, level: 'Eigener Plan', color: '#b06cf0', desc: `${all.length} importierte Workouts, ${c.perWeek} pro Woche.`, weeks, perWeek: c.perWeek, all, custom: true,
    tss: all.reduce((s, w) => s + stats(w).tss, 0), dur: all.reduce((s, w) => s + stats(w).dur, 0) };
}
export async function addCustomPlan(name, perWeek, wos) {
  const list = await kv.get('customPlans', []);
  const c = { id: 'cp' + Date.now().toString(36), name: name || 'Eigener Plan', perWeek: Math.max(1, perWeek | 0), created: new Date().toISOString(), wos: wos.map(w => ({ name: w.name, desc: w.desc, segs: w.segs })) };
  list.push(c); await kv.set('customPlans', list); CUSTOM.push(registerCustom(c)); return c.id;
}
// Eigenen Plan neu anlegen oder überschreiben (Plan-Editor)
export async function saveCustomPlan(c) {
  const list = await kv.get('customPlans', []), i = list.findIndex(x => x.id === c.id);
  const rec = { id: c.id || 'cp' + Date.now().toString(36), name: c.name || 'Eigener Plan', perWeek: Math.max(1, c.perWeek | 0), created: c.created || new Date().toISOString(), wos: c.wos.map(w => ({ name: w.name, desc: w.desc, segs: w.segs, src: w.src })), weeksLayout: c.weeksLayout };
  if (i >= 0) list[i] = rec; else list.push(rec);
  await kv.set('customPlans', list);
  const j = CUSTOM.findIndex(p => p.id === rec.id), reg = registerCustom(rec);
  if (j >= 0) CUSTOM[j] = reg; else CUSTOM.push(reg);
  return rec.id;
}
export const customRecord = async id => (await kv.get('customPlans', [])).find(c => c.id === id);
export async function deleteCustomPlan(id) {
  await kv.set('customPlans', (await kv.get('customPlans', [])).filter(c => c.id !== id));
  const i = CUSTOM.findIndex(p => p.id === id); if (i >= 0) CUSTOM.splice(i, 1);
  if (plan.active?.id === id) stopPlan();
}
export const getPlan = id => PLANS.find(p => p.id === id) || CUSTOM.find(p => p.id === id);

// Aktiver Plan: { id, start, done: { workoutId: { rideId, date, skipped? } } }
export const plan = { active: null };
export async function loadPlan() {
  CUSTOM.length = 0; for (const c of await kv.get('customPlans', [])) CUSTOM.push(registerCustom(c));
  plan.active = await kv.get('plan', null);
  if (plan.active && !getPlan(plan.active.id)) plan.active = null;
}
const savePlan = () => { kv.set('plan', plan.active ? JSON.parse(JSON.stringify(plan.active)) : null); bus.emit('plan'); };

export function startPlan(id) { plan.active = { id, start: new Date().toISOString(), done: {} }; savePlan(); }
export function stopPlan() {
  if (plan.active) kv.get('planHistory', []).then(h => kv.set('planHistory', [...h, { ...plan.active, end: new Date().toISOString() }]));
  plan.active = null; savePlan();
}
export function nextWorkout() {
  const p = plan.active && getPlan(plan.active.id); if (!p) return null;
  return p.all.find(w => !plan.active.done[w.id]) || null;
}
export function planProgress() {
  const p = plan.active && getPlan(plan.active.id); if (!p) return null;
  const done = p.all.filter(w => plan.active.done[w.id]).length;
  const nx = nextWorkout();
  return { p, done, total: p.all.length, frac: done / p.all.length, next: nx, week: nx ? nx.week : p.weeks.length, finished: !nx };
}
export function markDone(woId, info) {
  if (!plan.active || !woId?.startsWith('p-' + plan.active.id + '-')) return null;
  const first = !plan.active.done[woId];
  plan.active.done[woId] = { ...info, date: new Date().toISOString() };
  savePlan();
  const pr = planProgress();
  return { first, finished: pr.finished, plan: pr.p };
}
export function skip(woId) { if (plan.active) { plan.active.done[woId] = { skipped: true, date: new Date().toISOString() }; savePlan(); } }
export function unskip(woId) { if (plan.active) { delete plan.active.done[woId]; savePlan(); } }
