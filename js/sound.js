// Ton: Fahrgeräusche, Umgebung, Effekte und Musik, komplett mit Web Audio erzeugt (eigene Musikdateien optional)
// Jedes Geräusch hat einen eigenen Regler (profile.snd[key], 0..1.5), relativ zu Gesamt-, Umgebungs- und Effektlautstärke.
import { profile } from './state.js';
import { kv } from './db.js';

let ctx = null, master, amb, fx, mus, nodes = null;
const now = () => ctx.currentTime;
const V = k => profile.snd?.[k] ?? 1; // Einzelregler

// Alle einzeln regelbaren Geräusche (für die Einstellungen)
export const SOUNDS = {
  amb: [['wind', 'Fahrtwind'], ['roll', 'Reifen auf Asphalt'], ['chain', 'Kette und Kurbel'], ['hum', 'Antrieb, Brummen'], ['free', 'Freilauf-Klicken'], ['birds', 'Vögel'], ['sea', 'Meer und Wellen'], ['rain', 'Regen']],
  fx: [['shift', 'Schalten'], ['beep', 'Countdown 3-2-1'], ['gate', 'Zieltor'], ['fanfare', 'Fanfaren: Gipfel, Sprint, Ziel'], ['levelup', 'Level-up'], ['pass', 'Überholen, Ride On'], ['warn', 'Warnungen'], ['whoosh', 'Beamen, Überspringen']],
};
export const MUSIC = { off: 'Aus', chill: 'Chill (ruhig, 84 BPM)', drive: 'Drive (treibend, 124 BPM)', synth: 'Synthwave (100 BPM)', own: 'Eigene Musikdateien' };

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
let NB = null; // kurze Rauschpuffer, einmal erzeugt
function build() {
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain(); master.connect(ctx.destination);
  amb = ctx.createGain(); amb.connect(master);
  fx = ctx.createGain(); fx.connect(master);
  mus = ctx.createGain(); mus.connect(master);
  const white = noiseBuffer('white'), brown = noiseBuffer('brown', 3);
  NB = { click: noiseBuffer('white', .02), hat: noiseBuffer('white', .08), snare: noiseBuffer('white', .25), whoosh: noiseBuffer('white', .8) };
  nodes = {
    wind: loop(white, 'lowpass', 400, .5), roll: loop(brown, 'lowpass', 250, .8), hum: loop(brown, 'bandpass', 120, 4),
    sea: loop(brown, 'lowpass', 700, .5), breeze: loop(white, 'bandpass', 1800, .4), chain: loop(white, 'bandpass', 2600, 3),
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
  mus.gain.setTargetAtTime((profile.volMusic ?? .35) * (M.duck ? .35 : 1), now(), .3);
  if (M.audio) M.audio.volume = 1;
}
export const muted = () => profile.soundOn === false;

/* ---------- Fahrgeräusche, alle 200 ms aufgerufen ---------- */
// st: { v (m/s), cad, power, ftp, theme, tunnel, riding, weather, night }
export function update(st) {
  if (!ctx || !nodes || ctx.state !== 'running') return;
  const t = now(), v = st.riding ? st.v : 0, k = Math.min(1, v / 14);
  const N = nodes, set = (p, val, tc = .25) => p.setTargetAtTime(val, t, tc);
  // Fahrtwind: erst bei höherem Tempo hörbar, dumpf statt zischend
  set(N.wind.g.gain, Math.max(0, k - .25) ** 2 * .22 * (st.tunnel ? 1.5 : 1) * V('wind'));
  set(N.wind.f.frequency, (st.tunnel ? 220 : 260) + k * 650);
  // Reifen auf Asphalt (bei Regen nasser)
  set(N.roll.g.gain, k * (st.weather === 'rain' ? .36 : .3) * V('roll'));
  set(N.roll.f.frequency, 180 + k * (st.weather === 'rain' ? 900 : 500));
  // Antrieb: Brummen mit der Trittfrequenz
  const cad = st.cad || 0;
  set(N.hum.g.gain, cad > 20 && st.riding ? Math.min(.12, .03 + st.power / 4000) * V('hum') : 0);
  set(N.hum.f.frequency, 60 + cad * 1.2);
  // Umgebung: Meer an der Küste, Regen als leises Prasseln
  set(N.sea.g.gain, st.theme === 'coast' && !st.tunnel ? (.22 + .1 * Math.sin(t / 3)) * V('sea') : 0, .8);
  set(N.breeze.g.gain, st.tunnel ? 0 : st.weather === 'rain' ? .05 * V('rain') : 0, .8);
  set(N.breeze.f.frequency, st.weather === 'rain' ? 2600 : 1500, .8);
  if (st.weather === 'rain' && !st.tunnel && V('rain') > 0 && Math.random() < .5) for (let i = 0; i < 3; i++) click(t + Math.random() * .2, (.01 + Math.random() * .015) * V('rain'));
  // Radeln: Kettensurren im Takt der Kurbel, kurze Impulse je Tritt
  const pedaling = st.riding && cad > 20 && V('chain') > 0;
  set(N.chain.f.frequency, 1800 + cad * 12 + k * 800);
  if (!pedaling) { if (N.stroke) N.chain.g.gain.cancelScheduledValues(t); set(N.chain.g.gain, 0, .15); N.stroke = 0; }
  else {
    const per = 60 / cad / 2, base = (.008 + Math.min(.02, st.power / 20000)) * V('chain');
    if (N.stroke < t) N.stroke = t + .02;
    while (N.stroke < t + .35) {
      const s = N.stroke, g = N.chain.g.gain;
      g.setTargetAtTime(base * 2, s, per * .1); g.setTargetAtTime(base * .08, s + per * .3, per * .15);
      if (Math.random() < .5) click(s + per * .5, (.018 + Math.random() * .012) * V('chain'));
      N.stroke += per;
    }
  }
  // Freilauf-Klicken, wenn gerollt und nicht getreten wird
  if (v > 2 && cad < 10 && t > N.tick && V('free') > 0) { for (let i = 0; i < 6; i++) click(t + i * (.9 / (v * 2)), .05 * V('free')); N.tick = t + .8; }
  // Vögel auf dem Land, nicht im Tunnel, nachts oder bei Regen
  if (!st.tunnel && st.weather !== 'rain' && !st.night && V('birds') > 0 && ['meadow', 'forest', 'lake', 'alpine', 'plains'].includes(st.theme) && t > N.bird) { bird(t); N.bird = t + 2 + Math.random() * 6; }
  // Musik folgt der Intensität
  M.intensity = st.riding && st.ftp ? Math.min(1.3, st.power / st.ftp) : .3;
  const duck = !st.riding; if (duck !== M.duck) { M.duck = duck; apply(); }
}

/* ---------- Effekte ---------- */
function tone(freq, start, dur, { type = 'sine', vol = .3, slide = 0, attack = .005, out = fx } = {}) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, start); if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, start + dur);
  g.gain.setValueAtTime(0, start); g.gain.linearRampToValueAtTime(vol, start + attack); g.gain.exponentialRampToValueAtTime(.0001, start + dur);
  o.connect(g).connect(out); o.start(start); o.stop(start + dur + .05);
}
function click(start, vol = .08) {
  if (vol <= 0) return;
  const s = ctx.createBufferSource(); s.buffer = NB.click;
  const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 3000;
  const g = ctx.createGain(); g.gain.value = vol; s.connect(f).connect(g).connect(amb); s.start(start);
}
function bird(t) {
  const base = 2200 + Math.random() * 1800, n = 2 + (Math.random() * 4 | 0), vol = .025 * V('birds');
  for (let i = 0; i < n; i++) { const o = ctx.createOscillator(), g = ctx.createGain(), s = t + i * .13; o.frequency.setValueAtTime(base, s); o.frequency.exponentialRampToValueAtTime(base * (1.3 + Math.random() * .4), s + .07); g.gain.setValueAtTime(0, s); g.gain.linearRampToValueAtTime(vol, s + .01); g.gain.exponentialRampToValueAtTime(.0001, s + .09); o.connect(g).connect(amb); o.start(s); o.stop(s + .12); }
}

/* ---------- Musik: selbst erzeugt (Akkorde, Bass, Schlagzeug) oder eigene Dateien ---------- */
const M = { on: false, style: null, next: 0, step: 0, timer: null, intensity: .3, duck: false, audio: null, list: [], idx: 0 };
const NOTE = n => 440 * 2 ** ((n - 69) / 12);
// Akkordfolgen als MIDI-Grundtöne + Akkordtöne
const PROG = {
  chill: { bpm: 84, chords: [[53, [0, 4, 7, 11]], [52, [0, 3, 7, 10]], [50, [0, 3, 7, 10]], [48, [0, 4, 7, 11]]] },
  drive: { bpm: 124, chords: [[57, [0, 3, 7]], [53, [0, 4, 7]], [48, [0, 4, 7]], [55, [0, 4, 7]]] },
  synth: { bpm: 100, chords: [[57, [0, 3, 7, 12]], [53, [0, 4, 7, 12]], [48, [0, 4, 7, 12]], [55, [0, 4, 7, 12]]] },
};
function drum(kind, t, vol) {
  if (kind === 'kick') { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + .14); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + .3); o.connect(g).connect(mus); o.start(t); o.stop(t + .32); return; }
  const s = ctx.createBufferSource(); s.buffer = kind === 'hat' ? NB.hat : NB.snare;
  const f = ctx.createBiquadFilter(); f.type = kind === 'hat' ? 'highpass' : 'bandpass'; f.frequency.value = kind === 'hat' ? 7000 : 1800;
  const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + (kind === 'hat' ? .05 : .18));
  s.connect(f).connect(g).connect(mus); s.start(t);
}
function pad(notes, t, dur, style) {
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = style === 'chill' ? 900 : 600 + M.intensity * 1600; f.connect(mus);
  for (const n of notes) { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = style === 'chill' ? 'triangle' : 'sawtooth'; o.frequency.value = NOTE(n); o.detune.value = (Math.random() - .5) * 12; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(style === 'chill' ? .035 : .022, t + .4); g.gain.setValueAtTime(style === 'chill' ? .035 : .022, t + dur - .3); g.gain.linearRampToValueAtTime(0, t + dur); o.connect(g).connect(f); o.start(t); o.stop(t + dur + .05); }
}
function schedule() {
  if (!M.on || !ctx || ctx.state !== 'running') return;
  const P = PROG[M.style], spb = 60 / P.bpm / 4; // Sechzehntel
  if (M.next < now()) M.next = now() + .05;
  while (M.next < now() + .4) {
    const t = M.next, s = M.step % 64, beat = s % 16, [root, chord] = P.chords[Math.floor(s / 16)], hi = M.intensity;
    if (beat === 0) pad(chord.map(c => root + 12 + c), t, spb * 16, M.style);
    if (M.style === 'drive') {
      if (s % 4 === 0) drum('kick', t, .5);
      if (s % 4 === 2) drum('hat', t, .12);
      if (hi > .85 && s % 2 === 1) drum('hat', t, .05);
      if (s % 4 === 2) tone(NOTE(root - 12), t, spb * 1.6, { type: 'sawtooth', vol: .09, out: mus });
      if (beat === 4 || beat === 12) drum('snare', t, .14);
    } else if (M.style === 'synth') {
      if (beat === 0 || beat === 8) drum('kick', t, .45);
      if (beat === 4 || beat === 12) drum('snare', t, .2);
      if (s % 2 === 0) tone(NOTE(root - 12), t, spb * 1.8, { type: 'square', vol: .045, out: mus });
      if (hi > .6) tone(NOTE(root + 24 + chord[s % chord.length]), t, spb * .9, { type: 'square', vol: .025 + (hi - .6) * .03, out: mus });
      if (hi > .95 && s % 2 === 1) drum('hat', t, .06);
    } else {
      if (beat === 0 || beat === 10) drum('kick', t, .25);
      if (hi > .5 && beat % 4 === 2) drum('hat', t, .05);
      if (beat === 0 || beat === 8) tone(NOTE(root - 12), t, spb * 7, { type: 'sine', vol: .12, out: mus, attack: .05 });
      if (s % 4 === 0 && Math.random() < .35) tone(NOTE(root + 24 + chord[Math.floor(Math.random() * chord.length)]), t, spb * 6, { type: 'sine', vol: .03, out: mus, attack: .02 });
    }
    M.step++; M.next += spb;
  }
}
async function playOwn() {
  const files = await kv.get('musicFiles', []);
  if (!files.length) return false;
  M.list = files.sort(() => Math.random() - .5); M.idx = 0;
  const a = M.audio = new Audio(); a.crossOrigin = 'anonymous';
  ctx.createMediaElementSource(a).connect(mus);
  const next = () => { if (!M.on) return; const f = M.list[M.idx++ % M.list.length]; if (a.src) URL.revokeObjectURL(a.src); a.src = URL.createObjectURL(f.blob); a.play().catch(() => { }); };
  a.onended = next; a.onerror = next; next();
  return true;
}
export const music = {
  async start() {
    const style = profile.music || 'off';
    this.stop(); if (style === 'off' || !ctx) return;
    M.on = true; M.style = style; M.step = 0; M.next = 0; apply();
    if (style === 'own') { if (!(await playOwn())) M.on = false; return; }
    M.timer = setInterval(schedule, 100); schedule();
  },
  stop() {
    M.on = false; clearInterval(M.timer); M.timer = null;
    if (M.audio) { M.audio.pause(); if (M.audio.src) URL.revokeObjectURL(M.audio.src); M.audio = null; }
  },
  skip() { if (M.audio && M.list.length) M.audio.onended(); },
  get playing() { return M.on; },
};

const ok = () => ctx && ctx.state === 'running' && !muted();
export const sound = {
  unlock, apply, update,
  shift(up) { if (!ok() || !V('shift')) return; click(now(), .25 * V('shift')); tone(up ? 900 : 700, now(), .04, { type: 'square', vol: .04 * V('shift') }); },
  beep(last = false) { if (!ok() || !V('beep')) return; tone(last ? 1320 : 880, now(), last ? .35 : .12, { type: 'triangle', vol: .3 * V('beep') }); },
  gate() { if (!ok() || !V('gate')) return; const t = now(); [784, 1047, 1319].forEach((f, i) => tone(f, t + i * .07, .4, { type: 'triangle', vol: .22 * V('gate') })); },
  fanfare() { if (!ok() || !V('fanfare')) return; const t = now(), v = V('fanfare'); [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, t + i * .11, i === 5 ? .7 : .2, { type: 'sawtooth', vol: .1 * v })); [523, 659, 784].forEach(f => tone(f, t + .55, .9, { type: 'triangle', vol: .12 * v })); },
  levelUp() { if (!ok() || !V('levelup')) return; const t = now(); [392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, t + i * .09, .5, { type: 'triangle', vol: .2 * V('levelup') })); },
  pass() { if (!ok() || !V('pass')) return; tone(1400, now(), .08, { vol: .08 * V('pass'), slide: 1.4 }); },
  warn() { if (!ok() || !V('warn')) return; const t = now(); tone(440, t, .18, { type: 'square', vol: .08 * V('warn') }); tone(330, t + .2, .25, { type: 'square', vol: .08 * V('warn') }); },
  whoosh() { if (!ok() || !V('whoosh')) return; const s = ctx.createBufferSource(); s.buffer = NB.whoosh; const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.5; f.frequency.setValueAtTime(300, now()); f.frequency.exponentialRampToValueAtTime(3000, now() + .6); const g = ctx.createGain(); g.gain.setValueAtTime(.0001, now()); g.gain.exponentialRampToValueAtTime(.4 * V('whoosh'), now() + .25); g.gain.exponentialRampToValueAtTime(.0001, now() + .75); s.connect(f).connect(g).connect(fx); s.start(); },
  // Einzelnes Geräusch zum Probehören
  preview(k) {
    unlock(); if (!ctx) return; const t = now();
    if (this[k === 'levelup' ? 'levelUp' : k]) return this[k === 'levelup' ? 'levelUp' : k](k === 'shift' ? true : undefined);
    if (k === 'birds') return bird(t);
    if (k === 'free') { for (let i = 0; i < 8; i++) click(t + i * .06, .05 * V('free')); return; }
    if (k === 'chain') { for (let i = 0; i < 6; i++) click(t + i * .33, .03 * V('chain')); return; }
    const n = nodes[{ wind: 'wind', roll: 'roll', hum: 'hum', sea: 'sea', rain: 'breeze' }[k]]; if (!n) return;
    const lvl = { wind: .12, roll: .25, hum: .1, sea: .25, rain: .06 }[k] * V(k);
    n.g.gain.cancelScheduledValues(t); n.g.gain.setTargetAtTime(lvl, t, .1); n.g.gain.setTargetAtTime(0, t + 1.6, .3);
  },
  silence() { if (!ctx || !nodes) return; for (const k of ['wind', 'roll', 'hum', 'sea', 'breeze', 'chain']) { nodes[k].g.gain.cancelScheduledValues(now()); nodes[k].g.gain.setTargetAtTime(0, now(), .2); } nodes.stroke = 0; },
  toggle() { profile.soundOn = profile.soundOn === false; apply(); return !muted(); },
};
