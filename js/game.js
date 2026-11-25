// Spielelemente: Wochenmissionen, Titel, Freischaltungen, Serien-Bonus
import { rng } from './util.js';

export function weekKey(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day); const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return t.getUTCFullYear() + '-W' + String(Math.ceil(((t - y) / 864e5 + 1) / 7)).padStart(2, '0');
}
export function weekStart(d = new Date()) { const m = new Date(d); m.setHours(0, 0, 0, 0); m.setDate(m.getDate() - ((m.getDay() + 6) % 7)); return m; }

// Pool möglicher Missionen. val(rides der Woche) -> Fortschritt
const POOL = [
  { id: 'km', icon: '🚴', make: r => { const g = [40, 60, 80, 100][r() * 4 | 0]; return { goal: g, text: `${g} km fahren`, xp: g * 2, val: rs => rs.reduce((s, x) => s + x.sum.dist, 0) / 1000 }; } },
  { id: 'min', icon: '⏱️', make: r => { const g = [90, 120, 180, 240][r() * 4 | 0]; return { goal: g, text: `${g} Minuten im Sattel`, xp: g, val: rs => rs.reduce((s, x) => s + x.sum.dur, 0) / 60 }; } },
  { id: 'hm', icon: '⛰️', make: r => { const g = [400, 700, 1000, 1500][r() * 4 | 0]; return { goal: g, text: `${g} Höhenmeter sammeln`, xp: Math.round(g / 4), val: rs => rs.reduce((s, x) => s + x.sum.asc, 0) }; } },
  { id: 'wo', icon: '📈', make: r => { const g = 2 + (r() * 2 | 0); return { goal: g, text: `${g} Workouts komplett fahren`, xp: g * 80, val: rs => rs.filter(x => x.workoutDone).length }; } },
  { id: 'days', icon: '📅', make: r => { const g = 3 + (r() * 2 | 0); return { goal: g, text: `An ${g} Tagen fahren`, xp: g * 50, val: rs => new Set(rs.map(x => x.date.slice(0, 10))).size }; } },
  { id: 'hard', icon: '🔥', make: r => { const g = [15, 20, 30][r() * 3 | 0]; return { goal: g, text: `${g} Minuten in Zone 4 oder höher`, xp: g * 6, val: rs => rs.reduce((s, x) => s + (x.sum.zones || []).slice(3).reduce((a, b) => a + b, 0), 0) / 60 }; } },
  { id: 'tss', icon: '💪', make: r => { const g = [150, 250, 350][r() * 3 | 0]; return { goal: g, text: `${g} TSS Trainingsbelastung`, xp: g, val: rs => rs.reduce((s, x) => s + x.sum.tss, 0) }; } },
  { id: 'pass', icon: '🏁', make: r => { const g = [25, 50, 100][r() * 3 | 0]; return { goal: g, text: `${g} Fahrer überholen`, xp: g * 2, val: rs => rs.reduce((s, x) => s + (x.overtakes || 0), 0) }; } },
];
export function missions(key = weekKey()) {
  const r = rng([...key].reduce((s, c) => s * 31 + c.charCodeAt(0), 7));
  const pool = [...POOL]; const out = [];
  while (out.length < 3) { const m = pool.splice(r() * pool.length | 0, 1)[0]; out.push({ id: m.id, icon: m.icon, ...m.make(r) }); }
  return out;
}
export function missionState(rides, key = weekKey()) {
  const s = +weekStart(), e = s + 7 * 864e5;
  const rs = rides.filter(x => +new Date(x.date) >= s && +new Date(x.date) < e);
  return missions(key).map(m => { const v = m.val(rs); return { ...m, v, frac: Math.min(1, v / m.goal), done: v >= m.goal }; });
}

// Titel je Level
const TITLES = [[1, 'Neuling'], [3, 'Freizeitfahrer'], [6, 'Hobbyrennfahrer'], [10, 'Kilometerfresser'], [15, 'Bergfloh'], [20, 'Ausreißer'], [26, 'Kapitän'], [33, 'Klassikerjäger'], [40, 'Legende']];
export const titleOf = lv => TITLES.filter(t => lv >= t[0]).at(-1)[1];
export const nextTitle = lv => TITLES.find(t => t[0] > lv) || null;

// Freischaltbare Farben für den Avatar
export const UNLOCKS = [
  { lv: 1, c: '#ff6a3d' }, { lv: 1, c: '#3fa7f5' }, { lv: 1, c: '#1b1e22' }, { lv: 1, c: '#f2f4f6' },
  { lv: 2, c: '#ef4458' }, { lv: 3, c: '#4fd18b' }, { lv: 4, c: '#f5c542' }, { lv: 5, c: '#7b4fd6' },
  { lv: 7, c: '#00c2c7' }, { lv: 9, c: '#ff4fa3' }, { lv: 12, c: '#c0c6cc', name: 'Silber' }, { lv: 16, c: '#d4af37', name: 'Gold' },
  { lv: 20, c: '#0b3d91', name: 'Nachtblau' }, { lv: 25, c: '#8a1538', name: 'Bordeaux' },
];

// Serien-Bonus: +10 % pro Tag am Stück, höchstens +50 %
export const streakBonus = streak => Math.min(.5, Math.max(0, streak - 1) * .1);
