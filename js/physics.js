// Fahrphysik: Rollwiderstand, Hangabtrieb, Luftwiderstand, virtuelle Gänge
import { profile } from './state.js';
export const G = 9.81, RHO = 1.225, CRR = 0.004, ETA = 0.97;

// 24 virtuelle Gänge, Übersetzung Kettenblatt/Ritzel von 34/34 bis 53/11
export const GEARS = Array.from({ length: 24 }, (_, i) => +(1.0 * Math.pow(4.82 / 1.0, i / 23)).toFixed(2));
export const mass = () => profile.kg + profile.bike + 1.5;

export function resist(v, gradePct, draft = 0) {
  const th = Math.atan(gradePct / 100), m = mass();
  return m * G * (CRR * Math.cos(th) + Math.sin(th)) + 0.5 * RHO * profile.cda * (1 - draft) * v * v;
}
// Leistung, die bei gegebener Trittfrequenz, Gang und Steigung auf der Straße nötig wäre
export function gearPower(cad, gear, gradePct) {
  if (!cad || cad < 15) return 0;
  const v = cad / 60 * GEARS[gear] * profile.circ / 1000;
  return Math.max(0, resist(v, gradePct) * v / ETA);
}
export const gearSpeed = (cad, gear) => (cad || 0) / 60 * GEARS[gear] * profile.circ / 1000;

// Geschwindigkeit integrieren (mit Trägheit)
export function integrate(v, power, gradePct, dt, draft = 0) {
  const m = mass() * 1.04;
  const vv = Math.max(v, 0.6);
  const a = (power * ETA / vv - resist(v, gradePct, draft)) / m;
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
