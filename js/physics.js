// Fahrphysik: Rollwiderstand, Hangabtrieb, Luftwiderstand, virtuelle Gänge
import { profile } from './state.js';
export const G = 9.81, RHO = 1.225, CRR = 0.004, ETA = 0.97;

// 24 virtuelle Gänge, Übersetzung Kettenblatt/Ritzel von 34/34 bis 53/11
// Schaltbereiche: Anzahl Gänge, kleinste und größte Übersetzung (Kettenblatt/Ritzel)
export const GEAR_RANGES = {
  road: { n: 24, lo: 1.0, hi: 4.82, l: 'Rennrad: 24 Gänge (34/34 bis 53/11)' },
  strong: { n: 30, lo: .9, hi: 6.2, l: 'Stark: 30 Gänge, deutlich mehr Widerstand oben' },
  pro: { n: 34, lo: .85, hi: 8, l: 'Sprinter: 34 Gänge, sehr großer Widerstand für hohe Wattzahlen' },
};
export const GEARS = [];
export function setGears(key = profile.gearRange) {
  const R = GEAR_RANGES[key] || GEAR_RANGES.strong;
  GEARS.length = 0; for (let i = 0; i < R.n; i++) GEARS.push(+(R.lo * Math.pow(R.hi / R.lo, i / (R.n - 1))).toFixed(2));
  return GEARS;
}
setGears('strong');
// Bergab: Mindest-Steigung für das Trittgefühl (sonst tritt man bei Abfahrten ins Leere); die Geschwindigkeit folgt weiter der echten Steigung
export const gearGrade = g => { const m = profile.gearDownhill ?? -1; return m === 'real' ? g : Math.max(g, +m); };
export const mass = (u = null) => profile.kg + profile.bike + 1.5 + (u?.kg || 0);
// Rad-Upgrades aus der Werkstatt: wirken nur auf die eigene Fahrt (gesetzt beim Fahrtstart, im Multiplayer neutral)
export const upg = { cda: 1, crr: 1, kg: 0 };
export const setUpgrades = e => Object.assign(upg, e || { cda: 1, crr: 1, kg: 0 });

// Je Strecke: Belag (Rollwiderstand) und Schwerkraft (Mond!). Wird beim Fahrtstart gesetzt.
export const env = { g: G, crr: CRR, wind: 0 }; // wind: Gegenwind-Anteil in m/s (negativ = Rückenwind)
const CRR_OF = { asphalt: .004, gravel: .0075, dirt: .009, trail: .013, moon: .012, cosmic: .004, sand: .011, candy: .006, rainbow: .0045 };
export function setSurface(R) { env.crr = CRR_OF[R?.surface] ?? CRR; env.g = R?.theme?.gravity ?? G; env.wind = 0; }
export function resist(v, gradePct, draft = 0, u = null) {
  const th = Math.atan(gradePct / 100), m = mass(u);
  const va = v + (env.wind || 0); // Fahrtwind plus Gegenwind
  return m * env.g * (env.crr * (u?.crr || 1) * Math.cos(th) + Math.sin(th)) + 0.5 * RHO * profile.cda * (u?.cda || 1) * (1 - draft) * va * Math.abs(va);
}
// Leistung, die bei gegebener Trittfrequenz, Gang und Steigung auf der Straße nötig wäre
export function gearPower(cad, gear, gradePct) {
  if (!cad || cad < 15) return 0;
  const v = cad / 60 * GEARS[gear] * profile.circ / 1000;
  return Math.max(0, resist(v, gradePct, 0, upg) * v / ETA);
}
export const gearSpeed = (cad, gear) => (cad || 0) / 60 * GEARS[gear] * profile.circ / 1000;

// Geschwindigkeit integrieren (mit Trägheit)
export function integrate(v, power, gradePct, dt, draft = 0) {
  const m = mass(upg) * 1.04;
  const vv = Math.max(v, 0.6);
  const a = (power * ETA / vv - resist(v, gradePct, draft, upg)) / m;
  let nv = v + a * dt;
  if (power < 5 && nv < 0.3 && gradePct >= 0) nv = 0;
  return Math.min(Math.max(nv, 0), 30);
}
// Stationäre Geschwindigkeit für eine Leistung (für Schrittmacher)
export function steadySpeed(power, gradePct, draft = 0) {
  let lo = 0, hi = 30;
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (resist(m, gradePct, draft) * m / ETA > power) hi = m; else lo = m; }
  return (lo + hi) / 2;
}
