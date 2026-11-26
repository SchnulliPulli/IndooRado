// Teilen (z. B. Strava): passender Titel, Beschreibung, Übersichtsbild der gefahrenen Strecke
import { fmtKm, fmtDur, zoneColor } from './util.js';
import { BADGES } from './analysis.js';

export function stravaTitle(ride) {
  const parts = [];
  if (ride.plan || ride.planId) parts.push(`${ride.plan?.name || 'Trainingsplan'} W${ride.planWeek || '?'}`);
  if (ride.workoutName) parts.push(ride.workoutName);
  parts.push(ride.routeName + (ride.laps ? ` (${ride.laps + 1} Runden)` : ''));
  return 'Indoorado: ' + parts.join(' · ');
}
export function stravaText(ride) {
  const s = ride.sum, L = [];
  L.push(`${fmtKm(s.dist)} km · ${fmtDur(s.dur)} · ${s.asc} Hm`);
  L.push(`Ø ${s.avgP} W · NP ${s.np} W · TSS ${s.tss}${s.avgHr ? ' · Ø ' + s.avgHr + ' bpm' : ''}${s.avgCad ? ' · Ø ' + s.avgCad + ' U/min' : ''}`);
  if (ride.workoutName) L.push(`Workout: ${ride.workoutName}${ride.workoutDone ? ' ✅' : ''}`);
  const tops = (ride.climbs || []).map(c => `⛰ ${c.name} ${Math.floor(c.time / 60)}:${String(Math.round(c.time % 60)).padStart(2, '0')}${c.pr ? ' (Bestzeit)' : ''}`);
  if (tops.length) L.push(tops.join(' · '));
  if (ride.overtakes) L.push(`${ride.overtakes} Fahrer überholt`);
  if (ride.newBadges?.length) L.push('🏆 ' + ride.newBadges.map(b => BADGES.find(x => x.id === b)?.name).filter(Boolean).join(', '));
  L.push('Indoor gefahren mit Indoorado');
  return L.join('\n');
}

// Übersichtsbild 1600×1000: Karte (nach Leistung eingefärbt), Höhenprofil, Kennzahlen
export async function overviewImage(ride, ftp) {
  try { await document.fonts?.ready; } catch (e) { }
  const W = 1600, H = 1000, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#141a20'); g.addColorStop(1, '#1d2731'); x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.fillStyle = '#ff6a3d'; x.font = '700 30px Barlow, Arial'; x.fillText('INDOORADO', 56, 70);
  x.fillStyle = '#fff'; x.font = '700 54px "Barlow Condensed", Barlow, Arial'; x.fillText(trim(x, ride.title, W - 112), 56, 132);
  x.fillStyle = '#9aa7b3'; x.font = '500 24px Barlow, Arial'; x.fillText(new Date(ride.date).toLocaleString('de-DE', { dateStyle: 'full', timeStyle: 'short' }), 56, 170);
  // Karte aus den aufgezeichneten Koordinaten; Sprünge (Beamen) werden nicht verbunden
  const S = ride.samples.filter(s => s.la != null), mx = { x: 56, y: 210, w: 900, h: 560 };
  x.fillStyle = 'rgba(255,255,255,.04)'; rr(x, mx.x, mx.y, mx.w, mx.h, 20); x.fill();
  if (S.length > 1) {
    let a = 1e9, b = -1e9, e = 1e9, f = -1e9; for (const s of S) { a = Math.min(a, s.la); b = Math.max(b, s.la); e = Math.min(e, s.lo); f = Math.max(f, s.lo); }
    const k = Math.cos(a * Math.PI / 180), sx = (f - e) * k || 1e-6, sy = (b - a) || 1e-6, pad = 40, sc = Math.min((mx.w - 2 * pad) / sx, (mx.h - 2 * pad) / sy);
    const ox = mx.x + (mx.w - sx * sc) / 2, oy = mx.y + (mx.h - sy * sc) / 2, P = s => [ox + (s.lo - e) * k * sc, mx.y + mx.h - (oy - mx.y) - (s.la - a) * sc];
    x.lineJoin = x.lineCap = 'round';
    x.strokeStyle = 'rgba(0,0,0,.5)'; x.lineWidth = 14; x.beginPath(); S.forEach((s, i) => { const [px, py] = P(s); i && Math.abs(s.d - S[i - 1].d) < 200 && Math.abs(s.rd - S[i - 1].rd) < 200 ? x.lineTo(px, py) : x.moveTo(px, py); }); x.stroke();
    x.lineWidth = 8;
    for (let i = 1; i < S.length; i++) { if (Math.abs(S[i].rd - S[i - 1].rd) > 200) continue; const [x0, y0] = P(S[i - 1]), [x1, y1] = P(S[i]); x.strokeStyle = zoneColor(S[i].p / ftp); x.beginPath(); x.moveTo(x0, y0); x.lineTo(x1, y1); x.stroke(); }
    const dot = (s, col) => { const [px, py] = P(s); x.fillStyle = col; x.beginPath(); x.arc(px, py, 12, 0, 7); x.fill(); x.strokeStyle = '#fff'; x.lineWidth = 4; x.stroke(); };
    dot(S[0], '#4fd18b'); dot(S[S.length - 1], '#ef4458');
  }
  // Kennzahlen rechts
  const s = ride.sum, items = [[fmtKm(s.dist), 'km'], [fmtDur(s.dur), 'Fahrzeit'], [s.asc + ' m', 'Höhenmeter'], [s.avgP + ' W', 'Ø Leistung'], [s.np + ' W', 'NP'], [s.tss, 'TSS'], [s.avgHr ? s.avgHr + ' bpm' : '–', 'Ø Puls'], [(s.avgV * 3.6).toFixed(1).replace('.', ',') + ' km/h', 'Ø Tempo']];
  items.forEach(([v, l], i) => { const cx = 1000 + (i % 2) * 280, cy = 220 + Math.floor(i / 2) * 140; x.fillStyle = 'rgba(255,255,255,.06)'; rr(x, cx, cy, 260, 120, 16); x.fill(); x.fillStyle = '#fff'; x.font = '700 50px "Barlow Condensed", Barlow, Arial'; x.fillText(String(v), cx + 22, cy + 66); x.fillStyle = '#9aa7b3'; x.font = '500 22px Barlow, Arial'; x.fillText(l, cx + 22, cy + 100); });
  // Höhenprofil unten
  const py0 = 810, ph = 140, pw = W - 112, E = ride.samples.map(q => q.e), D = ride.samples.map(q => q.d);
  if (E.length > 1) {
    let lo = Math.min(...E), hi = Math.max(...E); if (hi - lo < 30) hi = lo + 30; const Dm = D[D.length - 1] || 1;
    x.fillStyle = 'rgba(255,106,61,.25)'; x.strokeStyle = '#ff6a3d'; x.lineWidth = 3; x.beginPath(); x.moveTo(56, py0 + ph);
    const st = Math.max(1, Math.floor(E.length / 800));
    for (let i = 0; i < E.length; i += st) x.lineTo(56 + D[i] / Dm * pw, py0 + ph - (E[i] - lo) / (hi - lo) * ph);
    x.lineTo(56 + pw, py0 + ph); x.closePath(); x.fill(); x.stroke();
  }
  return new Promise(res => c.toBlob(res, 'image/jpeg', .9));
}
// Fakten-Bild 1600×900 (wie die Fahrtfotos): Hintergrund ein Foto der Fahrt, darüber alle Kennzahlen und Höhepunkte
export async function factsImage(ride, ftp, bgBlob, opt = {}) {
  try { await document.fonts?.ready; } catch (e) { }
  const W = 1600, H = 900, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'), s = ride.sum;
  // Hintergrund: Foto (abgedunkelt) oder Farbverlauf
  let img = null; if (bgBlob) try { img = await createImageBitmap(bgBlob); } catch (e) { }
  if (img) { const k = Math.max(W / img.width, H / img.height); x.drawImage(img, (W - img.width * k) / 2, (H - img.height * k) / 2, img.width * k, img.height * k); }
  else { const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#1b2633'); g.addColorStop(1, '#2b1d24'); x.fillStyle = g; x.fillRect(0, 0, W, H); }
  let g = x.createLinearGradient(0, 0, W, 0); g.addColorStop(0, 'rgba(8,10,14,.92)'); g.addColorStop(.62, 'rgba(8,10,14,.72)'); g.addColorStop(1, 'rgba(8,10,14,.35)'); x.fillStyle = g; x.fillRect(0, 0, W, H);
  // Kopf
  x.fillStyle = '#ff6a3d'; x.font = '700 26px Barlow, Arial'; x.fillText('INDOORADO', 64, 72);
  x.fillStyle = '#fff'; x.font = '700 58px "Barlow Condensed", Barlow, Arial'; x.fillText(trim(x, ride.title, W - 128), 64, 136);
  x.fillStyle = '#b8c3cc'; x.font = '500 24px Barlow, Arial'; x.fillText(new Date(ride.date).toLocaleString('de-DE', { dateStyle: 'full', timeStyle: 'short' }) + (ride.workoutDone ? '  ·  ✅ Workout geschafft' : ''), 64, 176);
  // Große Werte
  const big = [[fmtKm(s.dist), 'km'], [fmtDur(s.dur), 'Fahrzeit'], [s.avgP + ' W', 'Ø Leistung'], [s.asc + ' m', 'Höhenmeter']];
  big.forEach(([v, l], i) => { const cx = 64 + i * 230; x.fillStyle = '#fff'; x.font = '700 76px "Barlow Condensed", Barlow, Arial'; x.fillText(v, cx, 300); x.fillStyle = '#9fb0bd'; x.font = '600 22px Barlow, Arial'; x.fillText(l.toUpperCase(), cx, 334); });
  // Weitere Werte als Kacheln
  const kj = s.kj ?? Math.round(s.avgP * s.dur / 1000);
  const small = [[s.np + ' W', 'NP'], [String(s.tss ?? '–'), 'TSS'], [s.avgHr ? s.avgHr + ' bpm' : '–', 'Ø Puls'], [s.maxHr ? s.maxHr + ' bpm' : '–', 'max. Puls'], [((s.avgV || 0) * 3.6).toFixed(1).replace('.', ',') + ' km/h', 'Ø Tempo'], [s.avgCad ? s.avgCad + ' U/min' : '–', 'Ø Trittfrequenz'], [kj + ' kJ', 'Arbeit'], [(ride.xp ?? '–') + ' XP', 'Erfahrung']];
  small.forEach(([v, l], i) => { const cx = 64 + (i % 4) * 230, cy = 380 + Math.floor(i / 4) * 116; x.fillStyle = 'rgba(255,255,255,.08)'; rr(x, cx, cy, 214, 100, 16); x.fill(); x.fillStyle = '#fff'; x.font = '700 40px "Barlow Condensed", Barlow, Arial'; x.fillText(v, cx + 18, cy + 52); x.fillStyle = '#9fb0bd'; x.font = '500 19px Barlow, Arial'; x.fillText(l, cx + 18, cy + 82); });
  // Höhepunkte rechts
  const facts = [];
  for (const k of (ride.prs || []).filter(k => [5, 60, 300, 1200, 3600].includes(+k)).slice(0, 3)) facts.push(['🏆', `Bestwert ${k < 60 ? k + ' s' : k / 60 + ' min'}: ${s.curve?.[k]} W`]);
  for (const cl of (ride.climbs || []).slice(0, 3)) facts.push(['⛰', `${cl.name}: ${Math.floor(cl.time / 60)}:${String(Math.round(cl.time % 60)).padStart(2, '0')}${cl.pr ? ' (Bestzeit)' : ''}`]);
  if (ride.routeBadge) facts.push(['🏅', 'Routen-Abzeichen ' + ride.routeBadge]);
  for (const b of (ride.newBadges || []).slice(0, 2)) { const B = BADGES.find(z => z.id === b); if (B) facts.push(['🎖', 'Abzeichen: ' + B.name]); }
  if (ride.race) facts.push(['🏁', `Rennen: Platz ${ride.race.place} von ${ride.race.of}`]);
  if (ride.mp?.riders?.length) facts.push(['🌐', 'Mit ' + ride.mp.riders.slice(0, 3).join(', ') + (ride.mp.won ? ` · ${ride.mp.won} Duell${ride.mp.won > 1 ? 'e' : ''} gewonnen` : '')]);
  if (ride.overtakes) facts.push(['💨', ride.overtakes + ' Fahrer überholt']);
  if (ride.rideOns?.got) facts.push(['👍', ride.rideOns.got + ' Ride Ons bekommen']);
  if (s.maxP) facts.push(['⚡', 'Spitzenleistung ' + s.maxP + ' W']);
  if (opt.extra) facts.push(...opt.extra);
  const fx = 1040, fy = 230;
  if (facts.length) {
    x.fillStyle = 'rgba(8,10,14,.55)'; rr(x, fx - 24, fy - 54, W - fx - 40, Math.min(facts.length, 9) * 58 + 74, 20); x.fill();
    x.fillStyle = '#ff6a3d'; x.font = '700 22px Barlow, Arial'; x.fillText('HÖHEPUNKTE', fx, fy - 14);
    facts.slice(0, 9).forEach(([ic, t], i) => { x.font = '30px Barlow, Arial'; x.fillStyle = '#fff'; x.fillText(ic, fx, fy + 40 + i * 58); x.font = '600 25px Barlow, Arial'; x.fillText(trim(x, t, W - fx - 110), fx + 48, fy + 38 + i * 58); });
  }
  // Höhenprofil unten, eingefärbt nach Leistung
  const E = ride.samples.map(q => q.e), D = ride.samples.map(q => q.d), py0 = 680, ph = 150, px0 = 64, pw = W - 128;
  if (E.length > 1) {
    let lo = Math.min(...E), hi = Math.max(...E); if (hi - lo < 30) hi = lo + 30; const Dm = D[D.length - 1] || 1, st = Math.max(1, Math.floor(E.length / 600));
    for (let i = st; i < E.length; i += st) { const x0 = px0 + D[i - st] / Dm * pw, x1 = px0 + D[i] / Dm * pw, y1 = py0 + ph - (E[i] - lo) / (hi - lo) * ph; x.fillStyle = zoneColor((ride.samples[i].p || 0) / ftp); x.globalAlpha = .85; x.fillRect(x0, y1, Math.max(1, x1 - x0 + .6), py0 + ph - y1); }
    x.globalAlpha = 1;
  }
  return new Promise(res => c.toBlob(res, 'image/jpeg', .9));
}
// Text zum Teilen in sozialen Netzwerken: kurz, mit Emojis und Hashtags
export function shareText(ride) {
  const s = ride.sum, L = [`🚴 ${fmtKm(s.dist)} km · ⏱ ${fmtDur(s.dur)} · ⛰ ${s.asc} Hm · ⚡ Ø ${s.avgP} W`];
  if (ride.workoutName) L.push(`🏋️ ${ride.workoutName}${ride.workoutDone ? ' ✅' : ''}`);
  const pr = (ride.prs || []).filter(k => [60, 300, 1200].includes(+k)); if (pr.length) L.push('🏆 Neue Bestwerte: ' + pr.map(k => (k < 60 ? k + ' s' : k / 60 + ' min') + ' ' + s.curve?.[k] + ' W').join(', '));
  const cl = (ride.climbs || []).find(c => c.pr); if (cl) L.push(`⛰ Bestzeit am ${cl.name}`);
  if (ride.mp?.riders?.length) L.push('🌐 Zusammen mit ' + ride.mp.riders.slice(0, 3).join(', '));
  L.push('', '#Indoorado #IndoorCycling #Radtraining #Rollentraining');
  return L.join('\n');
}
// Bild für soziale Medien: 'story' 1080×1920 (Instagram/WhatsApp-Status/TikTok), 'square' 1080×1080 (Feed), sonst das Querformat
export async function socialImage(ride, ftp, bgBlob, fmt = 'story') {
  if (fmt === 'wide') return factsImage(ride, ftp, bgBlob);
  try { await document.fonts?.ready; } catch (e) { }
  const W = 1080, H = fmt === 'story' ? 1920 : 1080, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'), s = ride.sum, story = fmt === 'story';
  let img = null; if (bgBlob) try { img = await createImageBitmap(bgBlob); } catch (e) { }
  if (img) { const k = Math.max(W / img.width, H / img.height); x.drawImage(img, (W - img.width * k) / 2, (H - img.height * k) / 2, img.width * k, img.height * k); }
  else { const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#1b2633'); g.addColorStop(1, '#3a1f28'); x.fillStyle = g; x.fillRect(0, 0, W, H); }
  let g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, 'rgba(8,10,14,.55)'); g.addColorStop(story ? .3 : .25, 'rgba(8,10,14,.35)'); g.addColorStop(story ? .55 : .5, 'rgba(8,10,14,.82)'); g.addColorStop(1, 'rgba(8,10,14,.96)'); x.fillStyle = g; x.fillRect(0, 0, W, H);
  const M = 72;
  // Kopf
  x.fillStyle = '#ff6a3d'; x.font = '800 34px Barlow, Arial'; x.fillText('INDOORADO', M, M + 30);
  x.fillStyle = 'rgba(255,255,255,.8)'; x.font = '500 28px Barlow, Arial'; x.textAlign = 'right'; x.fillText(new Date(ride.date).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' }), W - M, M + 30); x.textAlign = 'left';
  // Titel (bis zwei Zeilen)
  const ty = story ? 700 : 420; x.fillStyle = '#fff'; x.font = `700 ${story ? 84 : 66}px "Barlow Condensed", Barlow, Arial`;
  const lines = wrap(x, ride.routeName || ride.title, W - 2 * M).slice(0, 2); lines.forEach((l, i) => x.fillText(l, M, ty + i * (story ? 88 : 70)));
  let y = ty + lines.length * (story ? 88 : 70) - 10;
  if (ride.workoutName) { x.fillStyle = '#ffb08f'; x.font = '600 34px Barlow, Arial'; x.fillText(trim(x, '🏋️ ' + ride.workoutName + (ride.workoutDone ? ' ✅' : ''), W - 2 * M), M, y + 46); y += 50; }
  // Große Werte 2×2
  const big = [[fmtKm(s.dist), 'KM'], [fmtDur(s.dur), 'FAHRZEIT'], [s.avgP + ' W', 'Ø LEISTUNG'], [s.asc + ' m', 'HÖHENMETER']];
  y += story ? 60 : 30; const bw = (W - 2 * M) / 2, bh = story ? 170 : 128;
  big.forEach(([v, l], i) => { const bx = M + (i % 2) * bw, by = y + Math.floor(i / 2) * bh; x.fillStyle = '#fff'; x.font = `700 ${story ? 104 : 80}px "Barlow Condensed", Barlow, Arial`; x.fillText(v, bx, by + (story ? 96 : 74)); x.fillStyle = '#ff9c7a'; x.font = '700 26px Barlow, Arial'; x.fillText(l, bx, by + (story ? 134 : 106)); });
  y += 2 * bh + (story ? 20 : 4);
  // Kleine Werte und Höhepunkte (nur Story hat Platz dafür)
  if (story) {
    const small = [[s.np + ' W', 'NP'], [s.avgHr ? s.avgHr + ' bpm' : '–', 'Ø Puls'], [((s.avgV || 0) * 3.6).toFixed(1).replace('.', ',') + ' km/h', 'Ø Tempo']];
    const sw = (W - 2 * M - 2 * 20) / 3;
    small.forEach(([v, l], i) => { const bx = M + i * (sw + 20); x.fillStyle = 'rgba(255,255,255,.1)'; rr(x, bx, y, sw, 120, 22); x.fill(); x.fillStyle = '#fff'; x.font = '700 46px "Barlow Condensed", Barlow, Arial'; x.fillText(v, bx + 24, y + 62); x.fillStyle = '#aab6c0'; x.font = '500 24px Barlow, Arial'; x.fillText(l, bx + 24, y + 98); });
    y += 170;
    const facts = [];
    for (const k of (ride.prs || []).filter(k => [5, 60, 300, 1200].includes(+k)).slice(0, 2)) facts.push(`🏆 Bestwert ${k < 60 ? k + ' s' : k / 60 + ' min'}: ${s.curve?.[k]} W`);
    for (const cl of (ride.climbs || []).slice(0, 2)) facts.push(`⛰ ${cl.name}: ${Math.floor(cl.time / 60)}:${String(Math.round(cl.time % 60)).padStart(2, '0')}${cl.pr ? ' · Bestzeit' : ''}`);
    if (ride.mp?.riders?.length) facts.push('🌐 Mit ' + ride.mp.riders.slice(0, 2).join(', '));
    if (ride.overtakes) facts.push(`💨 ${ride.overtakes} überholt`);
    if (ride.race) facts.push(`🏁 Platz ${ride.race.place} von ${ride.race.of}`);
    x.font = '600 36px Barlow, Arial'; x.fillStyle = '#fff';
    facts.slice(0, 4).forEach((f, i) => x.fillText(trim(x, f, W - 2 * M), M, y + i * 56));
  }
  // Höhenprofil unten, nach Leistung eingefärbt
  const E = ride.samples.map(q => q.e), D = ride.samples.map(q => q.d), ph = story ? 170 : 130, py0 = H - M - ph - 40, pw = W - 2 * M;
  if (E.length > 1) {
    let lo = Math.min(...E), hi = Math.max(...E); if (hi - lo < 30) hi = lo + 30; const Dm = D[D.length - 1] || 1, st = Math.max(1, Math.floor(E.length / 500));
    for (let i = st; i < E.length; i += st) { const x0 = M + D[i - st] / Dm * pw, x1 = M + D[i] / Dm * pw, y1 = py0 + ph - (E[i] - lo) / (hi - lo) * ph; x.fillStyle = zoneColor((ride.samples[i].p || 0) / ftp); x.globalAlpha = .9; x.fillRect(x0, y1, Math.max(1, x1 - x0 + .6), py0 + ph - y1); }
    x.globalAlpha = 1;
  }
  x.fillStyle = 'rgba(255,255,255,.65)'; x.font = '500 26px Barlow, Arial'; x.fillText('Indoor gefahren mit Indoorado', M, H - M + 6);
  return new Promise(res => c.toBlob(res, 'image/jpeg', .92));
}
function wrap(x, t, max) { const w = String(t).split(' '), out = []; let cur = ''; for (const s of w) { const n = cur ? cur + ' ' + s : s; if (x.measureText(n).width > max && cur) { out.push(cur); cur = s; } else cur = n; } if (cur) out.push(cur); return out; }
function rr(x, a, b, w, h, r) { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); }
function trim(x, t, max) { if (x.measureText(t).width <= max) return t; while (t.length > 3 && x.measureText(t + '…').width > max) t = t.slice(0, -1); return t + '…'; }

// Bestes Fahrtfoto: Gipfel oder Ziel bevorzugt, sonst aus der Mitte
export function bestShot(shots) {
  if (!shots.length) return null;
  return shots.find(s => /Gipfel|Ziel|geschafft/.test(s.caption)) || shots[Math.floor(shots.length / 2)];
}
