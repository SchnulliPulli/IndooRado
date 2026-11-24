// Startseite: Geräte, Fahrt einrichten, Fortschritt
import { $, esc, fmtKm, fmtDur, bus } from '../util.js';
import { profile, sel, saveSel, progress, levelOf } from '../state.js';
import { deviceCards, levelBar, rideRow, statTiles, ICON } from '../components.js';
import { listRoutes, quickStats, THEMES } from '../routes.js';
import { listWorkouts, stats as wStats, drawWorkout, getWorkout } from '../workouts.js';
import { db } from '../db.js';
import { totals } from '../analysis.js';

export function routeSvg(raw, w = 300, h = 54) {
  const p = raw.pts, n = 80; let mn = Infinity, mx = -Infinity;
  for (const q of p) { mn = Math.min(mn, q[2]); mx = Math.max(mx, q[2]); }
  if (mx - mn < 40) mx = mn + 40;
  let s = '';
  for (let k = 0; k <= n; k++) { const q = p[Math.floor(k / n * (p.length - 1))]; s += (k ? 'L' : 'M') + (k / n * w).toFixed(1) + ',' + (h - 2 - (q[2] - mn) / (mx - mn) * (h - 6)).toFixed(1); }
  return `<svg class="prof" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><path d="${s}L${w},${h}L0,${h}Z" fill="#ff6a3d33" stroke="#ff6a3d" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>`;
}
export function routeMapSvg(raw, size = 64) {
  const p = raw.pts; let a = 1e9, b = -1e9, c = 1e9, d = -1e9;
  for (const q of p) { a = Math.min(a, q[0]); b = Math.max(b, q[0]); c = Math.min(c, q[1]); d = Math.max(d, q[1]); }
  const k = Math.cos(a * Math.PI / 180), sx = (d - c) * k || 1e-6, sy = (b - a) || 1e-6, s = (size - 8) / Math.max(sx, sy);
  const ox = (size - sx * s) / 2, oy = (size - sy * s) / 2;
  const step = Math.max(1, Math.floor(p.length / 160));
  let path = ''; for (let i = 0; i < p.length; i += step) path += (i ? 'L' : 'M') + (ox + (p[i][1] - c) * k * s).toFixed(1) + ',' + (size - oy - (p[i][0] - a) * s).toFixed(1);
  return `<svg class="rmap" viewBox="0 0 ${size} ${size}"><path d="${path}" fill="none" stroke="#eef2f5" stroke-width="2" stroke-linejoin="round"/></svg>`;
}

let off = [];
export async function render(el) {
  const routes = await listRoutes(), wos = await listWorkouts(), rides = (await db.all('rides')).sort((a, b) => b.date.localeCompare(a.date));
  const t = totals(rides), wk = Date.now() - 7 * 864e5, week = rides.filter(r => +new Date(r.date) > wk);
  const wkSum = week.reduce((a, r) => ({ d: a.d + r.sum.dist, t: a.t + r.sum.dur, tss: a.tss + r.sum.tss }), { d: 0, t: 0, tss: 0 });
  if (!routes.find(r => r.id === sel.routeId)) sel.routeId = 'b-hills';
  const cats = [...new Set(wos.map(w => w.cat))];
  el.innerHTML = `
  <section class="hero">
    <div><h1>Hallo ${esc(profile.name)}</h1><p class="muted">FTP ${profile.ftp} W · ${String(profile.kg).replace('.', ',')} kg · ${(profile.ftp / profile.kg).toFixed(2).replace('.', ',')} W/kg</p></div>
    <div class="hero-lv">${levelBar()}</div>
  </section>
  <section class="card"><div class="row between"><h2>Geräte</h2><a href="#/devices" class="small">Details und Tasten anlernen</a></div><div id="devs"></div></section>
  <section class="card">
    <h2>Fahrt einrichten</h2>
    <h3 class="sub">Strecke</h3>
    <div class="routepick scroll" id="routePick">${routes.map(r => { const s = quickStats(r); return `
      <button class="rcard ${r.id === sel.routeId ? 'on' : ''}" data-rid="${esc(r.id)}" style="--sky:${(THEMES[r.theme] || THEMES.meadow).sky[0]}">
        <div class="row between">${routeMapSvg(r, 56)}<div class="rc-meta num">${fmtKm(s.dist)} km<br>${Math.round(s.asc)} hm</div></div>
        <div class="t">${esc(r.name)}</div><div class="small muted">${r.loop ? 'Rundkurs' : 'Einzelstrecke'}${r.builtin ? '' : ' · eigene'}</div>${routeSvg(r)}
      </button>`; }).join('')}</div>
    <div class="setup">
      <div>
        <h3 class="sub">Workout</h3>
        <select id="woSel" class="inp"><option value="">Kein Workout, freie Fahrt</option>${cats.map(c => `<optgroup label="${esc(c)}">${wos.filter(w => w.cat === c).map(w => `<option value="${esc(w.id)}" ${w.id === sel.workoutId ? 'selected' : ''}>${esc(w.name)} · ${fmtDur(wStats(w).dur)}</option>`).join('')}</optgroup>`).join('')}</select>
        <div class="wprev"><canvas id="woPrev"></canvas><div class="small muted" id="woInfo"></div></div>
      </div>
      <div>
        <h3 class="sub">Widerstand bei freier Fahrt</h3>
        <div class="seg" id="modeSeg">${[['gear', 'Virtuelle Gänge'], ['sim', 'Steigung'], ['erg', 'ERG fix']].map(([k, l]) => `<button data-m="${k}" aria-pressed="${sel.mode === k}">${l}</button>`).join('')}</div>
        <p class="small muted" id="modeTxt"></p>
        <h3 class="sub">Schrittmacher</h3>
        <div class="seg" id="pacerSeg">${[0, 2, 2.5, 3, 3.5, 4].map(v => `<button data-p="${v}" aria-pressed="${sel.pacer === v}">${v ? String(v).replace('.', ',') + ' W/kg' : 'Aus'}</button>`).join('')}</div>
      </div>
    </div>
    <div class="row end" style="margin-top:14px"><a class="btn pri big" href="#/ride">${ICON.ride} Fahrt starten</a></div>
  </section>
  <section class="grid2">
    <div class="card"><div class="row between"><h2>Diese Woche</h2><a href="#/progress" class="small">Fortschritt</a></div>
      ${statTiles([[fmtKm(wkSum.d), 'km'], [fmtDur(wkSum.t), 'Fahrzeit'], [wkSum.tss, 'TSS'], [week.length, 'Fahrten'], [t.streak, 'Tage am Stück'], [Object.keys(progress.badges).length, 'Abzeichen']])}
    </div>
    <div class="card"><div class="row between"><h2>Letzte Fahrten</h2><a href="#/history" class="small">Alle</a></div>
      ${rides.length ? rides.slice(0, 4).map(rideRow).join('') : '<p class="muted">Noch keine Fahrten gespeichert. Die erste Fahrt wartet.</p>'}
    </div>
  </section>`;
  off.push(deviceCards($('#devs', el)));
  $('#routePick', el).onclick = e => { const b = e.target.closest('[data-rid]'); if (!b) return; sel.routeId = b.dataset.rid; saveSel(); for (const x of el.querySelectorAll('.rcard')) x.classList.toggle('on', x === b); };
  const modeTxt = { gear: 'Wie draußen schalten: Trittfrequenz, Gang, Steigung und Gewicht bestimmen die Leistung, der Trainer stellt sie im ERG-Modus ein. Ideal mit Zwift Cog und Click.', sim: 'Die Steigung geht direkt an den Trainer (beim D100 bis etwa 6 %). Schalten nur mit echter Kassette.', erg: 'Feste Wattzahl, mit + und − in 10-W-Schritten verstellbar.' };
  const updMode = () => { for (const b of $('#modeSeg', el).children) b.setAttribute('aria-pressed', String(b.dataset.m === sel.mode)); $('#modeTxt', el).textContent = modeTxt[sel.mode]; };
  updMode();
  $('#modeSeg', el).onclick = e => { const b = e.target.closest('[data-m]'); if (b) { sel.mode = b.dataset.m; saveSel(); updMode(); } };
  $('#pacerSeg', el).onclick = e => { const b = e.target.closest('[data-p]'); if (!b) return; sel.pacer = +b.dataset.p; saveSel(); for (const x of $('#pacerSeg', el).children) x.setAttribute('aria-pressed', String(x === b)); };
  const updWo = async () => {
    const w = await getWorkout(sel.workoutId);
    const cv = $('#woPrev', el); cv.parentElement.hidden = !w;
    if (w) { drawWorkout(cv, w); const s = wStats(w); $('#woInfo', el).textContent = `${fmtDur(s.dur)} · TSS ${s.tss} · IF ${s.IF.toFixed(2).replace('.', ',')} · ${w.desc || ''}`; }
  };
  $('#woSel', el).onchange = e => { sel.workoutId = e.target.value || null; saveSel(); updWo(); };
  updWo();
}
export function leave() { off.forEach(f => f()); off = []; }
