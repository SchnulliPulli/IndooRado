// Easter Eggs. Pssst.
import { progress, saveProgress } from './state.js';
import { toast } from './util.js';

export function unlockEgg(id, msg) {
  progress.eggs ||= {};
  if (progress.eggs[id]) return false;
  progress.eggs[id] = new Date().toISOString(); saveProgress();
  toast(msg, 5000); confetti();
  return true;
}
export const eggCount = () => Object.keys(progress.eggs || {}).length;

// Konfetti über dem ganzen Bildschirm
export function confetti(n = 120) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const c = document.createElement('canvas'); c.className = 'confetti'; document.body.appendChild(c);
  const d = devicePixelRatio || 1, w = c.width = innerWidth * d, h = c.height = innerHeight * d, x = c.getContext('2d');
  const cols = ['#ff6a3d', '#3fa7f5', '#4fd18b', '#f5c542', '#ff4fa3', '#b06cf0'];
  const P = Array.from({ length: n }, () => ({ x: Math.random() * w, y: -Math.random() * h * .5, vx: (Math.random() - .5) * 4 * d, vy: (2 + Math.random() * 4) * d, r: Math.random() * 6, vr: (Math.random() - .5) * .3, s: (5 + Math.random() * 6) * d, c: cols[Math.random() * cols.length | 0] }));
  const t0 = performance.now();
  const f = now => {
    x.clearRect(0, 0, w, h);
    for (const p of P) { p.x += p.vx; p.y += p.vy; p.vy += .05 * d; p.r += p.vr; x.save(); x.translate(p.x, p.y); x.rotate(p.r); x.fillStyle = p.c; x.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); x.restore(); }
    if (now - t0 < 3500) requestAnimationFrame(f); else c.remove();
  };
  requestAnimationFrame(f);
}

export function initEggs() {
  // 1) Konami-Code: ↑ ↑ ↓ ↓ ← → ← → B A
  const K = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a']; let i = 0;
  addEventListener('keydown', e => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    i = k === K[i] ? i + 1 : (k === K[0] ? 1 : 0);
    if (i === K.length) { i = 0; if (!unlockEgg('konami', '🦄 Einhorn freigeschaltet! Unter Einstellungen › Avatar › Extras.')) confetti(); }
  });
  // 2) Logo siebenmal schnell antippen
  let taps = [], logo = document.querySelector('.logo');
  logo?.addEventListener('click', e => {
    const now = Date.now(); taps = [...taps.filter(t => now - t < 2500), now];
    if (taps.length >= 7) { e.preventDefault(); taps = []; logo.classList.add('spin'); setTimeout(() => logo.classList.remove('spin'), 1200); unlockEgg('logo', '🌀 Du hast das Logo zum Rotieren gebracht. Hier gibt es noch mehr zu finden …') || toast(FACTS[Math.random() * FACTS.length | 0], 5000); }
  });
  // 3) Advent: im Dezember gibt es ein Rentiergeweih
  const d = new Date(); if (d.getMonth() === 11 && d.getDate() <= 26) setTimeout(() => unlockEgg('xmas', '🦌 Frohe Weihnachten! Rentiergeweih unter Einstellungen › Avatar › Extras.'), 4000);
}
const FACTS = [
  '🚲 Das erste Fahrrad (Laufmaschine) baute Karl Drais 1817 in Mannheim.',
  '⛰️ Höhe frisst Watt: auf 5000 m hat die Luft nur noch rund die Hälfte der Dichte.',
  '💨 Im Windschatten sparst du bis zu einem Drittel Kraft.',
  '🔁 Eine Kurbelumdrehung bei 90 U/min dauert genau zwei Drittel Sekunden.',
  '🧀 Ein Kilojoule am Pedal ist grob eine Kilokalorie im Körper, weil der Wirkungsgrad bei etwa 24 % liegt.',
];

// Während der Fahrt: besondere Momente (wird vom Fahrtbildschirm einmal pro Sekunde gefragt)
export function rideEggs(S, flash) {
  const e = S.eggSeen ||= {};
  if (!e.marathon && S.odo >= 42195) { e.marathon = true; flash('🏅 42,195 km: ein Marathon, nur schneller!', 3500); unlockEgg('marathon', '🏅 Marathon-Distanz geknackt!'); }
  if (!e.flux && S.v * 3.6 >= 88) { e.flux = true; flash('⚡ 88 km/h! Fluxkompensator geladen …', 3500); unlockEgg('flux', '⚡ 88 km/h erreicht'); }
  const h = new Date().getHours(); if (!e.night && h === 0 && S.t > 60) { e.night = true; flash('🌙 Mitternachtsfahrer!', 3000); unlockEgg('midnight', '🌙 Fahrt um Mitternacht'); }
  if (!e.top && S.route.id === 'b-himalaya' && S.route.eleAt(S.dist) > 5100) { e.top = true; flash('🏔️ Über 5100 m. Luft holen nicht vergessen!', 3500); unlockEgg('roof', '🏔️ Dach der Welt erreicht'); }
}
