// Fahrt-Extras: Watt-Ring, Zonen-Leuchtrand, Bestwert-Einblendungen, Anstiegsprofil, Power-ups, Bot-Rennen, Lenken
import { $, clamp, zoneColor, fmtT, esc, dialog } from './util.js';
import { profile, progress } from './state.js';
import { db } from './db.js';
import { bestCurve } from './analysis.js';
import { sound } from './sound.js';

/* ---------- Power-ups ---------- */
export const PUPS = {
  feather: { icon: '🪶', name: 'Feder', txt: '+8 % Leistung bergauf', dur: 20 },
  aero: { icon: '🚀', name: 'Aero', txt: '−25 % Luftwiderstand', dur: 25 },
  magnet: { icon: '🧲', name: 'Windschatten-Magnet', txt: 'Windschatten wirkt 60 % stärker', dur: 30 },
};
// Physik-Anpassungen durch aktive Power-ups: { power: Faktor, draft: Windschatten 0..0,5 }
export function mods(S, grade, draft) {
  const a = S.pupActive && S.t < S.pupActive.until ? S.pupActive.k : null;
  let power = 1, d = draft;
  if (a === 'feather' && grade > 1) power = 1.08;
  if (a === 'aero') d = 1 - (1 - draft) * .75;
  if (a === 'magnet') d = Math.min(.5, draft * 1.6);
  return { power, draft: d };
}
export function usePup(S, flash) {
  if (!S.pupHeld) return;
  const k = S.pupHeld; S.pupHeld = null; S.pupActive = { k, until: S.t + PUPS[k].dur };
  flash(`${PUPS[k].icon} ${PUPS[k].name}: ${PUPS[k].txt}`, 2200); sound.whoosh(); S.pupUsed = (S.pupUsed || 0) + 1;
}

/* ---------- Bot-Rennen ---------- */
export function raceSetup(S) {
  const R = S.route, dist = R.loop ? R.total : R.total;
  S.race = { dist: Math.min(dist, 60000), started: false, result: null };
  const base = profile.ftp / profile.kg;
  for (const [i, n] of S.field.entries()) { n.wkg = base * (.7 + (i * 37 % 100) / 100 * .38) + (profile.npcStrength || 0) * .5; n.race = true; n.odo = 0; n.fin = null; n.d = R.loop ? ((-(i >> 1) * 2.2) % R.total + R.total) % R.total : Math.min(R.total, (i >> 1) * 2.2); n.lat = .5 + (i % 4) * .8; n.latT = n.lat; n.v = 0; n.rd = null; }
}
export function raceTick(S, dt, flash) {
  const rc = S.race; if (!rc || rc.result) return;
  for (const n of S.field) if (n.race && !n.fin && n.odo >= rc.dist) { n.fin = S.t; if (!S.raceLead) { S.raceLead = n.name; flash(`🏁 ${n.name} gewinnt in ${fmtT(n.fin)}`, 2500); } }
  if (S.odo >= rc.dist) finishRace(S);
}
function finishRace(S) {
  const rc = S.race, me = { name: profile.name || 'Du', time: S.t, me: true };
  const bots = S.field.filter(n => n.race).map(n => ({ name: n.name, time: n.fin ?? S.t + (rc.dist - n.odo) / Math.max(3, n.v), est: !n.fin, wkg: n.wkg }));
  const all = [...bots, me].sort((a, b) => a.time - b.time), place = all.indexOf(me) + 1;
  rc.result = { place, of: all.length, time: S.t, dist: rc.dist, top: all.slice(0, 10).map(x => ({ name: x.name, time: Math.round(x.time), me: !!x.me, est: !!x.est })) };
  if (place === 1) sound.fanfare(); else sound.gate();
  dialog({ title: place === 1 ? '🏆 Sieg!' : `🏁 Platz ${place} von ${all.length}`, html: `<p>${(rc.dist / 1000).toFixed(1).replace('.', ',')} km in <b>${fmtT(S.t)}</b>.</p><table class="tbl small">${rc.result.top.map((x, i) => `<tr class="${x.me ? 'me' : ''}"><td>${i + 1}.</td><td>${esc(x.name)}</td><td class="n">${fmtT(x.time)}${x.est ? ' *' : ''}</td></tr>`).join('')}</table><p class="small muted">* geschätzt, noch nicht im Ziel. Für die Platzierung gibt es XP beim Speichern.</p>`, buttons: [{ label: 'Weiterfahren', value: true, cls: 'pri' }] });
}
export const raceXp = r => r ? Math.max(20, 200 - (r.place - 1) * 30) : 0;

/* ---------- Aufbau ---------- */
export async function plusInit(S) {
  const el = S.el, rw = $('#rw', el), R = S.route;
  // Watt-Ring als verschiebbares Widget
  const ring = document.createElement('div'); ring.className = 'pring'; ring.dataset.drag = 'ring';
  ring.innerHTML = `<svg viewBox="0 0 120 120"><g id="prZones"></g><path id="prVal" fill="none" stroke-width="10" stroke-linecap="round"/><line id="prTgt" stroke="#fff" stroke-width="3" stroke-linecap="round"/></svg><div class="prtxt"><b class="num" id="prW">0</b><span>Watt</span><small class="num" id="prZ"></small></div>`;
  rw.querySelector('.hud-bottom').before(ring);
  const ARC = 270, a0 = 135, maxF = 1.6, P = f => { const a = (a0 + clamp(f / maxF, 0, 1) * ARC) * Math.PI / 180; return [60 + Math.cos(a) * 48, 60 + Math.sin(a) * 48]; };
  const arc = (f1, f2) => { const [x1, y1] = P(f1), [x2, y2] = P(f2), big = (f2 - f1) / maxF * ARC > 180 ? 1 : 0; return `M${x1.toFixed(1)},${y1.toFixed(1)} A48,48 0 ${big} 1 ${x2.toFixed(1)},${y2.toFixed(1)}`; };
  const Z = [0, .55, .75, .9, 1.05, 1.2, maxF];
  $('#prZones', ring).innerHTML = Z.slice(0, -1).map((z, i) => `<path d="${arc(z + .005, Z[i + 1] - .005)}" stroke="${zoneColor((z + Z[i + 1]) / 2)}" stroke-width="10" fill="none" opacity=".28"/>`).join('');
  S.ringArc = arc; S.ringPt = P;
  // Zonen-Leuchtrand
  const edge = document.createElement('div'); edge.className = 'zoneedge'; edge.hidden = profile.zoneEdge === false; rw.appendChild(edge);
  // Power-up-Anzeige
  const pb = document.createElement('button'); pb.className = 'pupbox'; pb.id = 'pupBox'; pb.hidden = true; pb.title = 'Power-up einsetzen (U)'; rw.appendChild(pb);
  // Bestwert-Einblendung
  const pop = document.createElement('div'); pop.className = 'prpop'; pop.id = 'prPop'; rw.appendChild(pop);
  const sl = document.createElement('div'); sl.className = 'speedlines'; sl.hidden = profile.fx === false; rw.appendChild(sl); S.world.fx = profile.fx !== false;
  // Mini-Profil im Anstiegskasten
  const cp = document.createElement('canvas'); cp.id = 'clProf'; cp.className = 'clprof'; $('#climbBox', el).appendChild(cp);
  // Power-ups auf der Strecke: alle 2,5 km, nicht in Tunneln
  if (S.group ? S.group.settings?.powerups !== false : profile.powerups !== false) {
    S.pups = []; for (let d = 1200; d < R.total - 300; d += 2500) if (!R.tunnelAt(d, 30)) S.pups.push({ d, got: false, k: Object.keys(PUPS)[(S.pups.length * 7 + 3) % 3] });
    S.world.setPickups?.(S.pups.map(p => ({ d: p.d, icon: '⚡' })));
  }
  S.lat = 1.5; S.latT = 1.5;
  // Bestwerte bisher
  try { S.bestBase = bestCurve((await db.all('rides')).filter(r => !r.imported)); } catch (e) { S.bestBase = {}; }
  S.bestShown = {};
  // Lenken: Pfeiltasten links/rechts, auf Tablets durch Neigen
  if (profile.steerTilt && 'DeviceOrientationEvent' in window) {
    const on = e => { if (e.gamma == null) return; const tilt = screen.orientation?.type?.startsWith('landscape') ? (screen.orientation.angle === 90 ? e.beta : -e.beta) : e.gamma; S.latT = clamp(1.5 + clamp(tilt, -25, 25) / 25 * 1.5, .3, 3.2); };
    const req = DeviceOrientationEvent.requestPermission; if (req) req().catch(() => { });
    addEventListener('deviceorientation', on); S.offs.push(() => removeEventListener('deviceorientation', on));
  }
}
export function steerKey(S, e) {
  if (e.key === 'ArrowLeft') { S.latT = clamp((S.latT ?? 1.5) - .6, .3, 3.2); return true; }
  if (e.key === 'ArrowRight') { S.latT = clamp((S.latT ?? 1.5) + .6, .3, 3.2); return true; }
  if (e.key === 'u' || e.key === 'U') return 'pup';
  return false;
}

/* ---------- Verkehr (Einstellung "Autos und Lkw") ---------- */
const CLOSE_MSG = ['😬 Puh, nur {m} Abstand!', '🚛 Hey, 1,5 Meter!', '💨 Das war knapp: {m}', '😤 Überholt mit {m}. Danke für nichts.', '🙄 {m} Abstand. Klassiker.'];
export function trafficSetup(S, flash) {
  const R = S.route; S.trafficOn = (S.group ? S.group.settings?.traffic === true : profile.traffic === true) && (R.surface || 'asphalt') === 'asphalt' && !R.theme.moon;
  S.nextCar = 25 + Math.random() * 30;
  S.world.onPass = (t, lat) => {
    const m = Math.max(.6, (lat * (S.world.latK ?? 1)) - (t.kind === 'truck' ? 1.25 : .9) - .3), close = m < 1.3;
    sound.carPass(t.kind, close ? 1 : .6);
    if (close && Math.random() < .7) flash(CLOSE_MSG[Math.random() * CLOSE_MSG.length | 0].replace('{m}', m.toFixed(1).replace('.', ',') + ' m'), 2400);
    if (Math.random() < .25) setTimeout(() => sound.horn(t.kind), 200);
    if (t.kind === 'truck' && close) S.v += .4; // Windstoß zieht kurz mit
  };
}
function trafficTick(S, dt) {
  if (!S.trafficOn || S.state !== 'riding') return;
  const R = S.route; if (S.t < S.nextCar || R.tunnelAt(S.dist, 120) || (!R.loop && S.dist < 200)) return;
  S.nextCar = S.t + 35 + Math.random() * 70;
  const truck = Math.random() < .3, close = Math.random() < .45, lat = (S.lat ?? 1.5) - (truck ? 2.4 : 2.0) - (close ? 0 : .9 + Math.random() * .8);
  S.world.spawnVehicle(truck ? 'truck' : 'car', S.dist - 140, (truck ? 20 : 23) + Math.random() * 4, lat);
}

/* ---------- Je Physikschritt ---------- */
export function plusStep(S, dt, prev, first, flash) {
  trafficTick(S, dt);
  S.lat += ((S.latT ?? 1.5) - S.lat) * Math.min(1, dt * 2.5);
  // Power-up einsammeln
  if (S.pups) for (const [i, p] of S.pups.entries()) if (!p.got && prev < p.d && S.dist >= p.d) {
    p.got = true; S.world.takePickup?.(i);
    if (S.pupHeld) flash('⚡ Power-up verpasst: erst das vorige einsetzen (U)', 1800);
    else { S.pupHeld = p.k; flash(`⚡ ${PUPS[p.k].icon} ${PUPS[p.k].name} eingesammelt, mit U oder Antippen einsetzen`, 2600); sound.pass(); }
  }
  // Bestwerte: einmal pro Sekunde prüfen
  if (first && S.samples.length && S.samples.length !== S.bestN) {
    S.bestN = S.samples.length;
    for (const [w, label] of [[5, '5 Sekunden'], [60, '1 Minute'], [300, '5 Minuten'], [1200, '20 Minuten']]) {
      if (S.samples.length < w) continue;
      let s = 0; for (let i = S.samples.length - w; i < S.samples.length; i++) s += S.samples[i].p;
      const avg = s / w, base = S.bestBase?.[w]?.w || 0, shown = S.bestShown[w] || 0;
      if (base && avg > base && avg > shown * 1.03) { S.bestShown[w] = avg; popBest(S, `🏆 Neue Bestleistung ${label}`, Math.round(avg) + ' W'); }
    }
  }
}
function popBest(S, title, val) {
  const p = $('#prPop', S.el); if (!p) return;
  p.innerHTML = `<span>${title}</span><b class="num">${val}</b>`; p.classList.remove('show'); void p.offsetWidth; p.classList.add('show');
  clearTimeout(S.popT); S.popT = setTimeout(() => p.classList.remove('show'), 3200); sound.levelUp();
}
export function lapReset(S) { if (S.pups) { S.pups.forEach(p => p.got = false); S.world.resetPickups?.(); } }

/* ---------- Anzeige (alle 200 ms) ---------- */
export function plusHud(S, p3, c) {
  const el = S.el, ftp = profile.ftp, f = p3 / ftp, col = zoneColor(f);
  // Ring
  if (S.ringArc) {
    $('#prVal', el).setAttribute('d', f > .01 ? S.ringArc(0, Math.min(f, 1.6)) : 'M0,0'); $('#prVal', el).setAttribute('stroke', col);
    $('#prW', el).textContent = Math.round(p3); $('#prW', el).style.color = col; $('#prZ', el).textContent = 'Z' + ([.55, .75, .9, 1.05, 1.2, 1.5].filter(z => f >= z).length + 1) + ' · ' + Math.round(f * 100) + ' % FTP';
    const t = $('#prTgt', el);
    if (S.target != null) { const [x1, y1] = S.ringPt(S.target / ftp), [cx, cy] = [60, 60], k = 1.22; t.setAttribute('x1', x1); t.setAttribute('y1', y1); t.setAttribute('x2', cx + (x1 - cx) * k); t.setAttribute('y2', cy + (y1 - cy) * k); t.style.display = ''; } else t.style.display = 'none';
  }
  // Tempolinien ab ~45 km/h
  const sl = el.querySelector('.speedlines'); if (sl && !sl.hidden) sl.style.opacity = clamp((S.v * 3.6 - 42) / 25, 0, .85);
  // Leuchtrand
  const e = el.querySelector('.zoneedge'); if (e && !e.hidden) { e.style.setProperty('--zc', col); e.style.opacity = S.state === 'riding' ? clamp(.25 + f * .5, .25, 1) : 0; }
  // Power-up
  const pb = $('#pupBox', el);
  if (pb) {
    const act = S.pupActive && S.t < S.pupActive.until ? S.pupActive : null;
    pb.hidden = !S.pupHeld && !act;
    if (act) { pb.className = 'pupbox active'; pb.innerHTML = `<span>${PUPS[act.k].icon}</span><b class="num">${Math.ceil(act.until - S.t)} s</b><small>${PUPS[act.k].name}</small>`; }
    else if (S.pupHeld) { pb.className = 'pupbox'; pb.innerHTML = `<span>${PUPS[S.pupHeld].icon}</span><b>Einsetzen</b><small>Taste U</small>`; }
  }
  // Anstiegsprofil
  const cv = $('#clProf', el); if (!cv) return;
  cv.hidden = !c || !c.gain;
  if (c && c.gain) {
    const R = S.route, r = cv.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1), w = Math.round(r.width * d), h = Math.round(r.height * d);
    if (!w || !h) return; if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    const x = cv.getContext('2d'), n = 60, e0 = R.eleAt(c.from), e1 = R.eleAt(c.to), mn = Math.min(e0, e1) - 2, mx = Math.max(e0, e1) + 2;
    x.clearRect(0, 0, w, h);
    for (let i = 0; i < n; i++) {
      const da = c.from + c.len * i / n, db = c.from + c.len * (i + 1) / n, g = (R.eleAt(db) - R.eleAt(da)) / (db - da) * 100;
      const ya = h - (R.eleAt(da) - mn) / (mx - mn) * h, yb = h - (R.eleAt(db) - mn) / (mx - mn) * h;
      x.fillStyle = g > 10 ? '#ef4458' : g > 7 ? '#ff6a3d' : g > 4 ? '#f5c542' : '#4fd18b'; x.globalAlpha = da < S.dist ? .45 : .95;
      x.beginPath(); x.moveTo(i / n * w, h); x.lineTo(i / n * w, ya); x.lineTo((i + 1) / n * w + .5, yb); x.lineTo((i + 1) / n * w + .5, h); x.fill();
    }
    x.globalAlpha = 1; const px = clamp((S.dist - c.from) / c.len, 0, 1) * w, py = h - (R.eleAt(S.dist) - mn) / (mx - mn) * h;
    x.fillStyle = '#fff'; x.beginPath(); x.arc(px, Math.max(5 * d, py), 4.5 * d, 0, 7); x.fill(); x.strokeStyle = '#111'; x.lineWidth = 1.5 * d; x.stroke();
  }
}

/* ---------- Fotomodus: Fahrt pausiert, Anzeigen weg, Kamera frei drehen, Filter, speichern ---------- */
const FILTERS = { none: ['Natur', 'none'], warm: ['Warm', 'sepia(.25) saturate(1.3) contrast(1.05)'], cool: ['Kühl', 'hue-rotate(-12deg) saturate(1.1) brightness(1.05)'], bw: ['Schwarzweiß', 'grayscale(1) contrast(1.15)'], vivid: ['Kräftig', 'saturate(1.6) contrast(1.12)'], retro: ['Retro', 'sepia(.55) contrast(.95) brightness(1.05) saturate(.8)'] };
export function photoMode(S, on) {
  const W = S.world, rw = S.el.querySelector('#rw');
  if (!on) { W.photo = null; W.camInit = false; rw.classList.remove('photo'); rw.querySelector('.photobar')?.remove(); S.el.querySelector('#gl').style.filter = ''; if (S.photoWas === 'riding') S.state = 'riding'; return; }
  if (W.photo) return;
  S.photoWas = S.state; if (S.state === 'riding') S.state = 'paused';
  W.photo = { yaw: Math.PI * .75, pitch: .25, dist: 4.5 }; W.camInit = false; rw.classList.add('photo');
  const bar = document.createElement('div'); bar.className = 'photobar';
  bar.innerHTML = `<span class="small">🎞️ Fotomodus · ziehen zum Drehen, Mausrad/zwei Finger zum Zoomen</span><span class="row">${Object.entries(FILTERS).map(([k, [l]]) => `<button class="btn xs ${k === 'none' ? 'on' : ''}" data-f="${k}">${l}</button>`).join('')}</span><span class="row"><button class="btn sm pri" data-save>📷 Speichern</button><button class="btn sm ghost" data-close>Schließen</button></span>`;
  rw.appendChild(bar);
  const gl = S.el.querySelector('#gl'); let filt = 'none';
  bar.onclick = async e => {
    const f = e.target.closest('[data-f]'); if (f) { filt = f.dataset.f; gl.style.filter = FILTERS[filt][1]; bar.querySelectorAll('[data-f]').forEach(b => b.classList.toggle('on', b === f)); }
    if (e.target.closest('[data-close]')) photoMode(S, false);
    if (e.target.closest('[data-save]')) {
      const src = W.capture(1920), c = document.createElement('canvas'); c.width = src.width; c.height = src.height; const x = c.getContext('2d'); x.filter = FILTERS[filt][1]; x.drawImage(src, 0, 0);
      x.filter = 'none'; x.font = `600 ${Math.round(c.height / 36)}px Barlow, sans-serif`; x.fillStyle = 'rgba(255,255,255,.85)'; x.textAlign = 'right'; x.fillText('VeloVerse · ' + S.route.name, c.width - 24, c.height - 24);
      c.toBlob(b => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'veloverse-foto-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.jpg'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }, 'image/jpeg', .92);
    }
  };
  // Kamera drehen und zoomen
  const pts = new Map(); let d0 = 0, z0 = 0;
  gl.onpointerdown = e => { if (!W.photo) return; gl.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); if (pts.size === 2) { const [a, b] = [...pts.values()]; d0 = Math.hypot(a[0] - b[0], a[1] - b[1]); z0 = W.photo.dist; } };
  gl.onpointermove = e => { if (!W.photo || !pts.has(e.pointerId)) return; const [px, py] = pts.get(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); if (pts.size === 2) { const [a, b] = [...pts.values()]; W.photo.dist = clamp(z0 * d0 / (Math.hypot(a[0] - b[0], a[1] - b[1]) || 1), 1.5, 25); return; } W.photo.yaw -= (e.clientX - px) * .008; W.photo.pitch = clamp(W.photo.pitch + (e.clientY - py) * .005, -.1, 1.3); };
  gl.onpointerup = gl.onpointercancel = e => pts.delete(e.pointerId);
  gl.onwheel = e => { if (!W.photo) return; e.preventDefault(); W.photo.dist = clamp(W.photo.dist * (e.deltaY > 0 ? 1.1 : .9), 1.5, 25); };
}
