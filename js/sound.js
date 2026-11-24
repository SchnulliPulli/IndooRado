// Ton: Fahrgeräusche, Umgebung und Effekte, komplett mit Web Audio erzeugt (keine Audiodateien)
import { profile } from './state.js';

let ctx = null, master, amb, fx, nodes = null;
const now = () => ctx.currentTime;

function noiseBuffer(type = 'white', sec = 2) {
  const n = ctx.sampleRate * sec, b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; if (type === 'brown') { last = (last + .02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w; }
  return b;
}
function loop(buf, filterType, freq, q = .7) {
  const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true;
  const f = ctx.createBiquadFilter(); f.type = filterType; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain(); g.gain.value = 0;
  s.connect(f).connect(g).connect(amb); s.start();
  return { s, f, g };
}

function build() {
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain(); master.connect(ctx.destination);
  amb = ctx.createGain(); amb.connect(master);
  fx = ctx.createGain(); fx.connect(master);
  const white = noiseBuffer('white'), brown = noiseBuffer('brown', 3);
  nodes = {
    wind: loop(white, 'lowpass', 400, .5),
    roll: loop(brown, 'lowpass', 250, .8),
    hum: loop(brown, 'bandpass', 120, 4),
    sea: loop(brown, 'lowpass', 700, .5),
    breeze: loop(white, 'bandpass', 1800, .4),
    chain: loop(white, 'bandpass', 2600, 3), // Kette läuft über die Ritzel
    tick: 0, bird: 0, stroke: 0,
  };
  apply();
}
// Muss einmal durch eine Nutzeraktion freigeschaltet werden (Browser-Regel)
export function unlock() {
  try { if (!ctx) build(); if (ctx.state === 'suspended') ctx.resume(); } catch (e) { }
}
['pointerdown', 'keydown'].forEach(ev => window.addEventListener(ev, unlock, { capture: true, passive: true }));

export function apply() {
  if (!ctx) return;
  const on = profile.soundOn !== false;
  master.gain.setTargetAtTime(on ? profile.volMaster ?? .7 : 0, now(), .05);
  amb.gain.setTargetAtTime(profile.volAmb ?? .6, now(), .05);
  fx.gain.setTargetAtTime(profile.volFx ?? .8, now(), .05);
}
export const muted = () => profile.soundOn === false;

/* ---------- Fahrgeräusche, alle 200 ms aufgerufen ---------- */
// st: { v (m/s), cad, power, theme, tunnel, riding, weather }
export function update(st) {
  if (!ctx || !nodes || ctx.state !== 'running') return;
  const t = now(), v = st.riding ? st.v : 0, k = Math.min(1, v / 14);
  const N = nodes, set = (p, val, tc = .25) => p.setTargetAtTime(val, t, tc);
  // Fahrtwind: lauter und heller mit dem Tempo, im Tunnel dumpfer und hallig
  // Fahrtwind: erst bei höherem Tempo hörbar, dumpf statt zischend
  set(N.wind.g.gain, Math.max(0, k - .25) ** 2 * .22 * (st.tunnel ? 1.5 : 1));
  set(N.wind.f.frequency, (st.tunnel ? 220 : 260) + k * 650);
  // Reifen auf Asphalt (bei Regen nasser, höher)
  set(N.roll.g.gain, k * (st.weather === 'rain' ? .36 : .3));
  set(N.roll.f.frequency, 180 + k * (st.weather === 'rain' ? 900 : 500));
  // Antrieb: Brummen mit der Trittfrequenz
  const cad = st.cad || 0;
  set(N.hum.g.gain, cad > 20 && st.riding ? Math.min(.12, .03 + st.power / 4000) : 0);
  set(N.hum.f.frequency, 60 + cad * 1.2);
  // Umgebung: Meer an der Küste, leichter Wind draußen, Regen
  set(N.sea.g.gain, st.theme === 'coast' && !st.tunnel ? .22 + .1 * Math.sin(t / 3) : 0, .8);
  // Regen nur als leises, gedämpftes Prasseln, kein Dauerrauschen
  set(N.breeze.g.gain, st.tunnel ? 0 : st.weather === 'rain' ? .05 : 0, .8);
  set(N.breeze.f.frequency, st.weather === 'rain' ? 2600 : 1500, .8);
  if (st.weather === 'rain' && !st.tunnel && Math.random() < .5) for (let i = 0; i < 3; i++) click(t + Math.random() * .2, .01 + Math.random() * .015);
  // Radeln: Kettensurren im Takt der Kurbel (zwei Druckphasen pro Umdrehung) und ein leises Knarzen am Totpunkt
  const pedaling = st.riding && cad > 20;
  set(N.chain.f.frequency, 1800 + cad * 12 + k * 800);
  if (!pedaling) { if (N.stroke) N.chain.g.gain.cancelScheduledValues(t); set(N.chain.g.gain, 0, .15); N.stroke = 0; }
  else {
    // kurze Impulse je Tritt, dazwischen fast still (kein Dauerrauschen)
    const per = 60 / cad / 2, base = .008 + Math.min(.02, st.power / 20000);
    if (N.stroke < t) N.stroke = t + .02;
    while (N.stroke < t + .35) {
      const s = N.stroke, g = N.chain.g.gain;
      g.setTargetAtTime(base * 2, s, per * .1); g.setTargetAtTime(base * .08, s + per * .3, per * .15);
      if (Math.random() < .5) click(s + per * .5, .018 + Math.random() * .012);
      N.stroke += per;
    }
  }
  // Freilauf-Knattern, wenn gerollt und nicht getreten wird
  if (v > 2 && cad < 10 && t > N.tick) { for (let i = 0; i < 6; i++) click(t + i * (.9 / (v * 2)), .05); N.tick = t + .8; }
  // Vögel auf dem Land, nicht im Tunnel, nicht nachts oder bei Regen
  if (!st.tunnel && st.weather !== 'rain' && !st.night && ['meadow', 'forest', 'lake', 'alpine', 'plains'].includes(st.theme) && t > N.bird) { bird(t); N.bird = t + 2 + Math.random() * 6; }
}

/* ---------- Effekte ---------- */
function tone(freq, start, dur, { type = 'sine', vol = .3, slide = 0, attack = .005 } = {}) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, start); if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, start + dur);
  g.gain.setValueAtTime(0, start); g.gain.linearRampToValueAtTime(vol, start + attack); g.gain.exponentialRampToValueAtTime(.0001, start + dur);
  o.connect(g).connect(fx); o.start(start); o.stop(start + dur + .05);
}
function click(start, vol = .08) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuffer('white', .02);
  const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 3000;
  const g = ctx.createGain(); g.gain.value = vol; s.connect(f).connect(g).connect(amb); s.start(start);
}
function bird(t) {
  const base = 2200 + Math.random() * 1800, n = 2 + (Math.random() * 4 | 0);
  for (let i = 0; i < n; i++) { const o = ctx.createOscillator(), g = ctx.createGain(), s = t + i * .13; o.frequency.setValueAtTime(base, s); o.frequency.exponentialRampToValueAtTime(base * (1.3 + Math.random() * .4), s + .07); g.gain.setValueAtTime(0, s); g.gain.linearRampToValueAtTime(.025, s + .01); g.gain.exponentialRampToValueAtTime(.0001, s + .09); o.connect(g).connect(amb); o.start(s); o.stop(s + .12); }
}
const ok = () => ctx && ctx.state === 'running' && !muted();
export const sound = {
  unlock, apply, update,
  shift(up) { if (!ok()) return; click(now(), .25); tone(up ? 900 : 700, now(), .04, { type: 'square', vol: .04 }); },
  beep(last = false) { if (!ok()) return; tone(last ? 1320 : 880, now(), last ? .35 : .12, { type: 'triangle', vol: .3 }); },
  gate() { if (!ok()) return; const t = now(); [784, 1047, 1319].forEach((f, i) => tone(f, t + i * .07, .4, { type: 'triangle', vol: .22 })); },
  fanfare() { if (!ok()) return; const t = now(); [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, t + i * .11, i === 5 ? .7 : .2, { type: 'sawtooth', vol: .1 })); [523, 659, 784].forEach(f => tone(f, t + .55, .9, { type: 'triangle', vol: .12 })); },
  levelUp() { if (!ok()) return; const t = now(); [392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, t + i * .09, .5, { type: 'triangle', vol: .2 })); },
  pass() { if (!ok()) return; tone(1400, now(), .08, { vol: .08, slide: 1.4 }); },
  warn() { if (!ok()) return; const t = now(); tone(440, t, .18, { type: 'square', vol: .08 }); tone(330, t + .2, .25, { type: 'square', vol: .08 }); },
  whoosh() { if (!ok()) return; const s = ctx.createBufferSource(); s.buffer = noiseBuffer('white', .8); const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.5; f.frequency.setValueAtTime(300, now()); f.frequency.exponentialRampToValueAtTime(3000, now() + .6); const g = ctx.createGain(); g.gain.setValueAtTime(.0001, now()); g.gain.exponentialRampToValueAtTime(.4, now() + .25); g.gain.exponentialRampToValueAtTime(.0001, now() + .75); s.connect(f).connect(g).connect(fx); s.start(); },
  silence() { if (!ctx || !nodes) return; for (const k of ['wind', 'roll', 'hum', 'sea', 'breeze', 'chain']) { nodes[k].g.gain.cancelScheduledValues(now()); nodes[k].g.gain.setTargetAtTime(0, now(), .2); } nodes.stroke = 0; },
  toggle() { profile.soundOn = profile.soundOn === false; apply(); return !muted(); },
};
