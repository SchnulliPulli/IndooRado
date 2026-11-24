// Teilen (z. B. Strava): passender Titel, Beschreibung, Übersichtsbild der gefahrenen Strecke
import { fmtKm, fmtDur, zoneColor } from './util.js';
import { BADGES } from './analysis.js';

export function stravaTitle(ride) {
  const parts = [];
  if (ride.plan || ride.planId) parts.push(`${ride.plan?.name || 'Trainingsplan'} W${ride.planWeek || '?'}`);
  if (ride.workoutName) parts.push(ride.workoutName);
  parts.push(ride.routeName + (ride.laps ? ` (${ride.laps + 1} Runden)` : ''));
  return 'VeloVerse: ' + parts.join(' · ');
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
  L.push('Indoor gefahren mit VeloVerse');
  return L.join('\n');
}

// Übersichtsbild 1600×1000: Karte (nach Leistung eingefärbt), Höhenprofil, Kennzahlen
export async function overviewImage(ride, ftp) {
  try { await document.fonts?.ready; } catch (e) { }
  const W = 1600, H = 1000, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#141a20'); g.addColorStop(1, '#1d2731'); x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.fillStyle = '#ff6a3d'; x.font = '700 30px Barlow, Arial'; x.fillText('VELOVERSE', 56, 70);
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
function rr(x, a, b, w, h, r) { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); }
function trim(x, t, max) { if (x.measureText(t).width <= max) return t; while (t.length > 3 && x.measureText(t + '…').width > max) t = t.slice(0, -1); return t + '…'; }

// Bestes Fahrtfoto: Gipfel oder Ziel bevorzugt, sonst aus der Mitte
export function bestShot(shots) {
  if (!shots.length) return null;
  return shots.find(s => /Gipfel|Ziel|geschafft/.test(s.caption)) || shots[Math.floor(shots.length / 2)];
}
