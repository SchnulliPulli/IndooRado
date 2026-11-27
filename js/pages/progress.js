// Fortschritt: Level, Abzeichen, Summen, Wochen, Fitnessverlauf, Leistungskurve, FTP
import { $, esc, fmtKm, fmtDur, fmtT, fmtDate, toast } from '../util.js';
import { db } from '../db.js';
import { profile, progress } from '../state.js';
import { totals, fitness, bestCurve, BADGES, curveLabel, CURVE } from '../analysis.js';
import { barChart, multiChart, curveChart } from '../charts.js';
import { levelBar, statTiles, ICON } from '../components.js';
import { BUILTIN } from '../routes.js';
import { applyFtp } from '../ridesave.js';

export async function render(el) {
  const rides = (await db.all('rides')).sort((a, b) => a.date.localeCompare(b.date));
  const LG = await import('../league.js'), frz = LG.maintainStreak(rides);
  const t = totals(rides), fit = fitness(rides, 90), all = bestCurve(rides), recent = bestCurve(rides, 42), b90 = bestCurve(rides, 90);
  const est = b90[1200] ? Math.round(b90[1200].w * .95) : null;
  const last = fit[fit.length - 1] || { ctl: 0, atl: 0, tsb: 0 };
  // Wochen
  const weeks = []; const now = new Date(); const monday = new Date(now); monday.setHours(0, 0, 0, 0); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  for (let i = 11; i >= 0; i--) { const s = new Date(+monday - i * 7 * 864e5), e = +s + 7 * 864e5; const l = rides.filter(r => +new Date(r.date) >= +s && +new Date(r.date) < e); weeks.push({ l: 'KW' + kw(s), h: l.reduce((a, r) => a + r.sum.dur, 0) / 3600, km: l.reduce((a, r) => a + r.sum.dist, 0) / 1000, tss: l.reduce((a, r) => a + r.sum.tss, 0), hl: i === 0 }); }
  const climbRows = Object.entries(progress.climbBest).map(([k, v]) => { const [rid, cid] = k.split(':'); const r = BUILTIN.find(x => x.id === rid); return { route: r?.name || 'Eigene Strecke', name: r?.climbNames?.[+cid] || 'Anstieg ' + (+cid + 1), ...v }; });
  el.innerHTML = `
  <section class="pagehead"><h1>Fortschritt</h1></section>
  <section class="card">${levelBar()}<div style="margin-top:12px">${statTiles([[t.rides, 'Fahrten'], [fmtKm(t.dist), 'km gesamt'], [fmtDur(t.dur), 'Fahrzeit'], [Math.round(t.asc).toLocaleString('de-DE'), 'Höhenmeter'], [Math.round(t.kj).toLocaleString('de-DE'), 'kJ'], [t.streak, 'Tage am Stück']])}</div></section>
  <section class="grid2">
    <div class="card" id="lgCard"><h2>🏆 Wochenliga</h2><div class="spinner"></div></div>
    <div class="card"><h2>🔥 Serie</h2><div class="tiles">${[[t.streak, 'Tage am Stück'], ['🧊 ' + frz, 'Serien-Schutz']].map(([v, l]) => `<div class="tile"><b class="num">${v}</b><span>${l}</span></div>`).join('')}</div><p class="small muted">Serien-Schutz überbrückt automatisch einen Tag ohne Fahrt, damit deine Serie (und der XP-Bonus bis +50 %) nicht reißt. Du bekommst einen für jede Woche mit mindestens 3 Fahrtagen, höchstens 2 auf Vorrat.</p></div>
  </section>
  <section class="grid2">
    <div class="card"><div class="row between"><h2>Wochen</h2><div class="seg sm" id="wkSeg"><button data-k="h" aria-pressed="true">Stunden</button><button data-k="km" aria-pressed="false">km</button><button data-k="tss" aria-pressed="false">TSS</button></div></div><canvas id="wk" class="barc"></canvas></div>
    <div class="card"><h2>Form</h2>
      <div class="tiles">${[[Math.round(last.ctl), 'Fitness (CTL)'], [Math.round(last.atl), 'Ermüdung (ATL)'], [(last.tsb > 0 ? '+' : '') + Math.round(last.tsb), 'Frische (TSB)']].map(([v, l]) => `<div class="tile"><b class="num">${v}</b><span>${l}</span></div>`).join('')}</div>
      <canvas id="fit" class="fitc"></canvas><p class="small muted">Fitness ist der 42-Tage-Schnitt deiner Trainingsbelastung (TSS), Ermüdung der 7-Tage-Schnitt. Frische ist die Differenz vom Vortag.</p></div>
  </section>
  <section class="grid2">
    <div class="card"><h2>Leistungskurve</h2><canvas id="curve" class="curvec"></canvas><div class="legend small"><span><i style="background:#ff6a3d"></i>Letzte 6 Wochen</span><span><i style="background:#94a1ad"></i>Bestwerte gesamt</span></div>
      <div class="scroll"><table class="tbl small"><tr><th>Dauer</th>${CURVE.filter(k => all[k]).map(k => `<th class="n">${curveLabel(k)}</th>`).join('')}</tr><tr><td>Watt</td>${CURVE.filter(k => all[k]).map(k => `<td class="n">${all[k].w}</td>`).join('')}</tr><tr><td>W/kg</td>${CURVE.filter(k => all[k]).map(k => `<td class="n">${(all[k].w / profile.kg).toFixed(1).replace('.', ',')}</td>`).join('')}</tr></table></div></div>
    <div class="card"><h2>FTP</h2><div class="tiles"><div class="tile"><b class="num">${profile.ftp}</b><span>aktuell W</span></div><div class="tile"><b class="num">${(profile.ftp / profile.kg).toFixed(2).replace('.', ',')}</b><span>W/kg</span></div><div class="tile"><b class="num">${est ?? '–'}</b><span>Schätzung aus 20 min</span></div></div>
      ${est && est !== profile.ftp ? `<p class="small muted">Deine beste 20-Minuten-Leistung der letzten 90 Tage ergibt ${est} W (× 0,95).</p><button class="btn pri sm" id="ftpEst">${est} W übernehmen</button>` : '<p class="small muted">Für eine Schätzung braucht es eine Fahrt mit mindestens 20 Minuten harter Leistung, zum Beispiel den FTP-Test.</p>'}
      ${(profile.ftpHistory || []).length ? `<h3 class="sub">Verlauf</h3><table class="tbl small">${[...profile.ftpHistory].reverse().slice(0, 8).map(h => `<tr><td>${fmtDate(h.date, { dateStyle: 'medium' })}</td><td>${esc(h.source || '')}</td><td class="n">${h.ftp} W</td></tr>`).join('')}</table>` : ''}
    </div>
  </section>
  <section class="card"><h2>Abzeichen <span class="muted small">${Object.keys(progress.badges).length} von ${BADGES.length}</span></h2><div class="badges">${BADGES.map(b => { const got = progress.badges[b.id]; return `<div class="badge ${got ? 'on' : ''}">${ICON.trophy}<div><b>${esc(b.name)}</b><span class="small">${esc(b.desc)}${got ? ' · ' + fmtDate(got.date, { dateStyle: 'medium' }) : ''}</span></div></div>`; }).join('')}</div></section>
  ${climbRows.length ? `<section class="card"><h2>Bestzeiten an Anstiegen</h2><div class="scroll"><table class="tbl"><tr><th>Anstieg</th><th>Strecke</th><th class="n">Zeit</th><th class="n">Datum</th></tr>${climbRows.map(c => `<tr><td><a href="#/summary/${esc(c.rideId)}">${esc(c.name)}</a></td><td>${esc(c.route)}</td><td class="n">${fmtT(c.time)}</td><td class="n">${fmtDate(c.date, { dateStyle: 'medium' })}</td></tr>`).join('')}</table></div></section>` : ''}`;
  const drawWk = k => barChart($('#wk', el), weeks.map(w => ({ l: w.l, v: w[k], hl: w.hl })), { fmt: v => k === 'h' ? v.toFixed(1).replace('.', ',') : Math.round(v) });
  drawWk('h');
  $('#wkSeg', el).onclick = e => { const b = e.target.closest('[data-k]'); if (!b) return; for (const x of $('#wkSeg', el).children) x.setAttribute('aria-pressed', String(x === b)); drawWk(b.dataset.k); };
  { const lb = $('#lgCard', el); if (lb) LG.leagueCard(lb).catch(() => lb.remove()); }
  multiChart($('#fit', el), { x: fit.map((_, i) => i), xFmt: v => { const d = fit[Math.round(v)]; return d ? new Date(d.day).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' }) : ''; }, tracks: [{ label: 'CTL / ATL', y: fit.map(f => f.ctl), color: '#3fa7f5', min: 0, max: Math.max(10, ...fit.map(f => Math.max(f.ctl, f.atl))) }, { label: 'TSB', y: fit.map(f => f.tsb), color: '#4fd18b' }] });
  const a = {}, r = {}; for (const k in all) a[k] = all[k].w; for (const k in recent) r[k] = recent[k].w;
  curveChart($('#curve', el), [{ data: a, color: '#94a1ad', dash: true }, { data: r, color: '#ff6a3d' }], curveLabel);
  $('#ftpEst', el)?.addEventListener('click', async () => { await applyFtp(est, 'Schätzung 20 min'); toast('FTP auf ' + est + ' W gesetzt'); render(el); });
}
function kw(d) { const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day); const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return Math.ceil(((t - y) / 864e5 + 1) / 7); }
