// Fahransicht: 3D-Welt, HUD, Steuerung des Trainers, Aufzeichnung, Screenshots
import { $, esc, fmtT, fmtKm, clamp, bus, toast, dialog, fitCanvas, zoneColor } from '../util.js';
import { profile, sel, live, progress, saveSel, saveProgress } from '../state.js';
import { setPower, setGrade, control, trainer, status, demo } from '../ble.js';
import { GEARS, gearPower, integrate, steadySpeed } from '../physics.js';
import { getRoute } from '../routes.js';
import { getWorkout, at as woAt, drawWorkout, total as woTotal } from '../workouts.js';
import { profileChart } from '../charts.js';
import { ICON } from '../components.js';
import { saveRide } from '../ridesave.js';

const VIEWS = ['Verfolger', 'Weit', 'Seite', 'Vogel', 'Fahrer'];
const SPEED = +new URLSearchParams(location.search).get('speed') || 1; // nur zum Testen
let S = null;

export async function render(el) {
  el.innerHTML = `<div class="ridewrap" id="rw">
    <canvas id="gl"></canvas>
    <div class="loading" id="load"><div class="spinner"></div><div id="loadTxt">Welt wird aufgebaut …</div></div>
    <div class="hud-top">
      <div class="hbox"><b id="hHr" class="num hr">--</b><span>Puls</span></div>
      <div class="hbox"><b id="hCad" class="num cad">--</b><span>U/min</span></div>
      <div class="hbox main"><b id="hPw" class="num">0</b><span><i id="hWkg">0,0</i> W/kg</span></div>
      <div class="hbox"><b id="hSpd" class="num">0,0</b><span>km/h</span></div>
      <div class="hbox"><b id="hDist" class="num">0,0</b><span>km</span></div>
      <div class="hbox"><b id="hTime" class="num">0:00</b><span id="hTimeL">Zeit</span></div>
      <div class="hbox"><b id="hAsc" class="num">0</b><span>Hm</span></div>
    </div>
    <div class="hud-wo" id="woBox" hidden>
      <div class="row between"><div><div class="small muted" id="woName"></div><div class="wo-step" id="woStep"></div></div><div class="wo-left num" id="woLeft"></div></div>
      <div class="wo-target"><span class="num" id="woTgt">–</span><span class="small">Ziel W</span><span class="wo-next small muted" id="woNext"></span></div>
      <canvas id="woChart" class="wo-chart"></canvas>
      <div class="row between small"><span>Intensität <b id="woOff">100</b> %</span><span class="row" style="gap:4px"><button class="btn xs" id="woM">−</button><button class="btn xs" id="woP">+</button><button class="btn xs" id="woSkip">Weiter</button></span></div>
    </div>
    <div class="hud-right">
      <div class="gradebox"><b class="num" id="hGrade">0,0</b><span>% Steigung</span></div>
      <div class="gearbox"><button class="gbtn" id="gUp" aria-label="Hochschalten">+</button><div class="gearval"><b class="num" id="hGear">12</b><span id="hGearSub">Gang</span></div><button class="gbtn" id="gDn" aria-label="Runterschalten">−</button></div>
      <div class="hbox small" id="pacerBox" hidden><b class="num" id="hPacer">0 m</b><span>zum Schrittmacher</span></div>
    </div>
    <div class="climb" id="climbBox" hidden><div class="climb-name" id="clName"></div><div class="climb-row num"><span id="clLeft"></span><span id="clGrade"></span><span id="clTime"></span></div><div class="bar"><i id="clBar"></i></div></div>
    <div class="banner" id="banner"></div>
    <div class="hud-bottom">
      <canvas id="mini" class="minimap"></canvas>
      <div class="elevwrap"><canvas id="elev"></canvas><div class="elevtxt small" id="elevTxt"></div></div>
    </div>
    <div class="toolbar">
      <button class="tbtn" id="tPause" title="Pause (Leertaste)">${ICON.pause}<span>Pause</span></button>
      <button class="tbtn" id="tView" title="Kamera (C)">${ICON.view}<span>Kamera</span></button>
      <button class="tbtn" id="tShot" title="Foto (P)">${ICON.camera}<span>Foto</span></button>
      <button class="tbtn" id="tMode" title="Widerstand">${ICON.workout}<span id="tModeL">Gänge</span></button>
      <button class="tbtn" id="tFull" title="Vollbild">${ICON.full}<span>Vollbild</span></button>
      <button class="tbtn stop" id="tEnd" title="Beenden">${ICON.stop}<span>Beenden</span></button>
    </div>
    <div class="startcard" id="startCard"><b>Bereit</b><span>Tritt in die Pedale, die Fahrt startet automatisch.</span></div>
  </div>`;
  await start(el);
}

async function start(el) {
  const route = await getRoute(sel.routeId);
  const wo = await getWorkout(sel.workoutId);
  const { World } = await import('../world.js');
  const canvas = $('#gl', el);
  let world;
  try { world = new World(canvas, route, profile); }
  catch (e) { $('#loadTxt').textContent = 'WebGL konnte nicht gestartet werden: ' + e.message; return; }
  S = {
    el, route, wo, world, state: 'ready', t: 0, dist: 0, v: 0, crank: 0, gear: sel.gear ?? 11, mode: sel.mode, ergW: sel.ergW, wOff: 0, wT: 0,
    samples: [], shots: [], kj: 0, asc: 0, lastE: null, lap: 0, startWall: null, idle: 0, curP: 0, lastSend: 0, p3: [],
    climbs: route.climbs.map(c => ({ ...c, state: 'pending' })), climbLog: [], lastShotT: 0, lastSeg: -1, woDone: false, finished: false,
    pacer: sel.pacer ? { d: 0, v: 0, crank: 0, w: sel.pacer * profile.kg } : null, lastHud: 0, alive: true, offs: [],
  };
  world.setPacer(!!S.pacer);

  $('#loadTxt').textContent = 'Gelände wird erzeugt …';
  await new Promise(r => setTimeout(r, 30));
  world.resize(); world.preload(0);
  $('#load').hidden = true;
  if (wo) { $('#woBox').hidden = false; $('#woName').textContent = wo.name; }
  if (S.pacer) $('#pacerBox').hidden = false;
  updMode(); updGear();
  bindUi();
  S.ro = new ResizeObserver(() => world.resize()); S.ro.observe(canvas);
  S.timer = setInterval(tick, 100);
  S.lastFrame = performance.now();
  const frame = now => {
    if (!S?.alive) return;
    const dt = Math.min(.1, (now - S.lastFrame) / 1000); S.lastFrame = now;
    world.update({ dist: S.dist, v: S.v, crank: S.crank, pacerDist: S.pacer?.d, pacerV: S.pacer?.v, pacerCrank: S.pacer?.crank }, dt);
    if (now - S.lastHud > 200) { S.lastHud = now; hud(); }
    S.raf = requestAnimationFrame(frame);
  };
  S.raf = requestAnimationFrame(frame);
  lockScreen();
}

function bindUi() {
  const el = S.el;
  $('#gUp', el).onclick = () => shift(1); $('#gDn', el).onclick = () => shift(-1);
  $('#tPause', el).onclick = togglePause;
  $('#tView', el).onclick = () => flash('Kamera: ' + VIEWS[S.world.cycleView()]);
  $('#tShot', el).onclick = () => shot('Foto');
  $('#tMode', el).onclick = cycleMode;
  $('#tFull', el).onclick = () => { const r = $('#rw'); if (document.fullscreenElement) document.exitFullscreen(); else r.requestFullscreen?.().catch(() => { }); };
  $('#tEnd', el).onclick = endRide;
  $('#woM', el).onclick = () => { S.wOff = clamp(S.wOff - 2, -40, 40); };
  $('#woP', el).onclick = () => { S.wOff = clamp(S.wOff + 2, -40, 40); };
  $('#woSkip', el).onclick = () => { const w = woAt(S.wo, S.wT); if (w && !w.done) S.wT += w.left + .01; };
  S.key = e => {
    if (e.target.matches('input,select,textarea')) return;
    if (e.key === 'ArrowUp' || e.key === '+') { shift(1); e.preventDefault(); }
    else if (e.key === 'ArrowDown' || e.key === '-') { shift(-1); e.preventDefault(); }
    else if (e.key === ' ') { togglePause(); e.preventDefault(); }
    else if (e.key === 'c' || e.key === 'C') $('#tView').click();
    else if (e.key === 'p' || e.key === 'P') shot('Foto');
    else if (e.key >= '1' && e.key <= '5') { S.world.view = +e.key - 1; S.world.camInit = false; flash('Kamera: ' + VIEWS[S.world.view]); }
  };
  document.addEventListener('keydown', S.key);
  S.offs.push(bus.on('shift', d => shift(d)));
}

/* ---------- Steuerung ---------- */
function shift(dir) {
  const w = S.wo && S.state !== 'ready' ? woAt(S.wo, S.wT) : null;
  if (w && !w.done && w.target != null) { S.wOff = clamp(S.wOff + dir * 2, -40, 40); flash(`Intensität ${100 + S.wOff} %`, 700); return; }
  if (S.mode === 'erg') { S.ergW = clamp(S.ergW + dir * 10, 30, profile.maxW); sel.ergW = S.ergW; saveSel(); flash(S.ergW + ' W', 700); return; }
  if (S.mode === 'sim') { flash('Im Steigungsmodus gibt es keine virtuellen Gänge', 1200); return; }
  S.gear = clamp(S.gear + dir, 0, GEARS.length - 1); sel.gear = S.gear; updGear();
  flash((dir > 0 ? '▲ ' : '▼ ') + 'Gang ' + (S.gear + 1), 600);
}
function updGear() {
  const el = S.el;
  if (S.mode === 'erg') { $('#hGear', el).textContent = S.ergW; $('#hGearSub', el).textContent = 'W fix'; }
  else if (S.mode === 'sim') { $('#hGear', el).textContent = '–'; $('#hGearSub', el).textContent = 'Steigung'; }
  else { $('#hGear', el).textContent = S.gear + 1; $('#hGearSub', el).textContent = 'Gang · ' + GEARS[S.gear].toFixed(2).replace('.', ','); }
}
const MODES = { gear: 'Gänge', sim: 'Steigung', erg: 'ERG' };
function cycleMode() { const k = Object.keys(MODES); S.mode = k[(k.indexOf(S.mode) + 1) % k.length]; sel.mode = S.mode; saveSel(); updMode(); trainer.last = ''; flash('Widerstand: ' + { gear: 'virtuelle Gänge', sim: 'Steigung an Trainer', erg: 'feste Wattzahl' }[S.mode]); }
function updMode() { $('#tModeL', S.el).textContent = MODES[S.mode]; updGear(); }
function togglePause() {
  if (S.state === 'riding' || S.state === 'auto') { S.state = 'paused'; flash('Pause'); }
  else if (S.state === 'paused') { S.state = 'riding'; flash('Weiter'); }
  else if (S.state === 'ready') { begin(); }
  $('#tPause', S.el).innerHTML = (S.state === 'paused' ? ICON.play + '<span>Weiter</span>' : ICON.pause + '<span>Pause</span>');
}
function begin() { S.state = 'riding'; S.startWall = Date.now(); $('#startCard', S.el).hidden = true; flash('Los geht’s!', 1000); }

let bannerT = 0;
function flash(txt, ms = 1600) { const b = $('#banner', S.el); if (!b) return; b.textContent = txt; b.classList.add('show'); clearTimeout(bannerT); bannerT = setTimeout(() => b.classList.remove('show'), ms); }

/* ---------- Simulation (10 Hz, auch im Hintergrund) ---------- */
function tick() {
  if (!S?.alive) return;
  // Im Hintergrund drosselt der Browser Timer stark, deshalb die verstrichene Zeit in kleinen Schritten nachrechnen
  const now = performance.now(); let rest = Math.min(300, (now - (S.lastTick || now)) / 1000) * SPEED; S.lastTick = now;
  let first = true;
  while (rest > 1e-6) { const h = Math.min(.2, rest); rest -= h; step(h, first); first = false; }
}
function step(dt, first) {
  const now = performance.now();
  if (S.startWall) S.wall = (S.wall || 0) + dt;
  const R = S.route, grade = R.gradeAt(S.dist), cad = live.cadence;
  const pw = live.fresh ? live.power : 0;
  // Start und automatische Pause
  if (S.state === 'ready' && (pw > 10 || (cad || 0) > 20)) begin();
  if (S.state === 'riding' && profile.autoPause && pw < 5 && (cad || 0) < 5 && S.v < .3) { S.idle += dt; if (S.idle > 3) { S.state = 'auto'; flash('Automatische Pause'); } } else S.idle = 0;
  if (S.state === 'auto' && (pw > 10 || (cad || 0) > 20)) { S.state = 'riding'; flash('Weiter'); }
  const running = S.state === 'riding';
  // Ziel bestimmen
  let target = null, wi = null;
  if (S.wo && S.state !== 'ready') { wi = woAt(S.wo, S.wT); if (wi && !wi.done && wi.target != null) target = wi.target * profile.ftp * (1 + S.wOff / 100); }
  let gearMode = false;
  if (target == null && S.mode === 'erg') target = S.ergW;
  if (target == null && S.mode === 'gear') { gearMode = true; const gp = gearPower(cad, S.gear, grade * profile.gearDiff / 100); S.curP += (gp - S.curP) * Math.min(1, dt * 2.5); target = S.curP; }
  S.target = target; S.wi = wi;
  // an Trainer senden (oder Demo)
  if (first && now - S.lastSend > 500 && S.state !== 'paused') {
    S.lastSend = now;
    if (target != null) { if (!gearMode || Math.abs((control.target ?? -99) - target) >= 3) setPower(target); }
    else setGrade(grade * profile.simDiff / 100);
  }
  S.crank += (cad || 0) / 60 * Math.PI * 2 * dt;
  S.p3.push(pw); if (S.p3.length > 30) S.p3.shift();
  if (S.pacer && running) { const p = S.pacer, g = R.gradeAt(p.d); p.v += (steadySpeed(p.w, g) - p.v) * Math.min(1, dt * .8); p.d += p.v * dt; p.crank += 88 / 60 * Math.PI * 2 * dt; if (R.loop) p.d %= R.total; else p.d = Math.min(p.d, R.total); }
  if (!running) { S.v *= Math.pow(.25, dt); return; }
  // Bewegung
  S.v = integrate(S.v, pw, grade, dt);
  const prev = S.dist;
  S.dist += S.v * dt; S.t += dt; S.kj += pw * dt / 1000;
  if (S.wo) S.wT += dt;
  if (S.dist >= R.total) {
    if (R.loop) { S.dist -= R.total; S.lap++; flash('Runde ' + (S.lap + 1), 2000); S.climbs.forEach(c => c.state = 'pending'); }
    else { S.dist = R.total; if (!S.finished) { S.finished = true; S.state = 'paused'; flash('Ziel erreicht!', 3000); shot('Ziel'); setTimeout(() => endRide(true), 2500); } }
  }
  const e = R.eleAt(S.dist); if (S.lastE != null && e > S.lastE) S.asc += e - S.lastE; S.lastE = e;
  climbsTick(prev);
  // Workout-Ereignisse
  if (wi && !wi.done && wi.i !== S.lastSeg) { S.lastSeg = wi.i; const g = wi.g; flash(g.text ? g.text : g.a == null ? 'Frei fahren' : `${Math.round((g.a + g.b) / 2 * profile.ftp * (1 + S.wOff / 100))} W für ${fmtT(g.dur)}`, 2200); }
  if (wi?.done && !S.woDone) { S.woDone = true; flash('Workout geschafft! 🎉', 3000); shot('Workout geschafft'); }
  // Sekundenwerte
  S.acc = (S.acc || 0) + dt;
  while (S.acc >= 1) {
    S.acc -= 1;
    const totD = S.dist + S.lap * R.total;
    S.samples.push({ ts: Math.round(S.wall), p: Math.round(pw), hr: live.heart, cad: cad != null ? Math.round(cad) : null, v: +S.v.toFixed(2), d: +totD.toFixed(1), e: +e.toFixed(1), la: +R.latAt(S.dist).toFixed(6), lo: +R.lonAt(S.dist).toFixed(6), g: S.mode === 'gear' ? S.gear : null, tg: target != null ? Math.round(target) : null, wt: S.wo ? Math.round(S.wT) : null, gr: +grade.toFixed(1), rd: Math.round(S.dist) });
    if (profile.autoShots) {
      const n = S.samples.length;
      if (n === 90 || (n > 90 && n - S.lastShotT >= profile.shotEvery * 60)) shot('Unterwegs');
    }
  }
}
function climbsTick(prev) {
  for (const c of S.climbs) {
    if (c.state === 'pending' && prev < c.from + 1 && S.dist >= c.from) { c.state = 'active'; c.t0 = S.t; flash('Anstieg: ' + c.name, 2200); }
    if (c.state === 'active' && S.dist >= c.to) {
      c.state = 'done'; const time = S.t - c.t0, key = S.route.id + ':' + c.id, best = progress.climbBest[key];
      const pr = !best || time < best.time;
      S.climbLog.push({ name: c.name, id: c.id, len: c.len, gain: c.gain, avg: c.avg, time, best: best?.time ?? null, pr });
      flash(`Gipfel ${c.name}: ${fmtT(time)}${pr ? ' · Bestzeit!' : best ? ' · Bestzeit ' + fmtT(best.time) : ''}`, 3500);
      setTimeout(() => shot('Gipfel ' + c.name), 400);
    }
  }
}

/* ---------- Anzeige ---------- */
function hud() {
  const el = S.el, R = S.route, f = (v, d = 1) => v.toFixed(d).replace('.', ',');
  const p3 = S.p3.length ? S.p3.slice(-30).reduce((a, b) => a + b, 0) / S.p3.slice(-30).length : 0;
  $('#hPw', el).textContent = Math.round(p3); $('#hWkg', el).textContent = f(p3 / profile.kg);
  $('#hPw', el).style.color = zoneColor(p3 / profile.ftp);
  $('#hHr', el).textContent = live.heart ?? '--'; $('#hCad', el).textContent = live.cadence != null ? Math.round(live.cadence) : '--';
  $('#hSpd', el).textContent = f(S.v * 3.6); $('#hDist', el).textContent = f((S.dist + S.lap * R.total) / 1000, 1);
  $('#hTime', el).textContent = fmtT(S.t); $('#hTimeL', el).textContent = S.state === 'paused' ? 'Pause' : S.state === 'auto' ? 'Auto-Pause' : 'Zeit';
  $('#hAsc', el).textContent = Math.round(S.asc);
  const g = R.gradeAt(S.dist); $('#hGrade', el).textContent = f(g); $('.gradebox', el).dataset.g = g > 8 ? 4 : g > 5 ? 3 : g > 2.5 ? 2 : g < -2 ? 0 : 1;
  if (S.mode !== 'gear') updGear();
  // Workout
  if (S.wo) {
    const wi = S.wi || woAt(S.wo, S.wT);
    $('#woOff', el).textContent = 100 + S.wOff;
    if (wi && !wi.done) {
      $('#woStep', el).textContent = wi.g.text || (wi.target == null ? 'Frei fahren' : `Abschnitt ${wi.i + 1} von ${S.wo.segs.length}`);
      $('#woLeft', el).textContent = fmtT(wi.left);
      $('#woTgt', el).textContent = wi.target == null ? 'frei' : Math.round(wi.target * profile.ftp * (1 + S.wOff / 100));
      const n = wi.next; $('#woNext', el).textContent = n ? 'danach ' + (n.a == null ? 'frei' : Math.round((n.a + n.b) / 2 * profile.ftp) + ' W') + ' · ' + fmtT(n.dur) : 'letzter Abschnitt';
    } else { $('#woStep', el).textContent = 'Workout beendet'; $('#woLeft', el).textContent = ''; $('#woTgt', el).textContent = '–'; $('#woNext', el).textContent = 'Frei weiterfahren'; }
    const act = []; for (const s of S.samples) if (s.wt != null) act.push([s.wt, s.p]);
    drawWorkout($('#woChart', el), S.wo, { pos: S.wT, actual: act.length > 600 ? act.filter((_, i) => i % 3 === 0) : act, ftp: profile.ftp });
  }
  // Anstieg
  const c = S.climbs.find(c => c.state === 'active');
  $('#climbBox', el).hidden = !c;
  if (c) {
    const left = c.to - S.dist, frac = clamp((S.dist - c.from) / c.len, 0, 1), best = progress.climbBest[R.id + ':' + c.id];
    $('#clName', el).textContent = c.name; $('#clLeft', el).textContent = (left >= 1000 ? f(left / 1000) + ' km' : Math.round(left) + ' m') + ' bis zum Gipfel';
    $('#clGrade', el).textContent = 'Ø ' + f(c.avg) + ' %'; $('#clTime', el).textContent = fmtT(S.t - c.t0) + (best ? ' · Bestzeit ' + fmtT(best.time) : '');
    $('#clBar', el).style.width = (frac * 100).toFixed(1) + '%';
  }
  if (S.pacer) { const gap = (S.pacer.d - S.dist); $('#hPacer', el).textContent = (gap >= 0 ? '+' : '−') + Math.abs(Math.round(gap)) + ' m'; }
  // Höhenprofil: Ausschnitt der nächsten 5 km
  const ev = $('#elev', el); drawElevStrip(ev);
  drawMini($('#mini', el));
}
function drawElevStrip(cv) {
  const R = S.route, span = Math.min(R.total, 6000), back = Math.min(1000, span * .15);
  let from = S.dist - back, to = from + span;
  if (!R.loop) { from = clamp(from, 0, Math.max(0, R.total - span)); to = from + span; }
  const n = 200, dist = [], ele = [];
  for (let i = 0; i <= n; i++) { const d = from + (to - from) * i / n; dist.push(d - from); ele.push(R.eleAt(d)); }
  profileChart(cv, dist, ele, { pos: S.dist - from, ghost: S.pacer ? clamp(S.pacer.d - from, 0, span) : null, top: 18 });
  const left = R.loop ? null : R.total - S.dist;
  $('#elevTxt', S.el).textContent = `${Math.round(R.eleAt(S.dist))} m ü. NN${left != null ? ' · noch ' + fmtKm(left) + ' km' : ' · Runde ' + (S.lap + 1)}`;
}
function drawMini(cv) {
  const R = S.route, { w, h, d } = fitCanvas(cv), c = cv.getContext('2d'); c.clearRect(0, 0, w, h);
  // Ausschnitt um den Fahrer, nach Fahrtrichtung gedreht
  const sc = Math.min(w, h) / 1600, cx = w / 2, cy = h * .62, px = R.xAt(S.dist), pz = R.zAt(S.dist), hd = R.headAt(S.dist);
  c.save(); c.beginPath(); c.arc(cx, h / 2, Math.min(w, h) / 2 - 2 * d, 0, 7); c.fillStyle = 'rgba(16,20,24,.6)'; c.fill(); c.clip();
  c.translate(cx, cy); c.rotate(-hd);
  c.lineJoin = c.lineCap = 'round';
  c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = 4 * d; c.beginPath();
  const step = 4; for (let i = 0; i <= R.N; i += step) { const x = (R.x[i] - px) * sc, y = (R.z[i] - pz) * sc; i ? c.lineTo(x, y) : c.moveTo(x, y); }
  c.stroke();
  for (const cl of R.climbs) { c.strokeStyle = '#ef4458'; c.beginPath(); for (let i = Math.floor(cl.from / R.step); i <= cl.to / R.step; i += step) { const x = (R.x[i] - px) * sc, y = (R.z[i] - pz) * sc; c.lineTo(x, y); } c.stroke(); }
  if (S.pacer) { const qx = (R.xAt(S.pacer.d) - px) * sc, qy = (R.zAt(S.pacer.d) - pz) * sc; c.fillStyle = '#b06cf0'; c.beginPath(); c.arc(qx, qy, 4 * d, 0, 7); c.fill(); }
  c.restore();
  c.fillStyle = '#ff6a3d'; c.beginPath(); c.moveTo(cx, cy - 8 * d); c.lineTo(cx + 6 * d, cy + 6 * d); c.lineTo(cx - 6 * d, cy + 6 * d); c.fill();
}

/* ---------- Screenshots ---------- */
function shot(caption) {
  if (!S?.world || S.shots.length >= 40) return;
  S.lastShotT = S.samples.length;
  const c = S.world.capture(1280), x = c.getContext('2d'), w = c.width, h = c.height;
  // Datenleiste wie ein Foto-Overlay
  const g = x.createLinearGradient(0, h - 150, 0, h); g.addColorStop(0, 'rgba(10,12,16,0)'); g.addColorStop(1, 'rgba(10,12,16,.85)'); x.fillStyle = g; x.fillRect(0, h - 150, w, 150);
  x.fillStyle = '#fff'; x.font = '700 30px Barlow, Arial'; x.fillText(S.route.name, 28, h - 74);
  x.font = '500 18px Barlow, Arial'; x.fillStyle = '#c9d2da'; x.fillText(caption + ' · ' + new Date().toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }), 28, h - 46);
  const p3 = S.p3.length ? Math.round(S.p3.reduce((a, b) => a + b, 0) / S.p3.length) : 0;
  const items = [[p3 + ' W', 'Leistung'], [(live.heart ?? '–') + '', 'Puls'], [(S.v * 3.6).toFixed(1).replace('.', ',') + ' km/h', 'Tempo'], [fmtKm(S.dist + S.lap * S.route.total) + ' km', 'Distanz'], [Math.round(S.asc) + ' m', 'Höhe'], [fmtT(S.t), 'Zeit']];
  let xx = w - 28; x.textAlign = 'right';
  for (let i = items.length - 1; i >= 0; i--) { x.fillStyle = '#fff'; x.font = '700 30px Barlow, Arial'; x.fillText(items[i][0], xx, h - 52); x.fillStyle = '#9aa7b3'; x.font = '500 15px Barlow, Arial'; x.fillText(items[i][1], xx, h - 30); xx -= Math.max(x.measureText(items[i][0]).width, 90) + 34; }
  x.textAlign = 'left'; x.fillStyle = '#ff6a3d'; x.font = '700 20px Barlow, Arial'; x.fillText('TRITTWERK', 28, 40);
  c.toBlob(b => { if (b) { S.shots.push({ blob: b, caption, t: Math.round(S.t), d: Math.round(S.dist + S.lap * S.route.total) }); if (caption === 'Foto') flash('📷 Foto gespeichert', 900); } }, 'image/jpeg', .86);
  const fl = document.createElement('div'); fl.className = 'shotflash'; S.el.querySelector('.ridewrap').appendChild(fl); setTimeout(() => fl.remove(), 500);
}

/* ---------- Ende ---------- */
async function endRide(auto = false) {
  if (!S) return;
  const prevState = S.state; if (S.state === 'riding') S.state = 'paused';
  if (!S.samples.length) {
    const v = await dialog({ title: 'Fahrt beenden?', html: '<p class="muted">Es wurde noch nichts aufgezeichnet.</p>', buttons: [{ label: 'Weiterfahren', value: 'back' }, { label: 'Beenden', value: 'quit', cls: 'pri' }] });
    if (v === 'quit') { leave(); location.hash = '#/'; } else if (S) S.state = prevState === 'ready' ? 'ready' : prevState; return;
  }
  const v = await dialog({ title: auto ? 'Ziel erreicht' : 'Fahrt beenden?', html: `<p>${fmtKm(S.samples.at(-1).d)} km in ${fmtT(S.t)}.</p><p class="muted small">Gespeicherte Fahrten zählen für Level, Rekorde und Fortschritt.</p>`, buttons: [{ label: 'Weiterfahren', value: 'back', cls: 'ghost' }, { label: 'Verwerfen', value: 'drop' }, { label: 'Speichern', value: 'save', cls: 'pri' }] });
  if (v === 'drop') {
    const ok = await dialog({ title: 'Wirklich verwerfen?', html: '<p class="muted">Die Fahrt und ihre Fotos gehen verloren.</p>', buttons: [{ label: 'Abbrechen', value: false }, { label: 'Verwerfen', value: true, cls: 'danger' }] });
    if (ok) { leave(); location.hash = '#/'; } return;
  }
  if (v !== 'save') { if (S && !S.finished) S.state = prevState === 'auto' ? 'riding' : prevState; return; }
  $('#load', S.el).hidden = false; $('#loadTxt', S.el).textContent = 'Fahrt wird gespeichert …';
  const id = await saveRide(S);
  leave();
  location.hash = '#/summary/' + id + '?neu';
}

let wake = null;
async function lockScreen() { try { if ('wakeLock' in navigator) wake = await navigator.wakeLock.request('screen'); } catch (e) { } }
document.addEventListener('visibilitychange', () => { if (S?.alive && document.visibilityState === 'visible') lockScreen(); });

export function leave() {
  if (!S) return;
  S.alive = false; clearInterval(S.timer); cancelAnimationFrame(S.raf); S.ro?.disconnect();
  document.removeEventListener('keydown', S.key); S.offs.forEach(f => f());
  try { S.world.dispose(); } catch (e) { }
  if (status.trainer === 'on' || demo.on) setPower(Math.min(100, profile.ftp * .4));
  control.target = null;
  if (wake) { wake.release().catch(() => { }); wake = null; }
  if (document.fullscreenElement) document.exitFullscreen().catch(() => { });
  S = null;
}
export const isRiding = () => !!S && S.state !== 'ready' && S.samples.length > 0;
