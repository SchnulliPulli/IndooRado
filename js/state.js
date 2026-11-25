// Zentraler Zustand: Profil, Einstellungen, Auswahl, Live-Messwerte
import { kv } from './db.js';
import { bus } from './util.js';

export const profile = {
  name: 'Fahrer', ftp: 200, kg: 75, age: 40, sex: 'm', bike: 8.5, cda: 0.32, circ: 2105, maxW: 600, hrMax: 190, hrRest: 55,
  simDiff: 60, gearDiff: 100, jersey: '#ff6a3d', bikeColor: '#e9eef2', helmet: '#f2f4f6', skin: '#e3b18c',
  quality: 'auto', autoPause: true, autoShots: true, shotEvery: 10, units: 'metric', ftpHistory: [],
  soundOn: true, volMaster: .7, volAmb: .6, volFx: .8, tips: true, drinkTips: true, tripleSkip: true, ergSoft: true, hudStyle: 'dark',
};
export const sel = { routeId: 'b-hills', workoutId: null, mode: 'gear', ergW: 150, pacer: 0, adaptive: true, npcs: true, ghost: true, hrTarget: 140 };
export const progress = { xp: 0, badges: {}, climbBest: {}, routeBest: {}, sprintBest: {}, missions: {}, pb: {} };

export async function loadState() {
  try { await (await import('./store.js')).migrate(); } catch (e) { console.error(e); }
  Object.assign(profile, await kv.get('profile', {}));
  Object.assign(sel, await kv.get('sel', {}));
  Object.assign(progress, await kv.get('progress', {}));
}
export const saveProfile = () => { kv.set('profile', { ...profile }); bus.emit('profile'); };
export const saveSel = () => { kv.set('sel', { ...sel }); bus.emit('sel'); };
export const saveProgress = () => kv.set('progress', JSON.parse(JSON.stringify(progress)));

// Live-Messwerte der Geräte
export const live = {
  power: 0, powerT: 0, cadTrainer: null, cadSensor: null, cadT: 0, hr: null, hrT: 0, speedTrainer: null,
  get fresh() { return performance.now() - this.powerT < 3000; },
  get cadence() {
    const now = performance.now();
    if (this.cadSensor != null && now - this.cadT < 4000) return this.cadSensor;
    if (this.cadTrainer != null && now - this.powerT < 4000) return this.cadTrainer;
    return null;
  },
  get heart() { return performance.now() - this.hrT < 5000 ? this.hr : null; },
};

// Level-System
export const levelXp = n => Math.round(300 * n + 45 * n * n);
export function levelOf(xp) {
  let lv = 1; while (xp >= levelXp(lv)) lv++;
  const lo = lv === 1 ? 0 : levelXp(lv - 1), hi = levelXp(lv);
  return { lv, lo, hi, frac: (xp - lo) / (hi - lo) };
}
