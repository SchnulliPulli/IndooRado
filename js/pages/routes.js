// Streckenübersicht mit Karte, Höhenprofil, Anstiegen und Bestzeiten
import { $, esc, fmtKm, fmtT, fmtNum, toast, dialog } from '../util.js';
import { sel, saveSel, progress } from '../state.js';
import { listRoutes, quickStats, parseGpx, saveRoute, deleteRoute, getRoute, THEMES, loadDem } from '../routes.js';
import { profileChart, trackMap } from '../charts.js';
import { routeMapSvg, routeSvg } from './start.js';
import { routePreview, cachedPreview } from '../preview.js';
import { connected as stravaConnected, listRoutes as listStravaRoutes, routeGpx } from '../strava.js';

// Höhenmodell laden mit Fortschrittsanzeige
async function terrain(r) {
  const box = document.createElement('div'); box.className = 'toast show'; box.textContent = 'Echtes Gelände wird geladen …'; $('#toasts').appendChild(box);
  try { await loadDem(r, f => box.textContent = `Echtes Gelände wird geladen … ${Math.round(f * 100)} %`); }
  finally { box.remove(); }
}
const THEME_N = { autumn: 'Herbstwald', winter: 'Winter', lavender: 'Lavendelfelder', sakura: 'Kirschblüte', savanna: 'Savanne', space: 'Weltall', deepsea: 'Tiefsee', dino: 'Urzeit (Dinos)', candy: 'Zuckerland', meadow: 'Hügel und Wiesen', lake: 'Bergsee', alpine: 'Hochgebirge', coast: 'Küste', forest: 'Wald', plains: 'Flachland', tropical: 'Tropen', himalaya: 'Himalaya', desert: 'Wüste', fjord: 'Fjord', tuscany: 'Toskana', ridge: 'Gipfelgrat', farm: 'Bauernhof', moon: 'Mond', auto: 'Automatisch' };
export async function render(el, [rid]) {
  const routes = await listRoutes();
  const cur = routes.find(r => r.id === (rid || sel.routeId)) || routes[0];
  el.innerHTML = `
  <section class="pagehead"><h1>Strecken</h1><span class="row"><button class="btn" id="rStrava">Von Strava laden</button><label class="btn pri">GPX importieren<input type="file" id="rFile" accept=".gpx,.xml" multiple hidden></label></span></section>
  <div class="routes-layout">
    <div class="rlistwrap"><input class="inp sm" id="rQ" type="search" placeholder="🔍 Strecke suchen … (${routes.length})">
    <div class="rlist">${routes.map(r => { const s = quickStats(r); return `<a class="ritem ${r.id === cur.id ? 'on' : ''}" data-q="${esc((r.name + ' ' + (r.desc || '') + ' ' + (THEME_N[r.theme] || '')).toLowerCase())}" href="#/routes/${esc(r.id)}" data-id="${esc(r.id)}"><span class="rthumb">${routeMapSvg(r, 48)}</span><div style="flex:1;min-width:0"><div class="t">${progress.routeBadges?.[r.id] ? '🏅 ' : ''}${esc(r.name)}</div><div class="small muted num">${fmtKm(s.dist)} km · ${Math.round(s.asc)} hm${r.builtin ? '' : ' · eigene'}</div></div></a>`; }).join('')}</div>
    </div>
    <div class="card rdetail" id="rd"><div class="spinner"></div></div>
  </div>`;
  // Suche und ausgewählte Strecke in der scrollbaren Liste sichtbar machen
  $('#rQ', el).oninput = e => { const q = e.target.value.trim().toLowerCase(); for (const a of el.querySelectorAll('.ritem')) a.hidden = !!q && !a.dataset.q.includes(q); };
  el.querySelector('.ritem.on')?.scrollIntoView({ block: 'nearest' });
  const load = async files => {
    let n = 0;
    for (const f of files) {
      try {
        const r = parseGpx(await f.text(), f.name.replace(/\.\w+$/, ''));
        // Echtes Gelände gleich mitladen
        try { await terrain(r); } catch (e) { toast('Gelände konnte nicht geladen werden, die Landschaft wird erzeugt: ' + e.message, 6000); }
        await saveRoute(r); n++; location.hash = '#/routes/' + r.id;
      } catch (e) { toast(f.name + ': ' + e.message, 5000); }
    }
    if (n) toast(n + ' Strecke' + (n > 1 ? 'n' : '') + ' importiert');
  };
  $('#rFile', el).onchange = e => load(e.target.files);
  $('#rStrava', el).onclick = async () => {
    if (!stravaConnected()) { toast('Erst unter Einstellungen › Verbindungen mit Strava verbinden'); location.hash = '#/connect'; return; }
    let list;
    try { list = (await listStravaRoutes()).filter(r => r.type === 1 || r.type == null); } catch (err) { toast(err.message, 6000); return; }
    if (!list.length) { toast('Keine Rad-Routen in deinem Strava-Konto gefunden'); return; }
    // eigene Auswahlliste
    const w = document.createElement('div'); w.className = 'modal on';
    w.innerHTML = `<div class="card dlg"><h2>Strava-Route laden</h2><div class="srlist">${list.map(r => `<button class="srow" data-id="${esc(r.id)}"><b>${esc(r.name)}</b><span class="small muted num">${fmtKm(r.dist)} km · ${Math.round(r.asc || 0)} hm</span></button>`).join('')}</div><div class="row end"><button class="btn" data-x>Abbrechen</button></div></div>`;
    document.body.appendChild(w);
    w.onclick = async e => {
      if (e.target === w || e.target.closest('[data-x]')) { w.remove(); return; }
      const b = e.target.closest('[data-id]'); if (!b) return;
      w.remove();
      try {
        const r = list.find(x => x.id === b.dataset.id), gpx = await routeGpx(r.id), raw = parseGpx(gpx, r.name);
        raw.name = r.name; raw.source = 'strava';
        try { await terrain(raw); } catch (err) { toast('Gelände nicht geladen, die Landschaft wird erzeugt', 5000); }
        await saveRoute(raw); toast('Strava-Route „' + r.name + '“ geladen'); location.hash = '#/routes/' + raw.id;
      } catch (err) { toast(err.message, 6000); }
    };
  };
  el.ondragover = e => e.preventDefault(); el.ondrop = e => { e.preventDefault(); load(e.dataTransfer.files); };
  // Details
  const R = await getRoute(cur.id), s = quickStats(cur), best = progress.routeBest[cur.id];
  const dist = [], ele = []; for (let i = 0; i <= R.N; i += Math.max(1, Math.floor(R.N / 600))) { dist.push(i * R.step); ele.push(R.e[i]); }
  $('#rd', el).innerHTML = `
    <div class="row between"><div><h2>${esc(cur.name)}</h2><div class="small muted">${esc(cur.desc || (cur.loop ? 'Rundkurs' : 'Einzelstrecke'))}</div></div>
      <div class="row"><button class="btn ${cur.id === sel.routeId ? '' : 'pri'}" id="rSel">${cur.id === sel.routeId ? 'Ausgewählt' : 'Auswählen'}</button><a class="btn" href="#/ride" id="rGo">Jetzt fahren</a><a class="btn" href="#/ride" id="rRace">🏁 Rennen gegen Bots</a><a class="btn" href="#/ride" id="rTT">⏱️ Zeitfahren</a></div>${progress.routeBadges?.[cur.id] ? `<div class="small muted">🏅 Routen-Abzeichen seit ${new Date(progress.routeBadges[cur.id].date).toLocaleDateString('de-DE')}</div>` : '<div class="small muted">🏅 Abzeichen: einmal die ganze Strecke fahren (+100 XP)</div>'}<div class="small muted">🔔 Goldene Glocken: ${(progress.bells?.[cur.id] || []).length} von 3 gefunden${progress.ttBest?.[cur.id] ? ' · ⏱️ Zeitfahr-Bestzeit ' + fmtT(progress.ttBest[cur.id].time) : ''}</div></div>
    <div class="tiles">${[[fmtKm(R.total), 'km'], [Math.round(R.asc), 'Höhenmeter'], [Math.round(R.minE) + '–' + Math.round(R.maxE), 'm ü. NN'], [R.climbs.length, 'Anstiege'], [best ? fmtT(best.time) : '–', 'Bestzeit']].map(([v, l]) => `<div class="tile"><b class="num">${v}</b><span>${l}</span></div>`).join('')}</div>
    <div class="rprev" id="rPrev"><div class="rprevwait"><div class="spinner"></div><span class="small muted">Vorschau wird gerendert …</span></div></div>
    <canvas id="rMap" class="mapc"></canvas>
    <h3 class="sub">Höhenprofil</h3><canvas id="rProf" class="profc"></canvas>
    ${R.climbs.length ? `<h3 class="sub">Anstiege</h3><div class="scroll"><table class="tbl"><tr><th>Name</th><th class="n">ab km</th><th class="n">Länge</th><th class="n">Höhe</th><th class="n">Ø</th><th class="n">max.</th><th class="n">Bestzeit</th></tr>${R.climbs.map(c => { const b = progress.climbBest[R.id + ':' + c.id]; return `<tr><td>${esc(c.name)}</td><td class="n">${fmtKm(c.from)}</td><td class="n">${fmtKm(c.len)} km</td><td class="n">${Math.round(c.gain)} m</td><td class="n">${fmtNum(c.avg, 1)} %</td><td class="n">${fmtNum(c.max, 1)} %</td><td class="n">${b ? fmtT(b.time) : '–'}</td></tr>`; }).join('')}</table></div>` : ''}
    ${cur.builtin ? '' : `<div class="row" style="margin-top:12px"><label class="small muted row">Landschaft <select class="inp sm" id="rTheme">${Object.keys(THEME_N).map(k => `<option value="${k}" ${k === (cur.theme || 'auto') ? 'selected' : ''}>${THEME_N[k]}</option>`).join('')}</select></label><button class="btn sm" id="rDem">${cur.realTerrain ? 'Gelände neu laden' : 'Echtes Gelände laden'}</button>${cur.realTerrain ? '<button class="btn sm ghost" id="rDemOff">Erzeugte Landschaft nutzen</button>' : ''}<button class="btn sm ghost danger" id="rDel">Strecke löschen</button></div>
      <p class="small muted">${cur.realTerrain ? `⛰ Echtes Gelände aktiv: Berge und Täler rund um die Strecke stammen aus einem Höhenmodell (${cur.dem ? Math.round(cur.dem.min) + '–' + Math.round(cur.dem.max) + ' m, Raster ' + cur.dem.cell + ' m' : 'wird beim Fahren geladen'}). Wälder, Häuser und Orte werden passend dazu erzeugt.` : 'Die Landschaft wird passend zur Höhe erzeugt. Mit „Echtes Gelände laden“ werden die echten Berge und Täler rund um die Strecke geladen (Höhendaten von AWS Open Data, dazu wird der Kartenausschnitt der Strecke dort abgefragt).'}</p>
      ${cur.noEle ? '<p class="warn small">Diese GPX-Datei enthält keine Höhendaten. Mit „Echtes Gelände laden“ werden die Höhen aus dem Gelände übernommen.</p>' : ''}`}`;
  trackMap($('#rMap', el), cur.pts.map(p => [p[0], p[1]]), { width: 5 });
  // Vorschaubild der 3D-Welt (einmal gerendert, danach sofort aus dem Speicher)
  const tok = window.__routeTok, showPrev = url => { const b = $('#rPrev', el); if (b && url) b.innerHTML = `<img src="${url}" alt="Vorschau ${esc(cur.name)}">`; else if (b) b.remove(); };
  routePreview(cur).then(url => { if (tok === window.__routeTok) { showPrev(url); thumbs(); } });
  // Liste: vorhandene Vorschaubilder sofort, fehlende nacheinander im Hintergrund erzeugen, solange die Seite offen ist
  const thumbs = async () => {
    for (const a of el.querySelectorAll('.ritem[data-id]')) {
      if (tok !== window.__routeTok) return;
      const r = routes.find(x => x.id === a.dataset.id); if (!r || a.querySelector('.rthumb img')) continue;
      let url = await cachedPreview(r);
      if (!url) { await new Promise(f => (window.requestIdleCallback || setTimeout)(f, { timeout: 1500 })); if (tok !== window.__routeTok) return; url = await routePreview(r); }
      if (url && tok === window.__routeTok) a.querySelector('.rthumb').innerHTML = `<img src="${url}" alt="">`;
    }
  };
  profileChart($('#rProf', el), dist, ele, { climbs: R.climbs });
  $('#rSel', el).onclick = () => { sel.routeId = cur.id; saveSel(); render(el, [cur.id]); };
  $('#rGo', el).onclick = () => { sel.routeId = cur.id; saveSel(); };
  $('#rTT', el).onclick = () => { sel.routeId = cur.id; saveSel(); sessionStorage.setItem('ttNext', '1'); };
  $('#rRace', el).onclick = () => { sel.routeId = cur.id; saveSel(); sessionStorage.setItem('raceNext', '1'); };
  $('#rTheme', el)?.addEventListener('change', async e => { cur.theme = e.target.value; await saveRoute(cur); toast('Landschaft geändert'); });
  $('#rDem', el)?.addEventListener('click', async () => { try { await terrain(cur); await saveRoute(cur); toast('Echtes Gelände geladen'); render(el, [cur.id]); } catch (e) { toast('Gelände: ' + e.message, 6000); } });
  $('#rDemOff', el)?.addEventListener('click', async () => { delete cur.dem; cur.realTerrain = false; await saveRoute(cur); render(el, [cur.id]); });
  $('#rDel', el)?.addEventListener('click', async () => { if (await dialog({ title: 'Strecke löschen?', buttons: [{ label: 'Abbrechen', value: false }, { label: 'Löschen', value: true, cls: 'danger' }] })) { await deleteRoute(cur.id); if (sel.routeId === cur.id) { sel.routeId = 'b-hills'; saveSel(); } location.hash = '#/routes'; } });
}
