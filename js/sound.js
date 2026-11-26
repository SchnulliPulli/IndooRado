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
  fx: [['shift', 'Schalten'], ['beep', 'Countdown 3-2-1'], ['gate', 'Zieltor'], ['fanfare', 'Fanfaren: Gipfel, Sprint, Ziel'], ['levelup', 'Level-up'], ['pass', 'Überholen, Ride On'], ['traffic', 'Autos und Lkw'], ['warn', 'Warnungen'], ['whoosh', 'Beamen, Überspringen']],
};

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
  const off = st.surface && st.surface !== 'asphalt' && st.surface !== 'moon';
  set(N.roll.grit.g.gain, k * (wet ? .55 : off ? .9 : .25), .2);
  set(N.roll.grit.f.frequency, (wet ? 2400 : off ? 1700 : 1100) + k * 900);
  // Mond: kein Fahrtwind (keine Luft), dafür nur das eigene Rollen
  if (st.surface === 'moon') set(N.wind.g.gain, 0, .3);
  // Kühe in der Nähe: ab und zu ein Muh
  if (st.cows && st.riding && t > (N.moo || 0) && V('birds') > 0) { N.moo = t + 12 + Math.random() * 20; moo(t + Math.random() * 2); }
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
  // Musik folgt der Leistung oder (Einstellung) dem Puls zwischen Ruhe- und Maximalpuls
  const hrI = profile.musicFollow === 'hr' && st.hr ? (st.hr - (profile.hrRest || 55)) / Math.max(40, (profile.hrMax || 190) - (profile.hrRest || 55)) * 1.25 : null;
  M.cad = st.cad || 0;
  M.intensity = st.riding ? Math.min(1.3, hrI ?? (st.ftp ? st.power / st.ftp : .3)) : .3;
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
function moo(t) {
  const o = ctx.createOscillator(), o2 = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain(), pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  o.type = 'sawtooth'; o2.type = 'sawtooth'; o.frequency.setValueAtTime(150, t); o.frequency.linearRampToValueAtTime(175, t + .35); o.frequency.linearRampToValueAtTime(118, t + 1.4); o2.frequency.setValueAtTime(152, t); o2.frequency.linearRampToValueAtTime(120, t + 1.4);
  f.type = 'lowpass'; f.frequency.setValueAtTime(500, t); f.frequency.linearRampToValueAtTime(900, t + .4); f.frequency.linearRampToValueAtTime(400, t + 1.4); f.Q.value = 4;
  const v = .07 * V('birds'); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + .15); g.gain.setValueAtTime(v, t + 1.1); g.gain.linearRampToValueAtTime(0, t + 1.5);
  let n = f; o.connect(f); o2.connect(f); if (pan) { pan.pan.value = Math.random() * 1.4 - .7; f.connect(pan); n = pan; } n.connect(g).connect(amb);
  o.start(t); o2.start(t); o.stop(t + 1.6); o2.stop(t + 1.6);
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
// Akkordfolgen (je 4 Takte): Grundton als MIDI-Note, dazu die Akkordtöne in Halbtönen
const MAJ7 = [0, 4, 7, 11], MIN7 = [0, 3, 7, 10], MAJ = [0, 4, 7], MIN = [0, 3, 7], PWR = [0, 7, 12], ADD9 = [0, 4, 7, 14], MIN9 = [0, 3, 7, 10, 14];
const P = (...c) => c;
// Stile: Tempo, Klang, Schlagzeug als 16tel-Muster (x = Schlag), Bass-Muster und mehrere Stücke (Akkordfolgen)
export const STYLES = {
  chill: { n: 'Chill', bpm: 84, pad: 'triangle', padVol: .035, kick: 'x.........x.....', snare: '', hat: '..x...x...x...x.', hatFrom: .5, bass: 'x.......x.......', bassWave: 'sine', bassLen: 7, sparkle: .35,
    tracks: [P([53, MAJ7], [52, MIN7], [50, MIN7], [48, MAJ7]), P([55, MAJ7], [52, MIN7], [57, MIN7], [53, MAJ7]), P([50, MIN9], [55, ADD9], [48, MAJ7], [53, MAJ7])] },
  lofi: { n: 'Lo-Fi', bpm: 78, swing: .2, crackle: true, pad: 'triangle', padVol: .03, kick: 'x......x..x.....', snare: '....x.......x...', snareVol: .1, hat: 'x.x.x.x.x.x.x.x.', hatVol: .03, bass: 'x.....x...x.....', bassWave: 'sine', bassLen: 3, sparkle: .25,
    tracks: [P([50, MIN9], [55, ADD9], [48, MAJ7], [57, MIN7]), P([53, MAJ7], [52, MIN7], [50, MIN9], [55, ADD9]), P([57, MIN9], [50, MIN7], [55, MAJ7], [48, MAJ7])] },
  ambient: { n: 'Ambient', bpm: 64, pad: 'sine', padVol: .04, kick: '', snare: '', hat: '', bass: 'x...............', bassWave: 'sine', bassLen: 14, sparkle: .5,
    tracks: [P([48, ADD9], [53, ADD9], [45, MIN9], [50, MIN9]), P([52, MIN9], [48, MAJ7], [55, ADD9], [50, MIN9])] },
  synth: { n: 'Synthwave', bpm: 100, pad: 'sawtooth', padVol: .022, kick: 'x.......x.......', snare: '....x.......x...', hat: '.x.x.x.x.x.x.x.x', hatFrom: .95, bass: 'x.x.x.x.x.x.x.x.', bassWave: 'square', bassVol: .045, lead: 'arp', leadFrom: .6,
    tracks: [P([57, [0, 3, 7, 12]], [53, [0, 4, 7, 12]], [48, [0, 4, 7, 12]], [55, [0, 4, 7, 12]]), P([52, MIN], [48, MAJ], [55, MAJ], [50, MIN]), P([45, MIN], [53, MAJ], [48, MAJ], [55, MAJ])] },
  house: { n: 'House', bpm: 122, pad: 'triangle', padVol: .018, kick: 'x...x...x...x...', snare: '....x.......x...', snareVol: .1, hat: '..x...x...x...x.', bass: '..x...x...x...x.', bassWave: 'sawtooth', bassVol: .07, stab: '..x..x....x..x..',
    tracks: [P([57, MIN7], [55, MAJ7], [53, MAJ7], [52, MIN7]), P([50, MIN7], [53, MAJ7], [48, MAJ7], [55, MAJ7])] },
  drive: { n: 'Drive', bpm: 124, pad: 'sawtooth', padVol: .022, kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.', hatFast: .85, bass: '..x...x...x...x.', bassWave: 'sawtooth', bassVol: .09,
    tracks: [P([57, MIN], [53, MAJ], [48, MAJ], [55, MAJ]), P([52, MIN], [55, MAJ], [50, MAJ], [57, MIN]), P([45, MIN], [48, MAJ], [55, MAJ], [53, MAJ])] },
  techno: { n: 'Techno', bpm: 132, pad: 'sawtooth', padVol: .012, kick: 'x...x...x...x...', snare: '....x.......x...', snareVol: .08, hat: '..x...x...x...x.', hatFast: .7, bass: 'xxxxxxxxxxxxxxxx', bassWave: 'sawtooth', bassVol: .05, acid: true,
    tracks: [P([45, MIN], [45, MIN], [48, MAJ], [43, MAJ]), P([40, MIN], [40, MIN], [43, MAJ], [45, MIN])] },
  rock: { n: 'Rock', bpm: 140, pad: 'sawtooth', padVol: .02, padLp: 2400, kick: 'x.....x.x.......', snare: '....x.......x...', snareVol: .18, hat: 'x.x.x.x.x.x.x.x.', bass: 'x.x.x.x.x.x.x.x.', bassWave: 'sawtooth', bassVol: .07, power: true,
    tracks: [P([45, PWR], [48, PWR], [43, PWR], [50, PWR]), P([40, PWR], [43, PWR], [45, PWR], [47, PWR]), P([45, PWR], [41, PWR], [48, PWR], [43, PWR])] },
  dnb: { n: 'Drum & Bass', bpm: 172, pad: 'triangle', padVol: .025, kick: 'x.........x.....', snare: '....x.......x...', snareVol: .16, hat: 'xxxxxxxxxxxxxxxx', hatVol: .03, bass: 'x...............', bassWave: 'sine', bassVol: .16, bassLen: 12,
    tracks: [P([50, MIN9], [46, MAJ7], [48, ADD9], [45, MIN7]), P([52, MIN7], [48, MAJ7], [55, ADD9], [50, MIN9])] },
  chip: { n: '8-Bit', bpm: 150, pad: 'square', padVol: .012, kick: 'x...x...x...x...', snare: '....x.......x...', snareVol: .1, hat: '..x...x...x...x.', bass: 'x.x.x.x.x.x.x.x.', bassWave: 'triangle', bassVol: .09, lead: 'arp', leadFrom: 0, leadWave: 'square',
    tracks: [P([60, MAJ], [57, MIN], [53, MAJ], [55, MAJ]), P([57, MIN], [53, MAJ], [55, MAJ], [52, MIN]), P([62, MIN], [58, MAJ], [60, MAJ], [57, MIN])] },
};
export const MUSIC = { off: 'Aus', ...Object.fromEntries(Object.entries(STYLES).map(([k, v]) => [k, `${v.n} (${v.bpm} BPM)`])), own: 'Eigene Musikdateien' };
function drum(kind, t, vol) {
  if (kind === 'kick') { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + .14); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + .3); o.connect(g).connect(mus); o.start(t); o.stop(t + .32); return; }
  const s = ctx.createBufferSource(); s.buffer = kind === 'hat' ? NB.hat : NB.snare;
  const f = ctx.createBiquadFilter(); f.type = kind === 'hat' ? 'highpass' : 'bandpass'; f.frequency.value = kind === 'hat' ? 7000 : 1800;
  const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + (kind === 'hat' ? .05 : .18));
  s.connect(f).connect(g).connect(mus); s.start(t);
}
function pad(notes, t, dur, S) {
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = S.padLp || (S.pad === 'sawtooth' || S.pad === 'square' ? 600 + M.intensity * 1600 : 900); f.connect(mus);
  for (const n of notes) { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = S.pad; o.frequency.value = NOTE(n); o.detune.value = (Math.random() - .5) * 12; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(S.padVol, t + .4); g.gain.setValueAtTime(S.padVol, t + dur - .3); g.gain.linearRampToValueAtTime(0, t + dur); o.connect(g).connect(f); o.start(t); o.stop(t + dur + .05); }
}
// Tempo: wie der Stil, fest eingestellt oder im Takt der Trittfrequenz (90 U/min = 90 BPM, langsame Kadenz verdoppelt)
function bpmNow(S) {
  const m = profile.musicTempo || 'style';
  if (m === 'fixed') return Math.max(50, Math.min(190, +profile.musicBpm || S.bpm));
  if (m === 'cadence' && M.cad > 30) { let b = M.cad; while (b < S.bpm * .7) b *= 2; while (b > S.bpm * 1.4) b /= 2; M.bpmS = (M.bpmS || b) + (b - (M.bpmS || b)) * .05; return M.bpmS; }
  return S.bpm;
}
// Stück: fest gewählt oder automatisch alle 32 Takte wechselnd
function trackNow(S) { const t = profile.musicTrack ?? 'auto'; return t === 'auto' ? (M.track ?? 0) % S.tracks.length : Math.min(S.tracks.length - 1, +t || 0); }
function schedule() {
  if (!M.on || !ctx || ctx.state !== 'running') return;
  const S = STYLES[M.style]; if (!S) return;
  const spb = 60 / bpmNow(S) / 4, drums = profile.musicDrums !== false, lead = profile.musicLead !== false;
  if (M.next < now()) M.next = now() + .05;
  while (M.next < now() + .4) {
    const s = M.step % 64, beat = s % 16, tr = S.tracks[trackNow(S)], [root, chord] = tr[Math.floor(s / 16)], hi = M.intensity;
    const t = M.next + (S.swing && s % 2 ? spb * S.swing : 0), on = (pat, i = beat) => pat && pat[i] === 'x';
    if (beat === 0) pad(chord.map(c => root + 12 + c), t, spb * 16, S);
    if (drums) {
      if (on(S.kick)) drum('kick', t, M.style === 'chill' || M.style === 'lofi' ? .25 : .45);
      if (on(S.snare)) drum('snare', t, S.snareVol || .14);
      if (on(S.hat) && hi >= (S.hatFrom || 0)) drum('hat', t, S.hatVol || .1);
      if (S.hatFast && hi > S.hatFast && s % 2 === 1) drum('hat', t, .05);
      if (S.crackle && Math.random() < .12) drum('hat', t, .012);
    }
    if (on(S.bass)) {
      const n = S.acid ? root - 12 + (s % 3 === 0 ? 12 : 0) : S.power ? root - 12 : root - 12;
      tone(NOTE(n), t, spb * (S.bassLen || 1.6), { type: S.bassWave, vol: S.bassVol || .1, out: mus, attack: S.bassLen > 4 ? .05 : .005, lp: S.acid ? 300 + hi * 2200 : 0 });
    }
    if (S.power && on(S.bass)) for (const c of chord) tone(NOTE(root + c), t, spb * 1.4, { type: 'sawtooth', vol: .018, out: mus, lp: 1800 });
    if (S.stab && on(S.stab)) for (const c of chord) tone(NOTE(root + 12 + c), t, spb * .9, { type: 'triangle', vol: .022, out: mus });
    if (lead && S.lead === 'arp' && hi >= (S.leadFrom || 0)) tone(NOTE(root + 24 + chord[s % chord.length]), t, spb * .9, { type: S.leadWave || 'square', vol: .022 + Math.max(0, hi - .6) * .03, out: mus });
    if (lead && S.sparkle && s % 4 === 0 && Math.random() < S.sparkle) tone(NOTE(root + 24 + chord[Math.floor(Math.random() * chord.length)]), t, spb * 6, { type: 'sine', vol: .03, out: mus, attack: .02 });
    M.step++; M.next += spb;
    if (M.step % 512 === 0) M.track = (M.track || 0) + 1; // nach 32 Takten nächstes Stück
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
  // Nächstes Stück (eigene Dateien) bzw. nächste Akkordfolge (erzeugte Musik)
  skip() { if (M.audio && M.list.length) M.audio.onended(); else if (M.on) { M.track = (M.track || 0) + 1; M.step = Math.ceil(M.step / 16) * 16; } },
  get trackName() { const S = STYLES[M.style]; return S ? `${S.n} · Stück ${trackNow(S) + 1}/${S.tracks.length} · ${Math.round(bpmNow(S))} BPM` : ''; },
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
  // Vorbeifahrendes Auto oder Lkw: Rauschen, das an- und abschwillt, darunter Motorbrummen; knapp = lauter
  carPass(kind = 'car', near = 1) {
    if (!ok() || !V('traffic')) return; const t = now(), v = (kind === 'truck' ? .5 : .32) * near * V('traffic');
    const s = ctx.createBufferSource(); s.buffer = NB.whoosh; s.playbackRate.value = kind === 'truck' ? .6 : 1;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = .8; f.frequency.setValueAtTime(kind === 'truck' ? 300 : 600, t); f.frequency.exponentialRampToValueAtTime(kind === 'truck' ? 900 : 1800, t + .45); f.frequency.exponentialRampToValueAtTime(250, t + 1.3);
    const g = ctx.createGain(); g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(v, t + .45); g.gain.exponentialRampToValueAtTime(.0001, t + 1.5);
    s.connect(f).connect(g).connect(fx); s.start(t); s.stop(t + 1.6);
    const o = ctx.createOscillator(), og = ctx.createGain(), lp = ctx.createBiquadFilter(); o.type = 'sawtooth'; o.frequency.setValueAtTime(kind === 'truck' ? 62 : 110, t); o.frequency.linearRampToValueAtTime(kind === 'truck' ? 50 : 85, t + 1.3);
    lp.type = 'lowpass'; lp.frequency.value = kind === 'truck' ? 260 : 420; og.gain.setValueAtTime(.0001, t); og.gain.exponentialRampToValueAtTime(v * .5, t + .4); og.gain.exponentialRampToValueAtTime(.0001, t + 1.4);
    o.connect(lp).connect(og).connect(fx); o.start(t); o.stop(t + 1.5);
  },
  horn(kind = 'car') { if (!ok() || !V('traffic')) return; const t = now(), b = kind === 'truck' ? 220 : 420; for (const [f, d] of [[b, 0], [b * 1.26, 0]]) tone(f, t + d, .45, { type: 'square', vol: .05 * V('traffic'), lp: 1600, attack: .01 }); },
  whoosh() { if (!ok() || !V('whoosh')) return; const s = ctx.createBufferSource(); s.buffer = NB.whoosh; const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.5; f.frequency.setValueAtTime(300, now()); f.frequency.exponentialRampToValueAtTime(3000, now() + .6); const g = ctx.createGain(); g.gain.setValueAtTime(.0001, now()); g.gain.exponentialRampToValueAtTime(.4 * V('whoosh'), now() + .25); g.gain.exponentialRampToValueAtTime(.0001, now() + .75); s.connect(f).connect(g).connect(fx); s.start(); },
  // Einzelnes Geräusch zum Probehören
  preview(k) {
    unlock(); if (!ctx) return; const t = now();
    if (k === 'traffic') { this.carPass('truck', 1); setTimeout(() => this.horn('car'), 900); return; }
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
