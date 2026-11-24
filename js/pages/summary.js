// Zusammenfassung einer Fahrt (direkt nach der Fahrt und aus dem Verlauf)
import { $, esc, fmtT, fmtKm, fmtNum, fmtDate, fmtDur, download, dialog, toast, ZONES, HRZONES } from '../util.js';
import { db } from '../db.js';
import { profile, progress, levelOf } from '../state.js';
import { CURVE, curveLabel, bestCurve, BADGES } from '../analysis.js';
import { multiChart, curveChart, trackMap } from '../charts.js';
import { toFit, toTcx, fileBase } from '../export.js';
import { deleteRide, applyFtp } from '../ridesave.js';
import { statTiles, levelBar, ICON } from '../components.js';
import { drawWorkout } from '../workouts.js';
import { sound } from '../sound.js';
import { stravaTitle, stravaText, overviewImage, bestShot } from '../share.js';
import { strava, connected as stravaConnected, uploadRide, activityUrl } from '../strava.js';

let urls = [];
export async function render(el, [id], query) {
  const ride = await db.get('rides', id);
  if (!ride) { el.innerHTML = '<div class="card"><h2>Fahrt nicht gefunden</h2><a href="#/history">Zum Verlauf</a></div>'; return; }
  const shots = (await db.byIndex('shots', 'ride', id)).sort((a, b) => a.t - b.t);
  const all = await db.all('rides'), others = all.filter(r => r.id !== id);
  const best = bestCurve(others), s = ride.sum, isNew = query === 'neu';
  urls = shots.map(x => URL.createObjectURL(x.blob));
  const L = levelOf(progress.xp);
  const tile = (v, l) => [v, l];
  el.innerHTML = `
  ${isNew ? `<section class="celebrate card">
      <div class="cel-xp"><b class="num">+${ride.xp}</b><span>XP</span></div>
      <div style="flex:1">${ride.lvAfter > ride.lvBefore ? `<div class="lvup">Level ${ride.lvAfter} erreicht!</div>` : ''}${levelBar()}
      ${ride.newBadges.length ? `<div class="badges-new">${ride.newBadges.map(b => { const B = BADGES.find(x => x.id === b); return `<span class="badge on">${ICON.trophy}${esc(B.name)}</span>`; }).join('')}</div>` : ''}
      ${ride.prs.length || ride.climbs.some(c => c.pr) ? `<div class="small" style="margin-top:6px">Neue Bestwerte: ${[...ride.prs.map(curveLabel), ...ride.climbs.filter(c => c.pr).map(c => c.name)].map(esc).join(', ')}</div>` : ''}
      ${ride.xpParts?.length > 1 ? `<div class="xpparts small">${ride.xpParts.map(([l, v]) => `<span>${esc(l)} <b class="num">+${v}</b></span>`).join('')}</div>` : ''}
      ${ride.plan ? `<div class="small" style="margin-top:6px">📅 Trainingsplan ${esc(ride.plan.name)}: ${ride.plan.finished ? '<b>komplett abgeschlossen!</b>' : 'Einheit abgehakt.'} <a href="#/plans">Zum Plan</a></div>` : ''}
      ${ride.overtakes ? `<div class="small muted" style="margin-top:4px">${ride.overtakes} Fahrer überholt</div>` : ''}</div>
    </section>` : ''}
  <section class="sumhead">
    <div><div class="small muted">${fmtDate(ride.date, { dateStyle: 'full', timeStyle: 'short' })}</div><h1 id="title">${esc(ride.title)}</h1>
      <div class="small muted">${esc(ride.routeName)}${ride.laps ? ` · ${ride.laps + 1} Runden` : ''} · Widerstand: ${{ gear: 'virtuelle Gänge', sim: 'Steigung', erg: 'ERG' }[ride.mode] || ride.mode} · FTP ${ride.ftpUsed} W</div></div>
    <div class="row">
      <button class="btn sm pri" id="eStrava" title="FIT-Datei speichern und Strava-Upload öffnen">Zu Strava</button><button class="btn sm" id="eFit">FIT</button><button class="btn sm" id="eTcx">TCX</button><button class="btn sm ghost" id="eRen">Umbenennen</button><button class="btn sm ghost danger" id="eDel">Löschen</button>
    </div>
  </section>
  ${ride.test ? `<section class="card testbox"><h2>${esc(ride.test.type)}: neue FTP ${ride.test.ftp} W</h2><p class="muted">${esc(ride.test.basis)}. Aktuell eingetragen: ${profile.ftp} W.</p>${ride.test.ftp !== profile.ftp ? '<button class="btn pri" id="ftpApply">FTP übernehmen</button>' : '<p>Bereits übernommen.</p>'}</section>` : ''}
  <section class="card">${statTiles([
    tile(fmtT(s.dur), 'Fahrzeit'), tile(fmtKm(s.dist), 'km'), tile(s.asc, 'Höhenmeter'), tile(s.avgP, 'Ø Watt'),
    tile(s.np, 'NP'), tile(s.maxP, 'Max. Watt'), tile(fmtNum(s.IF, 2), 'IF'), tile(s.tss, 'TSS'),
    tile(fmtNum(s.wkg, 2), 'Ø W/kg'), tile(s.kj, 'kJ'), tile(s.kcal, 'kcal'), tile(s.avgHr ? `${s.avgHr}<small>/${s.maxHr}</small>` : '–', 'Ø/max. Puls'),
    tile(s.avgCad ?? '–', 'Ø Kadenz'), tile(fmtNum(s.avgV * 3.6, 1), 'Ø km/h'), tile(fmtNum(s.maxV * 3.6, 1), 'max. km/h'), tile('+' + ride.xp, 'XP')])}</section>
  ${shots.length ? `<section class="card"><h2>Fotos der Fahrt</h2><div class="gallery">${shots.map((x, i) => `<button class="shot" data-i="${i}"><img src="${urls[i]}" alt="${esc(x.caption)}" loading="lazy"><span>${esc(x.caption)} · ${fmtKm(x.d)} km</span></button>`).join('')}</div></section>` : ''}
  <section class="card"><div class="row between"><h2>Verlauf</h2><div class="small muted num" id="hov">Fahre mit dem Finger über das Diagramm</div></div><canvas id="ch" class="chart-main"></canvas></section>
  <section class="grid2">
    <div class="card"><h2>Strecke</h2><canvas id="map" class="mapc"></canvas><div class="small muted">Farbe zeigt die Leistungszone.</div></div>
    <div class="card"><h2>Leistungskurve</h2><canvas id="curve" class="curvec"></canvas>
      <div class="legend small"><span><i style="background:#ff6a3d"></i>Diese Fahrt</span><span><i style="background:#94a1ad"></i>Bisherige Bestwerte</span></div>
      <table class="tbl small"><tr>${CURVE.filter(k => s.curve[k]).map(k => `<th class="n">${curveLabel(k)}</th>`).join('')}</tr><tr>${CURVE.filter(k => s.curve[k]).map(k => `<td class="n ${ride.prs.includes(k) ? 'pr' : ''}">${s.curve[k]}</td>`).join('')}</tr></table></div>
  </section>
  <section class="grid2">
    <div class="card"><h2>Zeit in Leistungszonen</h2>${zoneBars(s.zones, ZONES, s.dur, z => z.n)}</div>
    <div class="card"><h2>Zeit in Pulszonen</h2>${s.avgHr ? zoneBars(s.hrz, HRZONES, s.hrz.reduce((a, b) => a + b, 0), (z, i) => z.n + ['Erholung', 'Grundlage', 'Tempo', 'Schwelle', 'Maximal'][i].replace(/^/, ' ')) : '<p class="muted">Keine Pulsdaten.</p>'}</div>
  </section>
  ${ride.workout ? `<section class="card"><h2>Workout: ${esc(ride.workout.name)}</h2><canvas id="woC" class="wochart-big"></canvas>
    <div class="scroll"><table class="tbl"><tr><th>#</th><th>Abschnitt</th><th class="n">Dauer</th><th class="n">Ziel</th><th class="n">Ist</th><th class="n">Puls</th></tr>
    ${ride.intervals.map((v, i) => { const tg = v.a == null ? null : Math.round((v.a + v.b) / 2 * ride.ftpUsed); const ok = tg == null || Math.abs(v.avg - tg) / tg < .06; return `<tr><td>${i + 1}</td><td>${esc(v.text || (v.a == null ? 'Frei' : v.a !== v.b ? 'Rampe' : 'Konstant'))}</td><td class="n">${fmtT(v.dur)}</td><td class="n">${tg ?? 'frei'}</td><td class="n ${ok ? '' : 'off'}">${v.avg}</td><td class="n">${v.hr ?? '–'}</td></tr>`; }).join('')}</table></div></section>` : ''}
  ${ride.climbs.length || ride.routePr ? `<section class="card"><h2>Anstiege und Zeiten</h2><div class="scroll"><table class="tbl"><tr><th>Anstieg</th><th class="n">Länge</th><th class="n">Ø</th><th class="n">Zeit</th><th class="n">Vorher beste</th></tr>
    ${ride.climbs.map(c => `<tr><td>${esc(c.name)}${c.pr ? ' <span class="prtag">Bestzeit</span>' : ''}</td><td class="n">${fmtKm(c.len)} km</td><td class="n">${fmtNum(c.avg, 1)} %</td><td class="n">${fmtT(c.time)}</td><td class="n">${c.best ? fmtT(c.best) : '–'}</td></tr>`).join('')}
    ${ride.routePr ? `<tr><td>Gesamte Strecke${ride.routePr.pr ? ' <span class="prtag">Bestzeit</span>' : ''}</td><td class="n">${fmtKm(s.dist)} km</td><td class="n">–</td><td class="n">${fmtT(ride.routePr.time)}</td><td class="n">${ride.routePr.best ? fmtT(ride.routePr.best) : '–'}</td></tr>` : ''}
    </table></div></section>` : ''}
  <div class="row end"><a class="btn" href="#/history">Zum Verlauf</a><a class="btn pri" href="#/">Zur Startseite</a></div>
  <div class="lightbox" id="lb" hidden><img id="lbImg" alt=""><div class="lbbar"><span id="lbCap"></span><span class="row"><button class="btn sm" id="lbPrev">‹</button><button class="btn sm" id="lbNext">›</button><button class="btn sm pri" id="lbDl">Herunterladen</button><button class="btn sm ghost" id="lbX">Schließen</button></span></div></div>`;

  // Diagramme
  const S = ride.samples, X = S.map(p => p.d / 1000);
  multiChart($('#ch', el), {
    x: X, xFmt: v => v.toFixed(1).replace('.', ',') + ' km',
    tracks: [
      { label: 'Watt', y: S.map(p => p.p), color: '#ff6a3d', fill: true, avg: s.avgP, min: 0 },
      { label: 'Puls', y: S.map(p => p.hr), color: '#ef4458' },
      { label: 'Kadenz', y: S.map(p => p.cad), color: '#3fa7f5', min: 0 },
      { label: 'km/h', y: S.map(p => p.v * 3.6), color: '#4fd18b', min: 0 },
      { label: 'Höhe', y: S.map(p => p.e), color: '#94a1ad', fill: true },
    ],
    onHover: i => { $('#hov', el).textContent = i == null ? 'Fahre mit dem Finger über das Diagramm' : `${fmtKm(S[i].d)} km · ${fmtT(i)} · ${S[i].p} W · ${S[i].hr ?? '–'} bpm · ${S[i].cad ?? '–'} U/min · ${(S[i].v * 3.6).toFixed(1).replace('.', ',')} km/h · ${Math.round(S[i].e)} m`; },
  });
  trackMap($('#map', el), S.map(p => [p.la, p.lo, p.p]), { ftp: ride.ftpUsed });
  const bestData = {}; for (const k in best) bestData[k] = best[k].w;
  curveChart($('#curve', el), [{ data: bestData, color: '#94a1ad', dash: true }, { data: s.curve, color: '#ff6a3d' }], curveLabel);
  if (ride.workout) drawWorkout($('#woC', el), ride.workout, { actual: S.filter(p => p.wt != null).map(p => [p.wt, p.p]), ftp: ride.ftpUsed });

  // Aktionen
  $('#eFit', el).onclick = () => download(fileBase(ride) + '.fit', new Blob([toFit(ride)], { type: 'application/vnd.ant.fit' }));
  if (isNew) setTimeout(() => ride.lvAfter > ride.lvBefore ? sound.levelUp() : ride.newBadges.length || ride.plan ? sound.fanfare() : null, 300);
  // Direkter Upload, wenn mit Strava verbunden
  const direct = async (manual) => {
    const b = $('#eStrava', el); b.disabled = true;
    try {
      const r = await uploadRide(ride, t => b.textContent = t);
      ride.stravaId = r.id; await db.put('rides', ride);
      b.textContent = 'Auf Strava ansehen'; b.disabled = false; b.onclick = () => window.open(activityUrl(r.id), '_blank', 'noopener');
      toast(r.duplicate ? 'Diese Fahrt ist schon auf Strava' : 'Auf Strava hochgeladen ✅');
      if (manual) { const base = fileBase(ride), ov = await overviewImage(ride, ride.ftpUsed || profile.ftp); if (ov) download(base + '-strecke.jpg', ov); const bs = bestShot(shots); if (bs) setTimeout(() => download(base + '-foto.jpg', bs.blob), 500); }
    } catch (e) { b.disabled = false; b.textContent = 'Zu Strava'; toast('Strava: ' + e.message, 6000); }
  };
  if (ride.stravaId) { $('#eStrava', el).textContent = 'Auf Strava ansehen'; }
  else if (isNew && stravaConnected() && strava.cfg.auto) direct(false);
  $('#eStrava', el).onclick = async () => {
    if (ride.stravaId) { window.open(activityUrl(ride.stravaId), '_blank', 'noopener'); return; }
    if (stravaConnected()) return direct(true);
    const title = stravaTitle(ride), text = stravaText(ride), base = fileBase(ride);
    download(base + '.fit', new Blob([toFit(ride)], { type: 'application/vnd.ant.fit' }));
    const ov = await overviewImage(ride, ride.ftpUsed || profile.ftp); if (ov) setTimeout(() => download(base + '-strecke.jpg', ov), 400);
    const bs = bestShot(shots); if (bs) setTimeout(() => download(base + '-foto.jpg', bs.blob), 800);
    let copied = false; try { await navigator.clipboard.writeText(title + '\n\n' + text); copied = true; } catch (e) { }
    await dialog({ title: 'Bei Strava hochladen', html: `
      <p>Gespeichert: die FIT-Datei, ein Übersichtsbild der Strecke${bs ? ' und das beste Foto der Fahrt' : ''}.</p>
      <ol class="tips small"><li>Auf Strava „Datei auswählen“ und die <b>.fit</b>-Datei wählen.</li><li>Den Titel einsetzen${copied ? ' (Titel und Beschreibung sind schon in der Zwischenablage)' : ''}.</li><li>Unter „Fotos hinzufügen“ die beiden Bilder auswählen und speichern.</li></ol>
      <p class="small muted">Titel:</p><input class="inp" readonly value="${esc(title)}" onclick="this.select()">
      <p class="small muted">Beschreibung:</p><textarea class="inp" rows="5" readonly onclick="this.select()">${esc(text)}</textarea>`, buttons: [{ label: 'Strava öffnen', value: true, cls: 'pri' }] });
    window.open('https://www.strava.com/upload/select', '_blank', 'noopener');
  };
  $('#eTcx', el).onclick = () => download(fileBase(ride) + '.tcx', toTcx(ride), 'application/vnd.garmin.tcx+xml');
  $('#eRen', el).onclick = async () => {
    let val = ride.title;
    const p = dialog({ title: 'Fahrt umbenennen', html: `<input class="inp" id="renIn" value="${esc(ride.title)}" maxlength="80">`, buttons: [{ label: 'Abbrechen', value: null }, { label: 'Speichern', value: 'ok', cls: 'pri' }] });
    const inp = document.getElementById('renIn'); inp.focus(); inp.select(); inp.oninput = () => val = inp.value;
    if (await p === 'ok' && val.trim()) { ride.title = val.trim(); await db.put('rides', ride); $('#title', el).textContent = ride.title; toast('Gespeichert'); }
  };
  $('#eDel', el).onclick = async () => {
    if (await dialog({ title: 'Fahrt löschen?', html: '<p class="muted">Fahrt und Fotos werden entfernt. Erfahrungspunkte und Abzeichen bleiben erhalten.</p>', buttons: [{ label: 'Abbrechen', value: false }, { label: 'Löschen', value: true, cls: 'danger' }] })) { await deleteRide(id); toast('Fahrt gelöscht'); location.hash = '#/history'; }
  };
  $('#ftpApply', el)?.addEventListener('click', async () => { await applyFtp(ride.test.ftp, ride.test.type); toast('FTP auf ' + ride.test.ftp + ' W gesetzt'); render(el, [id]); });
  // Galerie
  let cur = 0; const lb = $('#lb', el);
  const show = i => { cur = (i + shots.length) % shots.length; $('#lbImg', el).src = urls[cur]; $('#lbCap', el).textContent = shots[cur].caption + ' · ' + fmtKm(shots[cur].d) + ' km · ' + fmtT(shots[cur].t); lb.hidden = false; };
  el.querySelector('.gallery')?.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) show(+b.dataset.i); });
  $('#lbPrev', el).onclick = () => show(cur - 1); $('#lbNext', el).onclick = () => show(cur + 1);
  $('#lbX', el).onclick = () => lb.hidden = true; lb.onclick = e => { if (e.target === lb) lb.hidden = true; };
  $('#lbDl', el).onclick = () => download(fileBase(ride) + '-' + (cur + 1) + '.jpg', shots[cur].blob);
}
function zoneBars(arr, Z, tot, name) {
  return `<div class="zones">${Z.map((z, i) => { const v = arr[i] || 0, pct = tot ? v / tot * 100 : 0; return `<div class="zrow"><span class="zl">${esc(name(z, i))}</span><div class="zb"><i style="width:${pct.toFixed(1)}%;background:${z.c}"></i></div><span class="zv num">${fmtT(v)} · ${Math.round(pct)} %</span></div>`; }).join('')}</div>`;
}
export function leave() { urls.forEach(u => URL.revokeObjectURL(u)); urls = []; }
