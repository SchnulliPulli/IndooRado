// Fahransicht: 3D-Welt, HUD, Steuerung des Trainers, Mitfahrer, Aufzeichnung, Screenshots
import { $, esc, fmtT, fmtKm, clamp, bus, toast, dialog, fitCanvas, zoneColor, ZONES, HRZONES } from '../util.js';
import { profile, sel, live, progress, saveSel, levelOf } from '../state.js';
import { setPower, setGrade, control, trainer, status, demo, click } from '../ble.js';
import { GEARS, gearPower, integrate, steadySpeed } from '../physics.js';
import { getRoute, clearRouteCache } from '../routes.js';
import { getWorkout, at as woAt, drawWorkout, total as woTotal } from '../workouts.js';
import { getPlan } from '../plans.js';
import { profileChart } from '../charts.js';
import { ICON } from '../components.js';
import { saveRide } from '../ridesave.js';
import { db } from '../db.js';
import { putLive } from '../sync.js';
import { makeField, stepField, gapOf } from '../npc.js';
import { sound, music } from '../sound.js';
import { tipFor, cadRange } from '../coach.js';
import { saveProfile } from '../state.js';
import { rng, toggleFullscreen, smooth } from '../util.js';
import { applySaved, arrange, editMode, updateExtras } from '../hudlayout.js';
const layout = () => { const w = $('#rw', S?.el); if (w) { applySaved(w); arrange(w); } };

// Tageszeit und Wetter: fest gewählt oder automatisch (Uhrzeit, Wetter des Tages)
export function resolveEnv() {
  const h = new Date().getHours() + new Date().getMinutes() / 60;
  const time = sel.time && sel.time !== 'auto' ? sel.time : h >= 5 && h < 9 ? 'morning' : h < 17.5 && h >= 9 ? 'day' : h >= 17.5 && h < 21 ? 'evening' : 'night';
  const r = rng(Math.floor(Date.now() / 864e5) * 7919)(), weather = sel.weather && sel.weather !== 'auto' ? sel.weather : r < .5 ? 'clear' : r < .78 ? 'cloudy' : r < .9 ? 'rain' : 'fog';
  return { time, weather };
}
const ENV_L = { morning: 'Morgen', day: 'Tag', evening: 'Abend', night: 'Nacht', clear: 'klar', cloudy: 'bewölkt', rain: 'Regen', fog: 'Nebel' };

const VIEWS = ['Verfolger', 'Weit', 'Seite', 'Vogel', 'Fahrer'];
const SPEED = +new URLSearchParams(location.search).get('speed') || 1; // nur zum Testen
const NPC_COUNT = { high: 14, medium: 10, low: 6 };
let S = null;

export async function render(el) {
  if (S?.parked) return unpark(el);
  el.innerHTML = `<div class="ridewrap" id="rw">
    <canvas id="gl"></canvas>
    <div class="loading" id="load"><div class="spinner"></div><div id="loadTxt">Welt wird aufgebaut …</div></div>
    <div class="hud-top" data-drag="top">
      <div class="hud-row">
        <div class="hbox"><b id="hHr" class="num hr">--</b><span>Puls</span></div>
        <div class="hbox"><b id="hCad" class="num cad">--</b><span>U/min</span></div>
        <div class="hbox main"><b id="hPw" class="num">0</b><span><i id="hWkg">0,0</i> W/kg</span><div class="zonebar"><i id="hZone"></i></div></div>
        <div class="hbox"><b id="hSpd" class="num">0,0</b><span>km/h</span></div>
        <div class="hbox"><b id="hDist" class="num">0,0</b><span>km</span></div>
        <div class="hbox"><b id="hTime" class="num">0:00</b><span id="hTimeL">Zeit</span></div>
        <div class="hbox"><b id="hAsc" class="num">0</b><span>Hm</span></div>
      </div>
      <div class="hud-sub num small" id="hSub"></div>
    </div>
    <div class="hud-left">
      <div class="hud-wo" id="woBox" data-drag="wo" hidden>
        <div class="row between"><div style="flex:1"><div class="small muted" id="woName"></div><div class="wo-step" id="woStep"></div></div><div class="wo-left num" id="woLeft"></div></div>
        <div class="bar thin"><i id="woSegBar"></i></div>
        <div class="wo-target"><span class="num" id="woTgt">–</span><span class="small">Ziel W</span><span class="wo-cad small" id="woCad"></span><span class="wo-next small muted" id="woNext"></span></div>
        <div class="ontarget" id="onT"><i id="onTi"></i><span class="small" id="onTt"></span></div>
        <div class="cadtarget" id="cadT" hidden><span class="small">Kadenz</span><div class="cadbar"><b id="cadZone"></b><i id="cadMark"></i></div><span class="small num" id="cadTxt"></span></div>
        <div class="tip small" id="woTip" hidden></div>
        <canvas id="woChart" class="wo-chart"></canvas>
        <div class="row between small num"><span id="woTot"></span><span id="woSegN"></span></div>
        <div class="row between small"><span>Intensität <b id="woOff">100</b> % <span class="adapt" id="adapt" title="Adaptive Steuerung"></span></span><span class="row" style="gap:4px"><button class="btn xs" id="woM">−</button><button class="btn xs" id="woP">+</button><button class="btn xs" id="woSkip">Weiter</button></span></div>
      </div>
      <div class="riders" id="riders" data-drag="riders"></div>
    </div>
    <div class="hud-right" data-drag="right">
      <div class="gradebox"><b class="num" id="hGrade">0,0</b><span>% Steigung</span><div class="gradeicon" id="gIcon"></div></div>
      <div class="gearbox"><button class="gbtn" id="gUp" aria-label="Hochschalten">+</button><div class="gearval"><b class="num" id="hGear">12</b><span id="hGearSub">Gang</span></div><button class="gbtn" id="gDn" aria-label="Runterschalten">−</button></div>
      <div class="hbox small draftbox" id="draftBox" hidden><b class="num" id="hDraft">0 %</b><span>Windschatten</span></div>
      <div class="hbox small" id="pacerBox" hidden><b class="num" id="hPacer">0 m</b><span>zum Schrittmacher</span></div>
    </div>
    <div class="msgstack" id="msgStack" data-drag="msg">
      <div class="climb" id="climbBox" hidden><div class="climb-name" id="clName"></div><div class="climb-row num"><span id="clLeft"></span><span id="clGrade"></span><span id="clTime"></span></div><div class="bar"><i id="clBar"></i></div></div>
      <div class="banner" id="banner"></div>
      <div class="xpfloat" id="xpFloat"></div>
    </div>
    <div class="xlayer"></div>
    <div class="editbar" id="editBar" hidden></div>
    <div class="hud-bottom">
      <div class="miniwrap" data-drag="mini"><canvas id="mini" class="minimap" title="Karte öffnen (K)"></canvas></div>
      <div class="elevwrap" data-drag="elev"><canvas id="elev"></canvas><div class="elevtxt small" id="elevTxt"></div></div>
    </div>
    <div class="toolbar">
      <button class="tbtn" id="tPause" title="Pause (Leertaste)">${ICON.pause}<span>Pause</span></button>
      <button class="tbtn" id="tMenu" title="Pausieren und ins Menü">${ICON.home}<span>Menü</span></button>
      <button class="tbtn" id="tView" title="Kamera (C)">${ICON.view}<span>Kamera</span></button>
      <button class="tbtn" id="tShot" title="Foto (P)">${ICON.camera}<span>Foto</span></button>
      <button class="tbtn" id="tMode" title="Widerstand">${ICON.workout}<span id="tModeL">Gänge</span></button>
      <button class="tbtn" id="tNpc" title="Mitfahrer (N)">${ICON.ride}<span id="tNpcL">Feld an</span></button>
      <button class="tbtn" id="tRideOn" title="Ride On an den nächsten Fahrer (R)"><b class="ro">👍</b><span>Ride On</span></button>
      <button class="tbtn" id="tMap" title="Karte und Beamen (K)">${ICON.route}<span>Karte</span></button>
      <button class="tbtn" id="tEnv" title="Tageszeit und Wetter (W)">${ICON.sun}<span>Wetter</span></button>
      <button class="tbtn" id="tSnd" title="Ton (M)">${ICON.sound}<span id="tSndL">Ton</span></button>
      <button class="tbtn" id="tLayout" title="Anzeige anordnen">${ICON.layout}<span>Anordnen</span></button>
      <button class="tbtn" id="tFull" title="Vollbild">${ICON.full}<span>Vollbild</span></button>
      <button class="tbtn stop" id="tEnd" title="Beenden">${ICON.stop}<span>Beenden</span></button>
    </div>
    <div class="envpanel" id="envPanel" hidden>
      <div class="small muted">Tageszeit</div>
      <div class="seg sm" id="envTime">${[['auto', 'Auto'], ['morning', 'Morgen'], ['day', 'Tag'], ['evening', 'Abend'], ['night', 'Nacht']].map(([k, l]) => `<button data-v="${k}">${l}</button>`).join('')}</div>
      <div class="small muted">Wetter</div>
      <div class="seg sm" id="envWeather">${[['auto', 'Auto'], ['clear', 'Klar'], ['cloudy', 'Wolken'], ['rain', 'Regen'], ['fog', 'Nebel']].map(([k, l]) => `<button data-v="${k}">${l}</button>`).join('')}</div>
      <div class="small muted" id="envNow"></div>
    </div>
    <div class="bigmap" id="bigMap" hidden>
      <div class="bigmap-card">
        <div class="row between"><b id="bmTitle">Karte</b><button class="btn sm ghost" id="bmClose">Schließen</button></div>
        <canvas id="bmCanvas"></canvas>
        <canvas id="bmProf" class="bmprof"></canvas>
        <div class="row between"><span class="small muted" id="bmInfo">Tippe auf die Strecke oder ins Höhenprofil, um ein Ziel zu wählen.</span><button class="btn pri" id="bmGo" disabled>Hierhin beamen</button></div>
        <div class="row small" id="bmQuick"></div>
      </div>
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
    climbs: route.climbs.map(c => ({ ...c, state: 'pending' })), climbLog: [], sprints: route.sprints.map(c => ({ ...c, state: 'pending' })), sprintLog: [],
    lastShotT: 0, lastSeg: -1, woDone: false, finished: false, overtakes: 0, gates: 0, draft: 0, wheel: null, rideOnsGot: 0, rideOnsGiven: 0, lapT0: 0, nextRideOn: 60 + Math.random() * 120,
    pacer: sel.pacer ? { d: 0, v: 0, crank: 0, w: sel.pacer * profile.kg } : null, lastHud: 0, alive: true, offs: [],
    adapt: { on: sel.adaptive !== false, lowCad: 0, okCad: 0, cap: false, hrHigh: 0, lastAdj: -999, note: '', noteT: 0, weak: 0 },
    np: { buf: [], bs: 0, s4: 0, n: 0 }, field: [], npcOn: sel.npcs !== false, odo: 0, beamed: false, lastBeep: -1, nextDrink: (profile.drinkEvery || 15) * 60,
  };
  S.env = resolveEnv(); world.setEnv(S.env);
  // Geist: beste bisherige Fahrt auf dieser Strecke (nicht gebeamt)
  if (sel.ghost !== false) {
    const cand = (await db.all('rides')).filter(r => r.routeId === route.id && !r.beamed && r.samples?.length > 120);
    const best = progress.routeBest[route.id] && cand.find(r => r.id === progress.routeBest[route.id].rideId) || cand.sort((a, b) => b.sum.avgV - a.sum.avgV)[0];
    if (best) { S.ghost = { d: Float32Array.from(best.samples, s => s.d), date: best.date }; world.setGhost(true); }
  }
  world.setPacer(!!S.pacer);
  world.view = clamp(profile.camView ?? 0, 0, 4); world.showNames = profile.npcNames !== false;
  if (profile.fsOnRide && !document.fullscreenElement) toggleFullscreen();
  if (SPEED !== 1) { window.__tw = S; window.__twHud = () => hud(); } // Testhilfe
  const plan = wo?.planId ? getPlan(wo.planId) : null;
  S.planLabel = plan ? `${plan.name} · Woche ${wo.week} · Einheit ${wo.n}` : null;

  $('#loadTxt').textContent = 'Gelände wird erzeugt …';
  await new Promise(r => setTimeout(r, 30));
  world.resize(); world.preload(0);
  if (S.npcOn) spawnField();
  $('#load').hidden = true;
  if (wo) { $('#woBox').hidden = false; $('#woName').textContent = S.planLabel ? S.planLabel + ' · ' + wo.name : wo.name; }
  if (S.pacer) $('#pacerBox').hidden = false;
  updMode(); updGear(); updNpcBtn(); updSnd(); updEnvPanel();
  bindUi();
  S.ro = new ResizeObserver(() => { world.resize(); requestAnimationFrame(layout); }); S.ro.observe(canvas);
  requestAnimationFrame(layout);
  S.timer = setInterval(tick, 100);
  sound.unlock(); music.start();
  S.lastFrame = performance.now();
  const frame = now => {
    if (!S?.alive || S.parked) return;
    S.frameFn(now);
    S.raf = requestAnimationFrame(frame);
  };
  S.frameFn = now => {
    const dt = Math.min(.1, (now - S.lastFrame) / 1000); S.lastFrame = now;
    // Die Physik rechnet mit 10 Hz. Für ruckelfreie Bilder pro Frame weiterrechnen und sanft nachführen.
    const R = S.route, moving = S.state === 'riding';
    const smoothD = (o, key, d, v) => {
      if (o[key] == null) { o[key] = d; return d; }
      let x = o[key] + (moving ? v * dt * SPEED : 0); const gap = gapOf(R, d, x);
      if (Math.abs(gap) > 40) x = d; else x += gap * Math.min(1, dt * 3);
      if (R.loop) x = ((x % R.total) + R.total) % R.total; else x = clamp(x, 0, R.total);
      return (o[key] = x);
    };
    const dist = smoothD(S, 'rdist', S.dist, S.v);
    S.rcrank = (S.rcrank || 0) + (S.v > .3 || moving ? (live.cadence || 0) / 60 * Math.PI * 2 * dt : 0);
    let npcs = null;
    if (S.npcOn) npcs = S.field.map(n => { const d = smoothD(n, 'rd', n.d, n.v); n.rc = (n.rc || 0) + (moving ? n.cadence / 60 * Math.PI * 2 * dt : 0); return { d, lat: n.lat, v: n.v, crank: n.rc }; });
    const pd = S.pacer ? smoothD(S.pacer, 'rd', S.pacer.d, S.pacer.v) : null;
    const ghostDist = S.ghost && S.ghostPos != null ? smoothD(S, 'rghost', S.ghostPos, S.v) : null;
    world.update({ dist, ghostDist, v: S.v, crank: S.rcrank, pacerDist: pd, pacerV: S.pacer?.v, pacerCrank: S.pacer?.crank, npcs }, dt);
    if (now - S.lastHud > 200) { S.lastHud = now; hud(); }
  };
  S.raf = requestAnimationFrame(frame);
  lockScreen();
}
function spawnField() {
  const q = S.world.qKey;
  const cnt = profile.npcCount == null || profile.npcCount === 'auto' ? NPC_COUNT[q] || 10 : clamp(+profile.npcCount, 1, 24);
  S.field = makeField(S.route, profile, cnt);
  for (const n of S.field) n.gap = gapOf(S.route, n.d, S.dist);
  S.world.setRiders(S.field.map(n => n.look));
}

function bindUi() {
  const el = S.el;
  $('#gUp', el).onclick = () => shift(1); $('#gDn', el).onclick = () => shift(-1);
  $('#tPause', el).onclick = togglePause;
  $('#tView', el).onclick = () => flash('Kamera: ' + VIEWS[S.world.cycleView()]);
  $('#tShot', el).onclick = () => shot('Foto');
  $('#tMode', el).onclick = cycleMode;
  $('#tNpc', el).onclick = toggleNpcs;
  $('#tFull', el).onclick = toggleFullscreen;
  $('#tEnd', el).onclick = endRide;
  $('#woM', el).onclick = () => { S.wOff = clamp(S.wOff - 2, -40, 40); };
  $('#woP', el).onclick = () => { S.wOff = clamp(S.wOff + 2, -40, 40); };
  $('#woSkip', el).onclick = () => { const w = woAt(S.wo, S.wT); if (w && !w.done) S.wT += w.left + .01; };
  $('#tSnd', el).onclick = toggleSound;
  $('#tRideOn', el).onclick = giveRideOn;
  // Workout-Box einklappen (Kopfzeile antippen)
  $('#woBox', el).classList.toggle('collapsed', !!profile.woCollapsed);
  $('#woName', el).parentElement.parentElement.onclick = () => { profile.woCollapsed = !profile.woCollapsed; saveProfile(); $('#woBox', el).classList.toggle('collapsed', profile.woCollapsed); requestAnimationFrame(layout); };
  $('#tLayout', el).onclick = () => { closeMap(); $('#envPanel', el).hidden = true; editMode($('#rw', el), true, () => layout()); };
  $('#rw', el).addEventListener('hudresize', () => { S.miniCache = null; hud(); });
  $('#tMenu', el).onclick = () => { if (!S.samples.length) { leave(); location.hash = '#/'; return; } location.hash = '#/'; };
  $('#tEnv', el).onclick = () => { $('#envPanel', el).hidden = !$('#envPanel', el).hidden; };
  $('#envTime', el).onclick = e => { const b = e.target.closest('[data-v]'); if (b) { sel.time = b.dataset.v; saveSel(); applyEnv(); } };
  $('#envWeather', el).onclick = e => { const b = e.target.closest('[data-v]'); if (b) { sel.weather = b.dataset.v; saveSel(); applyEnv(); } };
  $('#tMap', el).onclick = openMap; $('#mini', el).onclick = openMap; $('#mini', el).style.pointerEvents = 'auto';
  $('#bmClose', el).onclick = closeMap;
  $('#bigMap', el).onclick = e => { if (e.target.id === 'bigMap') closeMap(); };
  $('#bmGo', el).onclick = () => { if (S.mapPick != null) beam(S.mapPick); };
  $('#bmCanvas', el).onclick = e => mapClick(e, 'map'); $('#bmProf', el).onclick = e => mapClick(e, 'prof');
  $('#bmQuick', el).onclick = e => { const b = e.target.closest('[data-d]'); if (b) { S.mapPick = +b.dataset.d; drawBigMap(); } };
  $('#adapt', el).onclick =() => { S.adapt.on = !S.adapt.on; sel.adaptive = S.adapt.on; saveSel(); S.adapt.cap = false; flash('Adaptive Steuerung ' + (S.adapt.on ? 'an' : 'aus')); };
  S.key = e => {
    if (e.target.matches('input,select,textarea')) return;
    if (e.key === 'ArrowUp' || e.key === '+') { shift(1); e.preventDefault(); }
    else if (e.key === 'ArrowDown' || e.key === '-') { shift(-1); e.preventDefault(); }
    else if (e.key === ' ') { togglePause(); e.preventDefault(); }
    else if (e.key === 'c' || e.key === 'C') $('#tView').click();
    else if (e.key === 'p' || e.key === 'P') shot('Foto');
    else if (e.key === 'n' || e.key === 'N') toggleNpcs();
    else if (e.key === 'r' || e.key === 'R') giveRideOn();
    else if (e.key === 'm' || e.key === 'M') toggleSound();
    else if (e.key === 'k' || e.key === 'K') { if ($('#bigMap').hidden) openMap(); else closeMap(); }
    else if (e.key === 'w' || e.key === 'W') $('#tEnv').click();
    else if (e.key === 'Escape') { closeMap(); $('#envPanel').hidden = true; }
    else if (e.key >= '1' && e.key <= '5') { S.world.view = +e.key - 1; S.world.camInit = false; flash('Kamera: ' + VIEWS[S.world.view]); }
  };
  document.addEventListener('keydown', S.key);
  S.offs.push(bus.on('shift', d => shift(d)));
  // Zwift Click: drei schnelle Klicks auf dieselbe Taste überspringen das Intervall, einzelne Klicks schalten
  S.offs.push(bus.on('clickpress', id => {
    const now = performance.now(), P = S.presses = (S.presses || []).filter(p => now - p.t < 900 && p.id === id);
    P.push({ id, t: now });
    if (P.length < 3 || profile.tripleSkip === false || !S.wo) return;
    const wi = woAt(S.wo, S.wT); if (!wi || wi.done) return;
    // die drei Schaltvorgänge zurücknehmen
    for (const s of (S.shiftLog || []).filter(s => now - s.t < 1000).slice(-3)) {
      if (s.k === 'woff') S.wOff = clamp(S.wOff - s.dir * 2, -40, 40);
      else if (s.k === 'erg') { S.ergW = clamp(S.ergW - s.dir * 10, 30, profile.maxW); sel.ergW = S.ergW; }
      else if (s.k === 'gear') { S.gear = clamp(S.gear - s.dir, 0, GEARS.length - 1); sel.gear = S.gear; }
    }
    S.shiftLog = []; S.presses = []; updGear();
    // Plus-Taste: nächstes Intervall. Minus-Taste: Intervall neu starten, in den ersten 10 s eins zurück.
    if (click.map?.[id] === 'down') {
      const into = wi.g.dur - wi.left;
      if (into > 10 || wi.i === 0) { S.wT = wi.start + .01; flash('⏮ Intervall ' + (wi.i + 1) + ' von vorn', 1500); }
      else { const prev = woAt(S.wo, wi.start - .5); S.wT = prev.start + .01; flash('⏮ Zurück zu Intervall ' + wi.i, 1500); }
      S.lastSeg = -2; S.gateFor = null; S.world.setGate(null);
    } else { S.wT += wi.left + .01; flash('⏭ Intervall übersprungen', 1500); }
    sound.whoosh();
  }));
}

/* ---------- Steuerung ---------- */
function shift(dir) {
  const w = S.wo && S.state !== 'ready' ? woAt(S.wo, S.wT) : null, log = k => { (S.shiftLog = (S.shiftLog || []).slice(-5)).push({ t: performance.now(), dir, k }); };
  if (w && !w.done && w.target != null) { S.wOff = clamp(S.wOff + dir * 2, -40, 40); log('woff'); flash(`Intensität ${100 + S.wOff} %`, 700); return; }
  if (S.mode === 'erg') { S.ergW = clamp(S.ergW + dir * 10, 30, profile.maxW); sel.ergW = S.ergW; saveSel(); log('erg'); flash(S.ergW + ' W', 700); return; }
  if (S.mode === 'hr') { sel.hrTarget = clamp((sel.hrTarget || 140) + dir * 2, 80, profile.hrMax - 5); saveSel(); updGear(); flash('Zielpuls ' + sel.hrTarget, 700); return; }
  if (S.mode === 'sim') { flash('Im Steigungsmodus gibt es keine virtuellen Gänge', 1200); return; }
  const g0 = S.gear; S.gear = clamp(S.gear + dir, 0, GEARS.length - 1); if (S.gear !== g0) log('gear'); sel.gear = S.gear; updGear(); sound.shift(dir > 0);
  flash((dir > 0 ? '▲ ' : '▼ ') + 'Gang ' + (S.gear + 1), 600);
}
function updGear() {
  const el = S.el;
  if (S.mode === 'erg') { $('#hGear', el).textContent = S.ergW; $('#hGearSub', el).textContent = 'W fix'; }
  else if (S.mode === 'sim') { $('#hGear', el).textContent = '–'; $('#hGearSub', el).textContent = 'Steigung'; }
  else if (S.mode === 'hr') { $('#hGear', el).textContent = sel.hrTarget || 140; $('#hGearSub', el).textContent = 'Zielpuls · ' + Math.round(S.hrW || 0) + ' W'; }
  else { $('#hGear', el).textContent = S.gear + 1; $('#hGearSub', el).textContent = 'Gang · ' + GEARS[S.gear].toFixed(2).replace('.', ','); }
}
const MODES = { gear: 'Gänge', sim: 'Steigung', erg: 'ERG', hr: 'Puls' };
function cycleMode() { const k = Object.keys(MODES); S.mode = k[(k.indexOf(S.mode) + 1) % k.length]; sel.mode = S.mode; saveSel(); updMode(); trainer.last = ''; flash('Widerstand: ' + { gear: 'virtuelle Gänge', sim: 'Steigung an Trainer', erg: 'feste Wattzahl', hr: 'Zielpuls, der Trainer regelt die Watt' }[S.mode]); }
function updMode() { $('#tModeL', S.el).textContent = MODES[S.mode]; updGear(); }
function toggleNpcs() {
  S.npcOn = !S.npcOn; sel.npcs = S.npcOn; saveSel();
  if (S.npcOn && !S.field.length) spawnField();
  if (!S.npcOn) { S.world.npcs.forEach(n => n.rider.root.visible = false); S.draft = 0; }
  updNpcBtn(); flash(S.npcOn ? 'Mitfahrer an' : 'Mitfahrer aus');
}
// Ride On: Daumen hoch zwischen Fahrern (gibt etwas XP)
function gotRideOn(name) { S.rideOnsGot++; flash('👍 Ride On von ' + name, 1800); xpPop('+2 XP Ride On'); sound.pass(); }
function giveRideOn() {
  if (!S.npcOn || !S.field.length) { flash('Kein Fahrer in der Nähe', 1000); return; }
  const n = S.field.reduce((a, b) => Math.abs(gapOf(S.route, b.d, S.dist)) < Math.abs(gapOf(S.route, a.d, S.dist)) ? b : a);
  if (Math.abs(gapOf(S.route, n.d, S.dist)) > 150) { flash('Kein Fahrer in der Nähe', 1000); return; }
  if (S.t - (S.lastGive || -99) < 5) return;
  S.lastGive = S.t; S.rideOnsGiven++; flash('👍 Ride On an ' + n.name, 1400); xpPop('+1 XP');
  if (Math.random() < .6) setTimeout(() => S && gotRideOn(n.name), 1500 + Math.random() * 2500);
}
function toggleSound() { sound.unlock(); const on = sound.toggle(); saveProfile(); updSnd(); flash(on ? '🔊 Ton an' : '🔇 Ton aus', 900); }
function updSnd() { const on = profile.soundOn !== false; $('#tSnd', S.el).innerHTML = (on ? ICON.sound : ICON.mute) + `<span>${on ? 'Ton' : 'Stumm'}</span>`; if (!on) sound.silence(); }
function applyEnv() { S.env = resolveEnv(); S.world.setEnv(S.env); updEnvPanel(); }
function updEnvPanel() {
  const el = S.el;
  for (const b of $('#envTime', el).children) b.setAttribute('aria-pressed', String(b.dataset.v === (sel.time || 'auto')));
  for (const b of $('#envWeather', el).children) b.setAttribute('aria-pressed', String(b.dataset.v === (sel.weather || 'auto')));
  $('#envNow', el).textContent = `Jetzt: ${ENV_L[S.env.time]}, ${ENV_L[S.env.weather]}${(sel.time || 'auto') === 'auto' ? ' · Tageszeit folgt der Uhr' : ''}`;
}

/* ---------- Große Karte und Beamen ---------- */
function openMap() { const m = $('#bigMap', S.el); m.hidden = false; S.mapPick = null; $('#bmGo', S.el).disabled = true; $('#bmTitle', S.el).textContent = S.route.name + (S.route.loop ? ' · Rundkurs' : '');
  const R = S.route, q = [['Start', 0], ...R.climbs.map(c => ['⛰ ' + c.name, c.from - 50]), ...R.sprints.map(c => ['🏁 ' + c.name, c.from - 50]), ...R.towns.map(t => ['🏘 ' + t.name, t.from]), ...R.tunnels.map((t, i) => ['Tunnel ' + (i + 1), t.from - 80])].filter(x => x[1] >= 0 && x[1] < R.total - 20);
  $('#bmQuick', S.el).innerHTML = q.map(([l, d]) => `<button class="chipb" data-d="${Math.round(d)}">${esc(l)}</button>`).join('');
  requestAnimationFrame(drawBigMap); }
function closeMap() { const m = $('#bigMap', S?.el); if (m) m.hidden = true; }
function mapGeo(cv) {
  const R = S.route, { w, h, d } = fitCanvas(cv);
  if (!S.bounds) { let a = Infinity, b = -Infinity, c = Infinity, e = -Infinity; for (let i = 0; i <= R.N; i += 4) { a = Math.min(a, R.x[i]); b = Math.max(b, R.x[i]); c = Math.min(c, R.z[i]); e = Math.max(e, R.z[i]); } S.bounds = [a, b, c, e]; }
  const [a, b, c, e] = S.bounds;
  const pad = 18 * d, s = Math.min((w - 2 * pad) / (b - a || 1), (h - 2 * pad) / (e - c || 1)), ox = (w - (b - a) * s) / 2, oz = (h - (e - c) * s) / 2;
  return { w, h, d, X: x => ox + (x - a) * s, Y: z => oz + (z - c) * s };
}
function drawRouteMap(cv, big, layer = 'all') {
  const R = S.route, G = mapGeo(cv), c = cv.getContext('2d'), d = G.d;
  if (layer !== 'dynamic') c.clearRect(0, 0, G.w, G.h);
  c.lineJoin = c.lineCap = 'round';
  if (layer !== 'dynamic') drawStatic(R, G, c, d, big);
  if (layer === 'static') return G;
  dynamicLayer(R, G, c, d, big);
  return G;
}
function drawStatic(R, G, c, d, big) {
  const path = (from, to, color, wd) => { c.strokeStyle = color; c.lineWidth = wd * d; c.beginPath(); for (let i = Math.max(0, Math.floor(from / R.step)); i <= Math.min(R.N, to / R.step); i += 2) { const x = G.X(R.x[i]), y = G.Y(R.z[i]); i ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke(); };
  path(0, R.total, 'rgba(0,0,0,.5)', big ? 7 : 5); path(0, R.total, '#e6ebf0', big ? 4 : 2.6);
  for (const t of R.tunnels) path(t.from, t.to, '#56606a', big ? 4 : 2.6);
  for (const cl of R.climbs) path(cl.from, cl.to, '#ef4458', big ? 4 : 2.6);
  for (const s of R.sprints) path(s.from, s.to, '#4fd18b', big ? 4 : 2.6);
  for (const t of R.towns) { const m = (t.from + t.to) / 2, x = G.X(R.xAt(m)), y = G.Y(R.zAt(m)); c.fillStyle = '#ffd23f'; c.fillRect(x - 3 * d, y - 3 * d, 6 * d, 6 * d); if (big) { c.font = `600 ${12 * d}px Barlow, sans-serif`; c.fillText(t.name, x + 6 * d, y + 4 * d); } }
  if (big) for (const cl of R.climbs) { const x = G.X(R.xAt(cl.to)), y = G.Y(R.zAt(cl.to)); c.fillStyle = '#ff8b97'; c.font = `600 ${12 * d}px Barlow, sans-serif`; c.fillText('▲ ' + cl.name, x + 6 * d, y - 4 * d); }
  if (!R.loop) { c.fillStyle = '#fff'; const sx = G.X(R.x[0]), sy = G.Y(R.z[0]); c.beginPath(); c.arc(sx, sy, 4 * d, 0, 7); c.fill(); const ex = G.X(R.x[R.N]), ey = G.Y(R.z[R.N]); c.fillStyle = '#111'; c.fillRect(ex - 4 * d, ey - 4 * d, 8 * d, 8 * d); }
}
function dynamicLayer(R, G, c, d, big) {
  if (S.npcOn) for (const n of S.field) { c.fillStyle = n.look.jersey; c.beginPath(); c.arc(G.X(R.xAt(n.d)), G.Y(R.zAt(n.d)), (big ? 3.5 : 2.2) * d, 0, 7); c.fill(); }
  if (S.pacer) { c.fillStyle = '#b06cf0'; c.beginPath(); c.arc(G.X(R.xAt(S.pacer.d)), G.Y(R.zAt(S.pacer.d)), 3.5 * d, 0, 7); c.fill(); }
  // eigene Position mit Blickrichtung
  const px = G.X(R.xAt(S.dist)), py = G.Y(R.zAt(S.dist)), hd = R.headAt(S.dist);
  c.save(); c.translate(px, py); c.rotate(hd); c.fillStyle = '#ff6a3d'; c.strokeStyle = '#fff'; c.lineWidth = 1.5 * d; const k = big ? 1.4 : 1;
  c.beginPath(); c.moveTo(0, -9 * d * k); c.lineTo(6 * d * k, 6 * d * k); c.lineTo(-6 * d * k, 6 * d * k); c.closePath(); c.fill(); c.stroke(); c.restore();
  if (big && S.mapPick != null) { const x = G.X(R.xAt(S.mapPick)), y = G.Y(R.zAt(S.mapPick)); c.strokeStyle = '#3fa7f5'; c.lineWidth = 3 * d; c.beginPath(); c.arc(x, y, 9 * d, 0, 7); c.stroke(); c.fillStyle = '#3fa7f5'; c.beginPath(); c.arc(x, y, 3 * d, 0, 7); c.fill(); }
}
function drawBigMap() {
  if (!S || $('#bigMap', S.el).hidden) return;
  drawRouteMap($('#bmCanvas', S.el), true);
  const R = S.route, n = 300, dist = [], ele = []; for (let i = 0; i <= n; i++) { const d = R.total * i / n; dist.push(d); ele.push(R.eleAt(d)); }
  profileChart($('#bmProf', S.el), dist, ele, { pos: S.dist, ghost: S.mapPick, climbs: R.climbs });
  if (S.mapPick != null) { const d = S.mapPick; $('#bmInfo', S.el).textContent = `Ziel: km ${fmtKm(d)} · ${Math.round(R.eleAt(d))} m ü. NN · ${R.gradeAt(d).toFixed(1).replace('.', ',')} %${R.townAt(d) ? ' · ' + R.townAt(d).name : ''}`; $('#bmGo', S.el).disabled = false; }
}
function mapClick(e, kind) {
  const R = S.route, cv = e.currentTarget, rect = cv.getBoundingClientRect(), dpr = cv.width / rect.width, mx = (e.clientX - rect.left) * dpr, my = (e.clientY - rect.top) * dpr;
  if (kind === 'prof') S.mapPick = clamp(mx / cv.width, 0, 1) * R.total;
  else { const G = mapGeo(cv); let best = -1, bd = Infinity; for (let i = 0; i <= R.N; i++) { const dd = (G.X(R.x[i]) - mx) ** 2 + (G.Y(R.z[i]) - my) ** 2; if (dd < bd) { bd = dd; best = i; } } if (Math.sqrt(bd) > 40 * G.d) return; S.mapPick = best * R.step; }
  S.mapPick = clamp(S.mapPick, 0, R.total - 30); drawBigMap();
}
// Beamen: an eine andere Stelle springen. Gefahrene Distanz zählt weiter, Bestzeiten dieser Fahrt werden nicht gewertet.
async function beam(d) {
  const R = S.route; closeMap(); sound.whoosh();
  $('#load', S.el).hidden = false; $('#loadTxt', S.el).textContent = 'Beamen …';
  await new Promise(r => setTimeout(r, 30));
  S.dist = d; S.lastE = null; S.beamed = true; S.gateFor = null; S.world.setGate(null);
  for (const c of [...S.climbs, ...S.sprints]) c.state = d > c.from ? 'done' : 'pending';
  if (S.pacer) S.pacer.d = d;
  if (S.npcOn) { for (const n of S.field) { const off = (n.i % 2 ? 1 : -1) * (20 + (n.i * 37) % 300); n.d = R.loop ? ((d + off) % R.total + R.total) % R.total : clamp(d + off, 0, R.total - 10); n.v = S.v; n.gap = gapOf(R, n.d, d); } }
  S.world.camInit = false; S.world.preload(d);
  $('#load', S.el).hidden = true; flash('Gebeamt nach km ' + fmtKm(d), 1800);
}
function updNpcBtn() { $('#tNpcL', S.el).textContent = S.npcOn ? 'Feld an' : 'Feld aus'; $('#riders', S.el).hidden = !S.npcOn; }
function togglePause() {
  if (S.state === 'riding' || S.state === 'auto') { S.state = 'paused'; flash('Pause'); }
  else if (S.state === 'paused') { S.state = 'riding'; flash('Weiter'); }
  else if (S.state === 'ready') { begin(); }
  $('#tPause', S.el).innerHTML = (S.state === 'paused' ? ICON.play + '<span>Weiter</span>' : ICON.pause + '<span>Pause</span>');
}
function begin() { S.state = 'riding'; S.startWall = Date.now(); $('#startCard', S.el).hidden = true; flash('Los geht’s!', 1000); }

let bannerT = 0;
function flash(txt, ms = 1600) { const b = $('#banner', S?.el); if (!b) return; b.textContent = txt; b.classList.add('show'); requestAnimationFrame(layout); clearTimeout(bannerT); bannerT = setTimeout(() => b.classList.remove('show'), ms); }
function xpPop(txt) { if (profile.xpPops === false) return; const f = $('#xpFloat', S.el); if (!f) return; const s = document.createElement('span'); s.textContent = txt; f.appendChild(s); setTimeout(() => s.remove(), 1600); }
function note(txt) { S.adapt.note = txt; S.adapt.noteT = performance.now(); if (/gesenkt|hoch|nicht/.test(txt)) sound.warn(); }

/* ---------- Simulation (10 Hz, auch im Hintergrund) ---------- */
// Live-Fahrt für die Companion-Ansicht (läuft im Simulationstakt, also auch bei verdecktem Fenster)
function liveShare() {
  if (profile.liveShare === false || S.state === 'ready' || S.parked || performance.now() - (S.liveT || 0) < 5000) return;
  S.liveT = performance.now();
  const R = S.route, wi = S.wi, p3 = S.p3.length ? S.p3.reduce((a, b) => a + b, 0) / S.p3.length : 0, np = S.np.n ? Math.pow(S.np.s4 / S.np.n, .25) : p3;
  putLive({ state: S.state, route: R.name, routeId: R.id, total: R.total, loop: R.loop, pos: S.dist, odo: Math.round(S.odo), t: Math.round(S.t), p: Math.round(p3), hr: live.heart, cad: live.cadence != null ? Math.round(live.cadence) : null, v: +(S.v * 3.6).toFixed(1), asc: Math.round(S.asc), kj: Math.round(S.kj), np: Math.round(np), grade: +R.gradeAt(S.dist).toFixed(1),
    wo: S.wo ? { name: S.wo.name, i: wi && !wi.done ? wi.i + 1 : null, n: S.wo.segs.length, left: wi && !wi.done ? Math.round(wi.left) : 0, target: S.target ? Math.round(S.target) : null, done: Math.round(S.wT), total: woTotal(S.wo) } : null,
    ghost: S.ghost ? Math.round(S.ghostGap) : null, place: S.npcOn ? S.field.filter(n => gapOf(R, n.d, S.dist) > 0).length + 1 : null });
}
function tick() {
  if (!S?.alive) return;
  liveShare();
  // Im Hintergrund drosselt der Browser Timer stark, deshalb die verstrichene Zeit in kleinen Schritten nachrechnen
  const now = performance.now(); let rest = Math.min(300, (now - (S.lastTick || now)) / 1000) * SPEED; S.lastTick = now;
  let first = true;
  while (rest > 1e-6) { const h = Math.min(.2, rest); rest -= h; step(h, first); first = false; }
}

// Adaptive Steuerung: Ziel an Kadenz, Puls und Trainer anpassen
function adaptTarget(target, wi, dt, cad, running) {
  const A = S.adapt, ftp = profile.ftp;
  if (!A.on || target == null || !running) return target;
  // Kadenz bricht ein (Todesspirale im ERG): Widerstand senken, bis wieder rund getreten wird
  if (target > ftp * .7 && cad != null) {
    if (cad < 50) { A.lowCad += dt; A.okCad = 0; } else { A.lowCad = Math.max(0, A.lowCad - dt); if (cad > 70) A.okCad += dt; }
    if (!A.cap && A.lowCad > 3) { A.cap = true; note('Kadenz zu niedrig, Widerstand gesenkt'); flash('Kadenz hoch! Widerstand kurz gesenkt', 2200); }
    if (A.cap && A.okCad > 2) { A.cap = false; A.lowCad = 0; note('Kadenz wieder gut, Ziel zurück'); }
  } else { A.cap = false; A.lowCad = 0; }
  if (A.cap) target = Math.min(target, ftp * .55);
  // Puls dauerhaft am Anschlag: Intensität in kleinen Schritten senken
  const hr = live.heart;
  if (hr && wi.g.dur > 120 && hr > profile.hrMax * .95) A.hrHigh += dt; else A.hrHigh = Math.max(0, A.hrHigh - dt * 2);
  if (A.hrHigh > 25 && S.t - A.lastAdj > 60 && S.wOff > -15) { S.wOff -= 3; A.lastAdj = S.t; A.hrHigh = 0; note('Puls sehr hoch, Intensität −3 %'); flash('Puls sehr hoch: Intensität −3 %', 2200); }
  // Trainer schafft das Ziel nicht (z. B. Maximalleistung erreicht)
  if (live.fresh && cad > 60 && live.power < target * .8 && !A.cap) A.weak += dt; else A.weak = Math.max(0, A.weak - dt);
  if (A.weak > 20) { A.weak = 0; note('Trainer erreicht das Ziel nicht, Max-Leistung im Profil prüfen'); }
  return Math.min(target, profile.maxW);
}

function step(dt, first) {
  const now = performance.now();
  if (S.startWall) S.wall = (S.wall || 0) + dt;
  const R = S.route, grade = R.gradeAt(S.dist), cad = live.cadence;
  const pw = live.fresh ? live.power : 0;
  if (S.parked) return; // im Menü: Fahrt steht
  // Nach der Rückkehr aus dem Menü: Treten setzt die Fahrt fort
  if (S.resumeOnPedal && S.state === 'paused' && (pw > 10 || (cad || 0) > 20)) { S.resumeOnPedal = false; S.state = 'riding'; flash('Weiter'); $('#tPause', S.el).innerHTML = ICON.pause + '<span>Pause</span>'; }
  // Start und automatische Pause
  if (S.state === 'ready' && (pw > 10 || (cad || 0) > 20)) begin();
  if (S.state === 'riding' && profile.autoPause && pw < 5 && (cad || 0) < 5 && S.v < .3) { S.idle += dt; if (S.idle > 3) { S.state = 'auto'; flash('Automatische Pause'); } } else S.idle = 0;
  if (S.state === 'auto' && (pw > 10 || (cad || 0) > 20)) { S.state = 'riding'; flash('Weiter'); }
  const running = S.state === 'riding';
  // Ziel bestimmen
  let target = null, wi = null;
  if (S.wo && S.state !== 'ready') {
    wi = woAt(S.wo, S.wT);
    if (wi && !wi.done && wi.target != null) {
      target = wi.target * profile.ftp * (1 + S.wOff / 100); target = adaptTarget(target, wi, dt, cad, running);
      // Sanfter ERG-Einstieg: große Sprünge nach oben über 5 s hochfahren, damit die Beine nicht "stehen bleiben"
      if (S.softSeg !== wi.i) { S.softSeg = wi.i; S.softFrom = S.lastTarget ?? null; }
      const into = S.wT - wi.start;
      if (profile.ergSoft !== false && S.softFrom != null && target - S.softFrom > profile.ftp * .15 && into < 5) target = S.softFrom + (target - S.softFrom) * smooth(0, 5, into);
    }
  }
  let gearMode = false;
  if (target == null && S.mode === 'erg') target = S.ergW;
  // Puls-Modus: Watt langsam so nachregeln, dass der Zielpuls gehalten wird
  if (target == null && S.mode === 'hr') {
    S.hrW ??= profile.ftp * .6; S.hrAcc = (S.hrAcc || 0) + dt;
    const hr = live.heart;
    if (hr && S.hrAcc >= 5 && running) { S.hrAcc = 0; S.hrW = clamp(S.hrW + clamp(((sel.hrTarget || 140) - hr) * .7, -12, 12), 40, Math.min(profile.maxW, profile.ftp * 1.1)); }
    target = S.hrW;
  }
  if (target == null && S.mode === 'gear') { gearMode = true; const gp = gearPower(cad, S.gear, grade * profile.gearDiff / 100) * (1 - S.draft * .8); S.curP += (gp - S.curP) * Math.min(1, dt * 2.5); target = S.curP; }
  S.target = target; S.wi = wi; if (target != null) S.lastTarget = target;
  // an Trainer senden (oder Demo)
  if (first && now - S.lastSend > 500 && S.state !== 'paused') {
    S.lastSend = now;
    if (target != null) { if (!gearMode || Math.abs((control.target ?? -99) - target) >= 3) setPower(target); }
    else setGrade(grade * profile.simDiff / 100 * (1 - S.draft * .5));
  }
  S.crank += (cad || 0) / 60 * Math.PI * 2 * dt;
  S.p3.push(pw); if (S.p3.length > 30) S.p3.shift();
  if (S.pacer && running) { const p = S.pacer, g = R.gradeAt(p.d); p.v += (steadySpeed(p.w, g) - p.v) * Math.min(1, dt * .8); p.d += p.v * dt; p.crank += 88 / 60 * Math.PI * 2 * dt; if (R.loop) p.d %= R.total; else p.d = Math.min(p.d, R.total); }
  // Mitfahrer
  if (S.npcOn && S.field.length) {
    const r = stepField(R, S.field, { d: S.dist, lat: 1.5, v: S.v, kg: profile.kg }, dt, running);
    S.draft = r.draft; S.wheel = r.wheel;
    if (r.overtook) { S.overtakes += r.overtook; if (first) { xpPop('+' + r.overtook + ' XP Überholt'); sound.pass(); } }
    if (running && first && S.t > S.nextRideOn) { S.nextRideOn = S.t + 90 + Math.random() * 240; const near = S.field.filter(n => Math.abs(gapOf(R, n.d, S.dist)) < 80); if (near.length) gotRideOn(near[Math.floor(Math.random() * near.length)].name); }
  } else S.draft = 0;
  if (!running) { S.v *= Math.pow(.25, dt); return; }
  // Bewegung
  S.v = integrate(S.v, pw, grade, dt, S.draft);
  const prev = S.dist;
  S.dist += S.v * dt; S.odo += S.v * dt; S.t += dt; S.kj += pw * dt / 1000;
  if (S.ghost) {
    const G = S.ghost.d, i = Math.min(G.length - 1, Math.floor(S.t)), j = Math.min(G.length - 1, i + 1), gd = G[i] + (G[j] - G[i]) * (S.t - Math.floor(S.t));
    S.ghostGap = gd - S.odo; S.ghostPos = R.loop ? gd % R.total : Math.min(gd, R.total);
    if (!S.ghostLead && S.ghostGap < -5 && S.t > 30) { S.ghostLead = true; flash('👻 Du liegst vor deiner Bestfahrt!', 2000); }
    else if (S.ghostLead && S.ghostGap > 5) S.ghostLead = false;
  }
  if (profile.drinkTips !== false && S.t > S.nextDrink) { S.nextDrink += (profile.drinkEvery || 15) * 60; flash('💧 Kurz trinken', 2000); }
  if (S.wo) S.wT += dt;
  if (S.dist >= R.total) {
    if (R.loop) { S.dist -= R.total; S.lap++; flash('Runde ' + (S.lap + 1) + ' · letzte Runde ' + fmtT(S.t - S.lapT0), 2500); S.lapT0 = S.t; S.climbs.forEach(c => c.state = 'pending'); S.sprints.forEach(c => c.state = 'pending'); }
    else { S.dist = R.total; if (!S.finished) { S.finished = true; S.state = 'paused'; flash('Ziel erreicht!', 3000); sound.fanfare(); shot('Ziel'); setTimeout(() => endRide(true), 2500); } }
  }
  const e = R.eleAt(S.dist); if (S.lastE != null && e > S.lastE) S.asc += e - S.lastE; S.lastE = e;
  segTick(S.climbs, S.climbLog, prev, 'climb');
  segTick(S.sprints, S.sprintLog, prev, 'sprint');
  // Workout-Ereignisse und Zieltor
  if (wi && !wi.done && wi.i !== S.lastSeg) {
    if (S.lastSeg >= 0 && S.gateFor === S.lastSeg) { S.gates++; cine(2.6, 5); xpPop('+5 XP Intervall'); S.gateHide = S.t + 3; sound.gate(); }
    else if (S.lastSeg >= 0) sound.beep(true);
    S.lastSeg = wi.i; S.lastBeep = -1; const g = wi.g;
    flash(g.text ? g.text : g.a == null ? 'Frei fahren' : `${Math.round((g.a + g.b) / 2 * profile.ftp * (1 + S.wOff / 100))} W für ${fmtT(g.dur)}`, 2200);
  }
  // Countdown 3-2-1 vor dem Intervallwechsel
  if (wi && !wi.done && wi.g.dur >= 20 && wi.next) { const s = Math.ceil(wi.left); if (s <= 3 && s >= 1 && s !== S.lastBeep) { S.lastBeep = s; if (profile.countdown !== false) sound.beep(false); } }
  if (wi?.done && !S.woDone) { S.woDone = true; if (S.gateFor != null) { S.gates++; cine(3.5, 5); S.gateHide = S.t + 4; } sound.fanfare(); flash('Workout geschafft! 🎉', 3000); shot('Workout geschafft'); }
  if (first) gateTick(wi, dt);
  // Sekundenwerte
  S.acc = (S.acc || 0) + dt;
  while (S.acc >= 1) {
    S.acc -= 1;
    const totD = S.odo;
    S.samples.push({ ts: Math.round(S.wall), p: Math.round(pw), hr: live.heart, cad: cad != null ? Math.round(cad) : null, v: +S.v.toFixed(2), d: +totD.toFixed(1), e: +e.toFixed(1), la: +R.latAt(S.dist).toFixed(6), lo: +R.lonAt(S.dist).toFixed(6), g: S.mode === 'gear' ? S.gear : null, tg: target != null ? Math.round(target) : null, wt: S.wo ? Math.round(S.wT) : null, gr: +grade.toFixed(1), rd: Math.round(S.dist) });
    const N = S.np; N.buf.push(pw); N.bs += pw; if (N.buf.length > 30) N.bs -= N.buf.shift(); if (N.buf.length === 30) { N.s4 += (N.bs / 30) ** 4; N.n++; }
    if (profile.autoShots) {
      const n = S.samples.length;
      if (n === 90 || (n > 90 && n - S.lastShotT >= profile.shotEvery * 60)) shot('Unterwegs');
    }
  }
}
// Zieltor: erscheint, wenn ein Intervall (ab 30 s) in weniger als 30 s endet, an der vorausberechneten Stelle
// Kameraschwenk am Zieltor (abschaltbar)
function cine(sec, view) { if (profile.gateCam !== false) S.world.cinematic(sec, view); }
function gateTick(wi, dt) {
  if (profile.gates === false) { if (S.gateFor != null || S.world.gate?.visible) { S.world.setGate(null); S.gateFor = null; } return; }
  const R = S.route;
  if (S.gateHide && S.t > S.gateHide) { S.gateHide = 0; S.world.setGate(null); S.gateFor = null; }
  if (!wi || wi.done || wi.g.dur < 30 || wi.left > 30 || S.v < 1 || S.state !== 'riding') return;
  let pred = S.dist + S.v * wi.left;
  if (S.gateFor !== wi.i) { S.gateFor = wi.i; S.gateD = pred; S.gateHide = 0; }
  else S.gateD += (pred - S.gateD) * Math.min(1, dt * 2 * .25);
  let d = S.gateD; if (R.loop) d = ((d % R.total) + R.total) % R.total; else d = Math.min(d, R.total - 2);
  const last = !wi.next, g = wi.g, z = g.a == null ? '#94a1ad' : zoneColor((g.a + g.b) / 2);
  S.world.setGate(d, last ? 'WORKOUT ZIEL' : `INTERVALL ${wi.i + 1} ENDE`, last ? '#ffffff' : z);
}
function segTick(list, log, prev, kind) {
  for (const c of list) {
    if (c.state === 'pending' && prev < c.from + 1 && S.dist >= c.from) { c.state = 'active'; c.t0 = S.t; flash((kind === 'climb' ? 'Anstieg: ' : '') + c.name, 2200); }
    if (c.state === 'active' && S.dist >= c.to) {
      c.state = 'done'; const time = S.t - c.t0, key = S.route.id + ':' + c.id, bestMap = kind === 'climb' ? progress.climbBest : (progress.sprintBest || {}), best = bestMap[key];
      const pr = !best || time < best.time;
      log.push({ name: c.name, id: c.id, len: c.len, gain: c.gain, avg: c.avg, time, best: best?.time ?? null, pr });
      // Platzierung im Feld: wer war schon durch?
      const ahead = S.npcOn ? S.field.filter(n => gapOf(S.route, n.d, S.dist) > 0 && gapOf(S.route, n.d, S.dist) < c.len + 200).length : 0;
      const place = S.npcOn ? ` · Platz ${ahead + 1}` : '';
      flash(`${kind === 'climb' ? 'Gipfel' : 'Sprint'} ${c.name.replace(/^Sprint /, '')}: ${fmtT(time)}${place}${pr ? ' · Bestzeit!' : best ? ' · Bestzeit ' + fmtT(best.time) : ''}`, 3500);
      xpPop(kind === 'climb' ? '+25 XP Gipfel' : '+20 XP Sprint'); sound.fanfare();
      setTimeout(() => shot((kind === 'climb' ? 'Gipfel ' : '') + c.name), 400);
    }
  }
}

/* ---------- Anzeige ---------- */
function hud() {
  const el = S.el, R = S.route, f = (v, d = 1) => v.toFixed(d).replace('.', ',');
  const p3 = S.p3.length ? S.p3.slice(-30).reduce((a, b) => a + b, 0) / S.p3.slice(-30).length : 0;
  $('#hPw', el).textContent = Math.round(p3); $('#hWkg', el).textContent = f(p3 / profile.kg);
  const zc = zoneColor(p3 / profile.ftp); $('#hPw', el).style.color = zc;
  const zi = $('#hZone', el); zi.style.width = clamp(p3 / profile.ftp / 1.5 * 100, 0, 100) + '%'; zi.style.background = zc;
  $('#hHr', el).textContent = live.heart ?? '--'; $('#hCad', el).textContent = live.cadence != null ? Math.round(live.cadence) : '--';
  $('#hSpd', el).textContent = f(S.v * 3.6); $('#hDist', el).textContent = f(S.odo / 1000, 1);
  sound.update({ v: S.v, cad: live.cadence, power: p3, ftp: profile.ftp, theme: R.themeKey, tunnel: !!R.tunnelAt(S.dist, 15), riding: S.state === 'riding', weather: S.env.weather, night: S.env.time === 'night' });
  $('#hTime', el).textContent = fmtT(S.t); $('#hTimeL', el).textContent = S.state === 'paused' ? 'Pause' : S.state === 'auto' ? 'Auto-Pause' : 'Zeit';
  $('#hAsc', el).textContent = Math.round(S.asc);
  // Zweite Zeile: Schnitt, NP, Arbeit, Kalorien, XP
  const n = S.samples.length, avg = n ? S.samples.reduce((a, s) => a + s.p, 0) / n : 0, np = S.np.n ? Math.pow(S.np.s4 / S.np.n, .25) : avg;
  const xp = Math.round(S.odo / 1000 * 20 + S.t / 60 * 2 + S.asc * .5 + S.overtakes + S.climbLog.length * 25 + S.sprintLog.length * 20 + S.gates * 5);
  const L = levelOf(progress.xp + xp);
  $('#hSub', el).hidden = profile.hudSub === false;
  $('#hSub', el).innerHTML = `<span>Ø ${Math.round(avg)} W</span><span>NP ${Math.round(np)} W</span><span>${Math.round(S.kj)} kJ</span><span>${Math.round(S.kj / .24 / 4.184)} kcal</span>${S.overtakes ? `<span>${S.overtakes} überholt</span>` : ''}<span class="xp">+${xp} XP · Lv ${L.lv}<i style="width:${(L.frac * 100).toFixed(0)}%"></i></span>`;
  const g = R.gradeAt(S.dist); $('#hGrade', el).textContent = f(g); $('.gradebox', el).dataset.g = g > 8 ? 4 : g > 5 ? 3 : g > 2.5 ? 2 : g < -2 ? 0 : 1;
  $('#gIcon', el).style.transform = `rotate(${-clamp(g * 2.2, -35, 35)}deg)`;
  if (S.mode !== 'gear') updGear();


  $('#draftBox', el).hidden = !(S.draft > .03);
  if (S.draft > .03) $('#hDraft', el).textContent = '−' + Math.round(S.draft * 100) + ' % Luft';
  // Workout
  if (S.wo) woHud(el, f);
  // Anstieg oder Sprint
  const c = S.climbs.find(c => c.state === 'active') || S.sprints.find(c => c.state === 'active');
  $('#climbBox', el).hidden = !c;
  if (c) {
    const isSprint = !c.gain, left = c.to - S.dist, frac = clamp((S.dist - c.from) / c.len, 0, 1), best = (isSprint ? progress.sprintBest || {} : progress.climbBest)[R.id + ':' + c.id];
    $('#climbBox', el).classList.toggle('sprint', isSprint);
    $('#clName', el).textContent = c.name; $('#clLeft', el).textContent = (left >= 1000 ? f(left / 1000) + ' km' : Math.round(left) + ' m') + (isSprint ? ' bis zur Wertung' : ' bis zum Gipfel');
    $('#clGrade', el).textContent = isSprint ? f(S.v * 3.6) + ' km/h' : 'Ø ' + f(c.avg) + ' %'; $('#clTime', el).textContent = fmtT(S.t - c.t0) + (best ? ' · Bestzeit ' + fmtT(best.time) : '');
    $('#clBar', el).style.width = (frac * 100).toFixed(1) + '%';
  }
  if (S.pacer) { const gap = (S.pacer.d - S.dist); $('#hPacer', el).textContent = (gap >= 0 ? '+' : '−') + Math.abs(Math.round(gap)) + ' m'; }
  if (S.npcOn && (S.rlN = (S.rlN || 0) + 1) % 3 === 0) riderList(el);
  if ((S.lyN = (S.lyN || 0) + 1) % 5 === 0) arrange($('#rw', el));
  // Zusatz-Widgets
  if ($('.xlayer', el).childElementCount) {
    const wi = S.wi, tgt = S.target, ftp = profile.ftp, hrv = live.heart;
    const pz = Math.max(0, ZONES.findIndex(z => p3 / ftp < z.max)), hz = hrv ? HRZONES.findIndex(z => hrv / (profile.hrMax * .93) < z.max) : -1;
    const tss = S.np.n ? Math.round(S.t * (np / ftp) ** 2 / 36) : 0, tot = S.wo ? woTotal(S.wo) : 0;
    const gg = S.ghost ? S.ghostGap : null;
    const vals = {
      p3: [Math.round(p3) + ' W', zoneColor(p3 / ftp)], wkg: [f(p3 / profile.kg)], hr: [hrv ?? '–'], cad: [live.cadence != null ? Math.round(live.cadence) : '–'],
      spd: [f(S.v * 3.6) + ' km/h'], dist: [f(S.odo / 1000, 2) + ' km'], time: [fmtT(S.t)], asc: [Math.round(S.asc) + ' m'], avg: [Math.round(avg) + ' W'], np: [Math.round(np) + ' W'],
      kj: [Math.round(S.kj)], kcal: [Math.round(S.kj / .24 / 4.184)], grade: [f(g) + ' %'], target: [tgt != null && S.wo ? Math.round(tgt) + ' W' : '–', tgt ? zoneColor(tgt / ftp) : ''],
      left: [wi && !wi.done ? fmtT(wi.left) : '–'], woLeft: [S.wo ? fmtT(Math.max(0, tot - S.wT)) : '–'], xp: ['+' + xp], clock: [new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })],
      lap: [fmtT(S.t - S.lapT0)], place: [S.npcOn ? (S.field.filter(n => gapOf(R, n.d, S.dist) > 0).length + 1) + ' / ' + (S.field.length + 1) : '–'],
      tss: [tss], ghost: [gg == null ? 'kein Geist' : (gg >= 0 ? '−' : '+') + Math.abs(Math.round(gg)) + ' m', gg == null ? '' : gg > 0 ? '#ff8b97' : '#4fd18b'],
      hrz: [hz >= 0 ? HRZONES[hz].n : '–', hz >= 0 ? HRZONES[hz].c : ''], pz: [ZONES[pz].n.split(' ')[0], ZONES[pz].c],
    };
    const tail = (k, n) => S.samples.slice(-n).map(s => s[k]);
    updateExtras($('#rw', el), vals, { gp: tail('p', 120), gh: tail('hr', 300), gc: tail('cad', 120) });
  }
  drawElevStrip($('#elev', el));
  drawMini($('#mini', el));
}
function woHud(el, f) {
  const wo = S.wo, wi = S.wi || woAt(wo, S.wT), tot = woTotal(wo), ftp = profile.ftp, k = 1 + S.wOff / 100;
  $('#woOff', el).textContent = 100 + S.wOff;
  const A = S.adapt, ad = $('#adapt', el);
  ad.textContent = A.on ? (A.cap ? '⚠ angepasst' : 'adaptiv') : 'fix'; ad.dataset.on = A.on; ad.title = A.note && performance.now() - A.noteT < 15000 ? A.note : 'Ziele passen sich an Kadenz, Puls und Trainer an. Klicken zum Umschalten.';
  $('#woTot', el).textContent = `${fmtT(Math.min(S.wT, tot))} / ${fmtT(tot)} · noch ${fmtT(Math.max(0, tot - S.wT))}`;
  if (wi && !wi.done) {
    const g = wi.g, tgt = wi.target == null ? null : Math.round(Math.min(wi.target * ftp * k, A.cap ? ftp * .55 : 1e9));
    $('#woStep', el).textContent = g.text || (wi.target == null ? 'Frei fahren' : ZONES[Math.max(0, ZONES.findIndex(z => wi.target < z.max))].n);
    $('#woSegN', el).textContent = `Intervall ${wi.i + 1} / ${wo.segs.length}`;
    $('#woLeft', el).textContent = fmtT(wi.left);
    $('#woSegBar', el).style.width = ((1 - wi.left / g.dur) * 100).toFixed(1) + '%';
    const tg = $('#woTgt', el); tg.textContent = tgt == null ? 'frei' : tgt; tg.style.color = tgt == null ? '#c3ccd5' : zoneColor(wi.target);
    $('#woCad', el).textContent = g.cad ? `◎ ${g.cad} U/min` : '';
    // Kadenz-Ziel und Tipp
    const cr = cadRange(g), cadNow = live.cadence, ct = $('#cadT', el);
    ct.hidden = !cr || S.state !== 'riding';
    if (cr) {
      const lo = 50, hi = 130, P = v => clamp((v - lo) / (hi - lo) * 100, 0, 100);
      $('#cadZone', el).style.left = P(cr[0]) + '%'; $('#cadZone', el).style.width = (P(cr[1]) - P(cr[0])) + '%';
      $('#cadMark', el).style.left = P(cadNow ?? lo) + '%';
      const inR = cadNow != null && cadNow >= cr[0] && cadNow <= cr[1];
      ct.dataset.s = cadNow == null ? '' : inR ? 'ok' : 'off';
      $('#cadTxt', el).textContent = `${cr[0]}–${cr[1]}`;
    }
    const tip = $('#woTip', el);
    tip.hidden = profile.tips === false;
    if (profile.tips !== false && S.tipSeg !== wi.i) { S.tipSeg = wi.i; tip.textContent = '💡 ' + tipFor(g, wi.i, wo.segs[wi.i - 1]); }
    const nx = wi.next; $('#woNext', el).textContent = nx ? 'danach ' + (nx.a == null ? 'frei' : Math.round((nx.a + nx.b) / 2 * ftp * k) + ' W') + ' · ' + fmtT(nx.dur) : 'letztes Intervall';
    // Liegt die Leistung im Ziel?
    const p3 = S.p3.length ? S.p3.slice(-5).reduce((a, b) => a + b, 0) / Math.min(5, S.p3.length) : 0;
    const box = $('#onT', el);
    if (tgt && S.state === 'riding') {
      const dev = (p3 - tgt) / tgt; box.hidden = false;
      const st = Math.abs(dev) < .05 ? 'ok' : dev < 0 ? 'low' : 'high';
      box.dataset.s = st; $('#onTi', el).style.left = clamp(50 + dev * 250, 2, 98) + '%';
      $('#onTt', el).textContent = st === 'ok' ? 'Im Ziel' : (dev < 0 ? '−' : '+') + Math.abs(Math.round(p3 - tgt)) + ' W';
    } else box.hidden = true;
  } else {
    $('#cadT', el).hidden = true; $('#woTip', el).hidden = true;
    $('#woStep', el).textContent = 'Workout beendet'; $('#woLeft', el).textContent = ''; $('#woTgt', el).textContent = '–'; $('#woNext', el).textContent = 'Frei weiterfahren'; $('#woSegN', el).textContent = ''; $('#woCad', el).textContent = ''; $('#onT', el).hidden = true; $('#woSegBar', el).style.width = '100%';
  }
  const act = []; for (const s of S.samples) if (s.wt != null) act.push([s.wt, s.p]);
  drawWorkout($('#woChart', el), wo, { pos: S.wT, actual: act.length > 600 ? act.filter((_, i) => i % 3 === 0) : act, ftp });
}
function riderList(el) {
  const R = S.route;
  const rows = S.field.map(n => ({ name: n.name, gap: gapOf(R, n.d, S.dist), wkg: n.wkg * clamp(1 + R.gradeAt(n.d) * .025, .55, 1.25), c: n.look.jersey, v: n.v }));
  const p3 = S.p3.length ? S.p3.reduce((a, b) => a + b, 0) / S.p3.length : 0;
  rows.push({ me: true, name: profile.name, gap: 0, wkg: p3 / profile.kg, c: profile.jersey });
  rows.sort((a, b) => b.gap - a.gap);
  const mi = rows.findIndex(r => r.me), from = clamp(mi - 3, 0, Math.max(0, rows.length - 7));
  $('#riders', el).innerHTML = rows.slice(from, from + 7).map(r => {
    const t = r.me ? '' : Math.abs(r.gap) < 1 ? '0 m' : Math.abs(r.gap) < 1000 ? (r.gap > 0 ? '+' : '−') + Math.abs(Math.round(r.gap)) + ' m' : (r.gap > 0 ? '+' : '−') + (Math.abs(r.gap) / 1000).toFixed(1).replace('.', ',') + ' km';
    return `<div class="rrow ${r.me ? 'me' : ''} ${S.wheel && r.name === S.wheel.name ? 'wheel' : ''}"><i style="background:${r.c}"></i><span class="nm">${esc(r.name)}</span><span class="num">${r.wkg.toFixed(1).replace('.', ',')}</span><span class="num gap">${t}</span></div>`;
  }).join('');
}
function drawElevStrip(cv) {
  const R = S.route, span = Math.min(R.total, 6000), back = Math.min(1000, span * .15);
  let from = S.dist - back, to = from + span;
  if (!R.loop) { from = clamp(from, 0, Math.max(0, R.total - span)); to = from + span; }
  const n = 200, dist = [], ele = [];
  for (let i = 0; i <= n; i++) { const d = from + (to - from) * i / n; dist.push(d - from); ele.push(R.eleAt(d)); }
  const res = profileChart(cv, dist, ele, { pos: S.dist - from, ghost: S.pacer ? clamp(S.pacer.d - from, 0, span) : null, top: 18 });
  // Tunnel, Orte und Mitfahrer im Profil markieren
  if (res) {
    const { w, h, d: dpr } = fitCanvas(cv), c = cv.getContext('2d'), X = v => v / span * w;
    const mark = (a, b, color) => { const x0 = X(a - from), x1 = X(b - from); if (x1 < 0 || x0 > w) return; c.fillStyle = color; c.fillRect(x0, h - 4 * dpr, x1 - x0, 4 * dpr); };
    for (const t of R.tunnels) mark(t.from, t.to, '#1b1e22');
    for (const t of R.towns) mark(t.from, t.to, '#ffd23f');
    if (S.npcOn) for (const nn of S.field) { let dd = nn.d; if (R.loop && dd < from) dd += R.total; if (dd < from || dd > to) continue; const i = Math.round((dd - from) / span * n), y = h - 4 * dpr - (ele[i] - res.mn) / (res.mx - res.mn) * (h - 22 * dpr); c.fillStyle = nn.look.jersey; c.beginPath(); c.arc(X(dd - from), y, 3 * dpr, 0, 7); c.fill(); }
  }
  const left = R.loop ? null : R.total - S.dist, tw = R.townAt(S.dist), tn = R.tunnelAt(S.dist);
  $('#elevTxt', S.el).textContent = `${Math.round(R.eleAt(S.dist))} m ü. NN${left != null ? ' · noch ' + fmtKm(left) + ' km' : ' · Runde ' + (S.lap + 1)}${tw ? ' · ' + tw.name : ''}${tn ? ' · Tunnel' : ''}`;
}
// Minikarte: ganze Strecke mit aktueller Position, Antippen öffnet die große Karte
function drawMini(cv) {
  const { w, h } = fitCanvas(cv), c = cv.getContext('2d');
  // Statische Strecke einmal vorzeichnen, danach nur Punkte darüber
  let M = S.miniCache;
  if (!M || M.w !== w || M.h !== h) {
    const off = document.createElement('canvas'); off.width = w; off.height = h;
    const oc = off.getContext('2d'); oc.fillStyle = 'rgba(16,20,24,.62)'; oc.beginPath(); oc.roundRect ? oc.roundRect(0, 0, w, h, 14) : oc.rect(0, 0, w, h); oc.fill();
    drawStatic(S.route, mapGeo(cv), oc, w / (cv.getBoundingClientRect().width || w), false);
    M = S.miniCache = { w, h, off };
  }
  c.clearRect(0, 0, w, h); c.drawImage(M.off, 0, 0);
  dynamicLayer(S.route, mapGeo(cv), c, w / (cv.getBoundingClientRect().width || w), false);
  if (!$('#bigMap', S.el).hidden) drawBigMap();
}
function drawMiniOld(cv) {
  const R = S.route, { w, h, d } = fitCanvas(cv), c = cv.getContext('2d'); c.clearRect(0, 0, w, h);
  // Ausschnitt um den Fahrer, nach Fahrtrichtung gedreht
  const sc = Math.min(w, h) / 1600, cx = w / 2, cy = h * .62, px = R.xAt(S.dist), pz = R.zAt(S.dist), hd = R.headAt(S.dist);
  c.save(); c.beginPath(); c.arc(cx, h / 2, Math.min(w, h) / 2 - 2 * d, 0, 7); c.fillStyle = 'rgba(16,20,24,.6)'; c.fill(); c.clip();
  c.translate(cx, cy); c.rotate(-hd);
  c.lineJoin = c.lineCap = 'round';
  c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = 4 * d; c.beginPath();
  const step = 4; for (let i = 0; i <= R.N; i += step) { const x = (R.x[i] - px) * sc, y = (R.z[i] - pz) * sc; i ? c.lineTo(x, y) : c.moveTo(x, y); }
  c.stroke();
  const seg = (a, b, color) => { c.strokeStyle = color; c.beginPath(); for (let i = Math.floor(a / R.step); i <= b / R.step; i += step) { const x = (R.x[i] - px) * sc, y = (R.z[i] - pz) * sc; c.lineTo(x, y); } c.stroke(); };
  for (const cl of R.climbs) seg(cl.from, cl.to, '#ef4458');
  for (const s of R.sprints) seg(s.from, s.to, '#4fd18b');
  for (const t of R.towns) { const x = (R.xAt((t.from + t.to) / 2) - px) * sc, y = (R.zAt((t.from + t.to) / 2) - pz) * sc; c.fillStyle = '#ffd23f'; c.fillRect(x - 3 * d, y - 3 * d, 6 * d, 6 * d); }
  if (S.npcOn) for (const n of S.field) { const qx = (R.xAt(n.d) - px) * sc, qy = (R.zAt(n.d) - pz) * sc; c.fillStyle = n.look.jersey; c.beginPath(); c.arc(qx, qy, 2.6 * d, 0, 7); c.fill(); }
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
  const items = [[p3 + ' W', 'Leistung'], [(live.heart ?? '–') + '', 'Puls'], [(S.v * 3.6).toFixed(1).replace('.', ',') + ' km/h', 'Tempo'], [fmtKm(S.odo) + ' km', 'Distanz'], [Math.round(S.asc) + ' m', 'Höhe'], [fmtT(S.t), 'Zeit']];
  let xx = w - 28; x.textAlign = 'right';
  for (let i = items.length - 1; i >= 0; i--) { x.fillStyle = '#fff'; x.font = '700 30px Barlow, Arial'; x.fillText(items[i][0], xx, h - 52); x.fillStyle = '#9aa7b3'; x.font = '500 15px Barlow, Arial'; x.fillText(items[i][1], xx, h - 30); xx -= Math.max(x.measureText(items[i][0]).width, 90) + 34; }
  x.textAlign = 'left'; x.fillStyle = '#ff6a3d'; x.font = '700 20px Barlow, Arial'; x.fillText('VELOVERSE', 28, 40);
  c.toBlob(b => { if (b && S) { S.shots.push({ blob: b, caption, t: Math.round(S.t), d: Math.round(S.odo) }); if (caption === 'Foto') flash('📷 Foto gespeichert', 900); } }, 'image/jpeg', .86);
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
  const v = await dialog({ title: auto ? 'Ziel erreicht' : 'Fahrt beenden?', html: `<p>${fmtKm(S.samples.at(-1).d)} km in ${fmtT(S.t)}.</p><p class="muted small">Gespeicherte Fahrten zählen für Level, Missionen, Trainingsplan und Rekorde.</p>`, buttons: [{ label: 'Weiterfahren', value: 'back', cls: 'ghost' }, { label: 'Verwerfen', value: 'drop' }, { label: 'Speichern', value: 'save', cls: 'pri' }] });
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
  S.alive = false; sound.silence(); music.stop(); putLive({ state: 'ended', t: Math.round(S.t), odo: Math.round(S.odo), route: S.route.name }); clearInterval(S.timer); cancelAnimationFrame(S.raf); S.ro?.disconnect();
  document.removeEventListener('keydown', S.key); S.offs.forEach(f => f());
  try { S.world.dispose(); } catch (e) { }
  // Speicher freigeben: Streckendaten, Caches der Karte, Testverweis
  S.miniCache = null; S.field = []; S.samples = []; S.shots = []; delete window.__tw;
  clearRouteCache();
  if (status.trainer === 'on' || demo.on) setPower(Math.min(100, profile.ftp * .4));
  control.target = null;
  if (wake) { wake.release().catch(() => { }); wake = null; }
  
  S = null;
}
export const isRiding = () => !!S && !S.parked && S.state !== 'ready' && S.samples.length > 0;

/* ---------- Pausieren und ins Menü (Fahrt bleibt im Speicher) ---------- */
export function park() {
  if (!S || S.parked) return;
  S.parked = true; S.state = 'paused'; S.v = 0;
  cancelAnimationFrame(S.raf); sound.silence(); music.stop(); closeMap();
  S.wrap = $('#rw', S.el); document.getElementById('parkHold')?.remove();
  const hold = document.createElement('div'); hold.id = 'parkHold'; hold.hidden = true; hold.appendChild(S.wrap); document.body.appendChild(hold);
  if (status.trainer === 'on' || demo.on) setPower(Math.min(100, profile.ftp * .4));
  document.removeEventListener('keydown', S.key);
}
export const parkedInfo = () => S?.parked ? `${S.route.name} · ${fmtKm(S.odo)} km · ${fmtT(S.t)}` : null;
function unpark(el) {
  S.parked = false; S.el = el; el.innerHTML = ''; el.appendChild(S.wrap); document.getElementById('parkHold')?.remove();
  document.addEventListener('keydown', S.key);
  $('#tPause', el).innerHTML = ICON.play + '<span>Weiter</span>';
  S.world.resize(); S.world.camInit = false; S.lastFrame = performance.now(); S.lastTick = performance.now();
  const frame = now => {
    if (!S?.alive || S.parked) return;
    S.frameFn(now); S.raf = requestAnimationFrame(frame);
  };
  S.raf = requestAnimationFrame(frame); music.start();
  flash('Pausiert · Tritt los oder „Weiter“ drücken', 2500); S.state = 'paused'; S.resumeOnPedal = true;
  if (sessionStorage.getItem('endAfterResume')) { sessionStorage.removeItem('endAfterResume'); setTimeout(() => endRide(), 200); }
}
