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
  // Stereo, damit Rauschen breit klingt und nicht "in der Mitte klebt"
  const n = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    let last = 0, b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      if (type === 'brown') { last = (last + .02 * w) / 1.02; d[i] = last * 3.5; }
      else if (type === 'pink') { b0 = .99886 * b0 + w * .0555179; b1 = .99332 * b1 + w * .0750759; b2 = .969 * b2 + w * .153852; b3 = .8665 * b3 + w * .3104856; b4 = .55 * b4 + w * .5329522; b5 = -.7616 * b5 - w * .016898; d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * .5362) * .11; b6 = w * .115926; }
      else d[i] = w;
    }
    // weiche Übergänge an der Schleifenstelle, damit kein Knacken entsteht
    const f = Math.min(2048, n >> 3); for (let i = 0; i < f; i++) { const k = i / f; d[i] = d[i] * k + d[n - f + i] * (1 - k); }
  }
  return b;
}
function loop(buf, filterType, freq, q = .7, out = null) {
  const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.loopEnd = buf.duration - 2048 / ctx.sampleRate;
  const f = ctx.createBiquadFilter(); f.type = filterType; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain(); g.gain.value = 0;
  s.connect(f).connect(g).connect(out || amb); s.start(0, Math.random() * buf.duration * .8);
  return { s, f, g };
}
let NB = null; // kurze Rauschpuffer, einmal erzeugt
function build() {
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  // Kompressor vor dem Ausgang: nichts übersteuert, leise Geräusche bleiben hörbar
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 3.5; comp.attack.value = .01; comp.release.value = .25;
  master = ctx.createGain(); master.connect(comp).connect(ctx.destination);
  amb = ctx.createGain(); amb.connect(master);
  fx = ctx.createGain(); fx.connect(master);
  mus = ctx.createGain(); mus.connect(master);
  const white = noiseBuffer('white', 4), pink = noiseBuffer('pink', 5), brown = noiseBuffer('brown', 6);
  NB = { click: noiseBuffer('white', .02), hat: noiseBuffer('white', .08), snare: noiseBuffer('white', .25), whoosh: noiseBuffer('pink', .9) };
  // Reifen: tiefes Rollen plus feines Abrollgeräusch des Profils
  const rollG = ctx.createGain(); rollG.gain.value = 0; rollG.connect(amb);
  const roll = loop(brown, 'lowpass', 260, .7, rollG), grit = loop(pink, 'bandpass', 1400, .8, rollG); roll.g.gain.value = 1; grit.g.gain.value = .25;
  nodes = {
    wind: loop(pink, 'lowpass', 400, .4), roll: { g: rollG, f: roll.f, grit }, hum: loop(brown, 'bandpass', 110, 3),
    sea: loop(brown, 'lowpass', 520, .4), surf: loop(pink, 'bandpass', 900, .5), breeze: loop(white, 'bandpass', 1800, .4), chain: loop(pink, 'bandpass', 1900, 1.1),
    tick: 0, bird: 0, wave: 0, gust: 0, gustV: 0,
  };
  // Antrieb ohne Klicks: Kettensurren als Rauschen, das per LFO weich im Tritt-Takt atmet, dazu das leise Zahnrad-Brummen
  const lfo = ctx.createOscillator(), lfoG = ctx.createGain(); lfo.type = 'sine'; lfo.frequency.value = 3; lfoG.gain.value = 0; lfo.connect(lfoG).connect(nodes.chain.g.gain); lfo.start();
  const tooth = ctx.createOscillator(), toothF = ctx.createBiquadFilter(), toothG = ctx.createGain(); tooth.type = 'triangle'; tooth.frequency.value = 70; toothF.type = 'lowpass'; toothF.frequency.value = 380; toothG.gain.value = 0;
  tooth.connect(toothF).connect(toothG).connect(amb); tooth.start();
  Object.assign(nodes, { lfo, lfoG, tooth, toothG });
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
  // Fahrtwind: ab etwa 15 km/h hörbar, wächst mit dem Quadrat des Tempos, dazu langsame Böen
  if (t > N.gust) { N.gustV = .75 + Math.random() * .5; N.gust = t + 1.5 + Math.random() * 3; }
  const wk = Math.max(0, (v - 4) / 10);
  set(N.wind.g.gain, Math.min(.3, wk * wk * .14) * N.gustV * (st.tunnel ? 1.6 : 1) * V('wind'), .6);
  set(N.wind.f.frequency, (st.tunnel ? 240 : 300) + Math.min(1, wk) * 700 * N.gustV, .6);
  // Reifen auf Asphalt (bei Regen nasser und heller)
  const wet = st.weather === 'rain';
  set(N.roll.g.gain, Math.min(1, k * 1.1) * (wet ? .34 : .26) * V('roll'), .2);
  set(N.roll.f.frequency, 160 + k * 380);
  set(N.roll.grit.g.gain, k * (wet ? .55 : .25), .2);
  set(N.roll.grit.f.frequency, (wet ? 2400 : 1100) + k * 900);
  // Antrieb: leises Brummen mit der Trittfrequenz
  const cad = st.cad || 0, pedaling = st.riding && cad > 20;
  set(N.hum.g.gain, pedaling ? Math.min(.07, .02 + st.power / 6000) * V('hum') : 0);
  set(N.hum.f.frequency, 55 + cad * .9);
  // Kette: gleichmäßiges Surren; Lautstärke und Takt ändern sich nur über weiche Rampen (kein Neu-Planen, also kein Knacken)
  const base = pedaling ? (.01 + Math.min(.014, st.power / 30000)) * V('chain') : 0;
  set(N.chain.g.gain, base, .15); set(N.lfoG.gain, base * .45, .15);
  set(N.lfo.frequency, Math.max(.5, cad / 60 * 2), .3);
  set(N.chain.f.frequency, 1500 + cad * 6 + k * 500, .3);
  set(N.toothG.gain, pedaling ? .012 * V('chain') : 0, .2); set(N.tooth.frequency, Math.max(20, cad / 60 * 50), .2);
  // Freilauf: feines, metallisches Ticken der Sperrklinken, Takt folgt dem Raddrehen
  if (v > 1.5 && cad < 10 && V('free') > 0) {
    const rate = Math.min(32, v / 2.1 * 18), vol = .02 * Math.min(1, v / 6) * V('free');
    if (N.tick < t) N.tick = t + .02;
    while (N.tick < t + .25) { pawl(N.tick, vol * (.8 + Math.random() * .4)); N.tick += 1 / rate * (.95 + Math.random() * .1); }
  } else N.tick = 0;
  // Meer: ruhiges Rauschen plus einzelne Wellen, die anlaufen und auslaufen
  const coast = ['coast', 'tropical', 'fjord'].includes(st.theme) && !st.tunnel && V('sea') > 0;
  set(N.sea.g.gain, coast ? .12 * V('sea') : 0, .8);
  if (!coast) set(N.surf.g.gain, 0, .5);
  else if (t > N.wave) {
    const pk = (.12 + Math.random() * .1) * V('sea'), up = 1.4 + Math.random(), down = 2.2 + Math.random() * 1.5, g = N.surf.g.gain;
    g.cancelScheduledValues(t); g.setTargetAtTime(pk, t, up / 3); g.setTargetAtTime(.01, t + up, down / 3);
    N.surf.f.frequency.setTargetAtTime(1300, t, up / 3); N.surf.f.frequency.setTargetAtTime(650, t + up, down / 3);
    N.wave = t + up + down + Math.random() * 2.5;
  }
  // Regen: leises Prasseln und Tropfen
  set(N.breeze.g.gain, st.tunnel ? 0 : wet ? .05 * V('rain') : 0, .8);
  set(N.breeze.f.frequency, wet ? 2600 : 1500, .8);
  if (wet && !st.tunnel && V('rain') > 0 && Math.random() < .5) for (let i = 0; i < 3; i++) click(t + Math.random() * .2, (.008 + Math.random() * .012) * V('rain'), 2500 + Math.random() * 3000);
  // Vögel auf dem Land, nicht im Tunnel, nachts oder bei Regen
  if (!st.tunnel && !wet && !st.night && V('birds') > 0 && ['meadow', 'forest', 'lake', 'alpine', 'plains', 'tropical', 'tuscany', 'fjord'].includes(st.theme) && t > N.bird) { bird(t); N.bird = t + 2.5 + Math.random() * 7; }
  // Musik folgt der Intensität
  M.intensity = st.riding && st.ftp ? Math.min(1.3, st.power / st.ftp) : .3;
  const duck = !st.riding; if (duck !== M.duck) { M.duck = duck; apply(); }
}

/* ---------- Effekte ---------- */
function tone(freq, start, dur, { type = 'sine', vol = .3, slide = 0, attack = .005, out = fx, lp = 0, pan = 0 } = {}) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, start); if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, start + dur);
  g.gain.setValueAtTime(0, start); g.gain.linearRampToValueAtTime(vol, start + attack); g.gain.exponentialRampToValueAtTime(.0001, start + dur);
  let node = o.connect(g);
  if (lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; node = node.connect(f); }
  if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; node = node.connect(p); }
  node.connect(out); o.start(start); o.stop(start + dur + .05);
}
// Glocke: Grundton mit leisen Obertönen, klingt weicher als ein reiner Piepton
function bell(freq, start, dur, vol, out = fx) { [[1, 1], [2.01, .35], [3.02, .12]].forEach(([m, a]) => tone(freq * m, start, dur / m ** .5, { vol: vol * a, attack: .004, out })); }
// Sperrklinke: kurzer, gedämpfter Metallton statt Rauschklick
function pawl(start, vol) {
  const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
  o.type = 'sine'; o.frequency.setValueAtTime(3400 + Math.random() * 500, start); f.type = 'highpass'; f.frequency.value = 1500;
  g.gain.setValueAtTime(0, start); g.gain.linearRampToValueAtTime(vol, start + .0015); g.gain.exponentialRampToValueAtTime(.0001, start + .018);
  o.connect(f).connect(g).connect(amb); o.start(start); o.stop(start + .03);
}
function click(start, vol = .08, freq = 3000) {
  if (vol <= 0) return;
  const s = ctx.createBufferSource(); s.buffer = NB.click;
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 1.2;
  const g = ctx.createGain(); g.gain.value = vol; s.connect(f).connect(g).connect(amb); s.start(start);
}
function bird(t) {
  // verschiedene Rufmuster: Triller, auf- und absteigende Pfiffe, zweisilbig; zufällig links oder rechts
  const kind = Math.random() * 3 | 0, base = 2300 + Math.random() * 1700, vol = .022 * V('birds'), pan = Math.random() * 1.6 - .8;
  const n = kind === 0 ? 5 + (Math.random() * 6 | 0) : kind === 1 ? 2 + (Math.random() * 3 | 0) : 2;
  for (let i = 0; i < n; i++) {
    const s = t + i * (kind === 0 ? .07 : kind === 1 ? .16 : .28), d = kind === 0 ? .05 : kind === 1 ? .11 : .18;
    const f0 = kind === 2 && i === 1 ? base * .8 : base * (1 + (Math.random() - .5) * .08), f1 = kind === 1 ? f0 * 1.45 : kind === 2 ? f0 * .85 : f0 * 1.2;
    const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(f0, s); o.frequency.exponentialRampToValueAtTime(f1, s + d * .8);
    g.gain.setValueAtTime(0, s); g.gain.linearRampToValueAtTime(vol, s + .012); g.gain.exponentialRampToValueAtTime(.0001, s + d);
    let node = o.connect(g); if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; node = node.connect(p); }
    node.connect(amb); o.start(s); o.stop(s + d + .02);
  }
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
  shift(up) { if (!ok() || !V('shift')) return; const t = now(); click(t, .2 * V('shift'), 2200); click(t + .035, .12 * V('shift'), 3200); tone(up ? 880 : 660, t, .05, { type: 'triangle', vol: .035 * V('shift') }); },
  beep(last = false) { if (!ok() || !V('beep')) return; bell(last ? 1320 : 880, now(), last ? .6 : .22, .22 * V('beep')); },
  gate() { if (!ok() || !V('gate')) return; const t = now(); [784, 1047, 1319, 1568].forEach((f, i) => bell(f, t + i * .065, .7, .13 * V('gate'))); },
  fanfare() { if (!ok() || !V('fanfare')) return; const t = now(), v = V('fanfare'); [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, t + i * .11, i === 5 ? .8 : .22, { type: 'sawtooth', vol: .07 * v, lp: 2400, attack: .015 })); [523, 659, 784].forEach((f, i) => tone(f, t + .55, 1.1, { type: 'triangle', vol: .1 * v, pan: (i - 1) * .4, attack: .02 })); },
  levelUp() { if (!ok() || !V('levelup')) return; const t = now(); [392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, t + i * .09, .5, { type: 'triangle', vol: .2 * V('levelup') })); },
  pass() { if (!ok() || !V('pass')) return; const t = now(); bell(1175, t, .25, .06 * V('pass')); bell(1568, t + .08, .35, .05 * V('pass')); },
  warn() { if (!ok() || !V('warn')) return; const t = now(); tone(523, t, .2, { type: 'triangle', vol: .16 * V('warn'), lp: 1800 }); tone(392, t + .22, .32, { type: 'triangle', vol: .16 * V('warn'), lp: 1800 }); },
  whoosh() { if (!ok() || !V('whoosh')) return; const s = ctx.createBufferSource(); s.buffer = NB.whoosh; const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.5; f.frequency.setValueAtTime(300, now()); f.frequency.exponentialRampToValueAtTime(3000, now() + .6); const g = ctx.createGain(); g.gain.setValueAtTime(.0001, now()); g.gain.exponentialRampToValueAtTime(.4 * V('whoosh'), now() + .25); g.gain.exponentialRampToValueAtTime(.0001, now() + .75); s.connect(f).connect(g).connect(fx); s.start(); },
  // Einzelnes Geräusch zum Probehören
  preview(k) {
    unlock(); if (!ctx) return; const t = now();
    if (this[k === 'levelup' ? 'levelUp' : k]) return this[k === 'levelup' ? 'levelUp' : k](k === 'shift' ? true : undefined);
    if (k === 'birds') return bird(t);
    if (k === 'free') { for (let i = 0; i < 40; i++) pawl(t + i * .04, .02 * V('free')); return; }
    const n = nodes[{ wind: 'wind', roll: 'roll', hum: 'hum', sea: 'sea', rain: 'breeze', chain: 'chain' }[k]]; if (!n) return;
    const lvl = { wind: .14, roll: .26, hum: .07, sea: .2, rain: .06, chain: .02 }[k] * V(k);
    n.g.gain.cancelScheduledValues(t); n.g.gain.setTargetAtTime(lvl, t, .1); n.g.gain.setTargetAtTime(0, t + 1.6, .3);
  },
  silence() { if (!ctx || !nodes) return; for (const k of ['wind', 'roll', 'hum', 'sea', 'surf', 'breeze', 'chain']) { nodes[k].g.gain.cancelScheduledValues(now()); nodes[k].g.gain.setTargetAtTime(0, now(), .2); } nodes.lfoG.gain.setTargetAtTime(0, now(), .2); nodes.toothG.gain.setTargetAtTime(0, now(), .2); nodes.tick = 0; nodes.wave = 0; },
  toggle() { profile.soundOn = profile.soundOn === false; apply(); return !muted(); },
};
