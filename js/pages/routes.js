// Streckenübersicht mit Karte, Höhenprofil, Anstiegen und Bestzeiten
import { $, esc, fmtKm, fmtT, fmtNum, toast, dialog } from '../util.js';
import { sel, saveSel, progress } from '../state.js';
import { listRoutes, quickStats, parseGpx, saveRoute, deleteRoute, getRoute, THEMES } from '../routes.js';
import { profileChart, trackMap } from '../charts.js';
import { routeMapSvg, routeSvg } from './start.js';

const THEME_N = { meadow: 'Hügel und Wiesen', lake: 'Bergsee', alpine: 'Hochgebirge', coast: 'Küste', forest: 'Wald', plains: 'Flachland', auto: 'Automatisch' };
export async function render(el, [rid]) {
  const routes = await listRoutes();
  const cur = routes.find(r => r.id === (rid || sel.routeId)) || routes[0];
  el.innerHTML = `
  <section class="pagehead"><h1>Strecken</h1><label class="btn pri">GPX importieren<input type="file" id="rFile" accept=".gpx,.xml" multiple hidden></label></section>
  <div class="routes-layout">
    <div class="rlist">${routes.map(r => { const s = quickStats(r); return `<a class="ritem ${r.id === cur.id ? 'on' : ''}" href="#/routes/${esc(r.id)}">${routeMapSvg(r, 48)}<div style="flex:1;min-width:0"><div class="t">${esc(r.name)}</div><div class="small muted num">${fmtKm(s.dist)} km · ${Math.round(s.asc)} hm${r.builtin ? '' : ' · eigene'}</div></div></a>`; }).join('')}</div>
    <div class="card rdetail" id="rd"><div class="spinner"></div></div>
  </div>`;
  const load = async files => {
    let n = 0;
    for (const f of files) { try { const r = parseGpx(await f.text(), f.name.replace(/\.\w+$/, '')); await saveRoute(r); n++; location.hash = '#/routes/' + r.id; } catch (e) { toast(f.name + ': ' + e.message, 5000); } }
    if (n) toast(n + ' Strecke' + (n > 1 ? 'n' : '') + ' importiert');
  };
  $('#rFile', el).onchange = e => load(e.target.files);
  el.ondragover = e => e.preventDefault(); el.ondrop = e => { e.preventDefault(); load(e.dataTransfer.files); };
  // Details
  const R = await getRoute(cur.id), s = quickStats(cur), best = progress.routeBest[cur.id];
  const dist = [], ele = []; for (let i = 0; i <= R.N; i += Math.max(1, Math.floor(R.N / 600))) { dist.push(i * R.step); ele.push(R.e[i]); }
  $('#rd', el).innerHTML = `
    <div class="row between"><div><h2>${esc(cur.name)}</h2><div class="small muted">${esc(cur.desc || (cur.loop ? 'Rundkurs' : 'Einzelstrecke'))}</div></div>
      <div class="row"><button class="btn ${cur.id === sel.routeId ? '' : 'pri'}" id="rSel">${cur.id === sel.routeId ? 'Ausgewählt' : 'Auswählen'}</button><a class="btn" href="#/ride" id="rGo">Jetzt fahren</a></div></div>
    <div class="tiles">${[[fmtKm(R.total), 'km'], [Math.round(R.asc), 'Höhenmeter'], [Math.round(R.minE) + '–' + Math.round(R.maxE), 'm ü. NN'], [R.climbs.length, 'Anstiege'], [best ? fmtT(best.time) : '–', 'Bestzeit']].map(([v, l]) => `<div class="tile"><b class="num">${v}</b><span>${l}</span></div>`).join('')}</div>
    <canvas id="rMap" class="mapc"></canvas>
    <h3 class="sub">Höhenprofil</h3><canvas id="rProf" class="profc"></canvas>
    ${R.climbs.length ? `<h3 class="sub">Anstiege</h3><div class="scroll"><table class="tbl"><tr><th>Name</th><th class="n">ab km</th><th class="n">Länge</th><th class="n">Höhe</th><th class="n">Ø</th><th class="n">max.</th><th class="n">Bestzeit</th></tr>${R.climbs.map(c => { const b = progress.climbBest[R.id + ':' + c.id]; return `<tr><td>${esc(c.name)}</td><td class="n">${fmtKm(c.from)}</td><td class="n">${fmtKm(c.len)} km</td><td class="n">${Math.round(c.gain)} m</td><td class="n">${fmtNum(c.avg, 1)} %</td><td class="n">${fmtNum(c.max, 1)} %</td><td class="n">${b ? fmtT(b.time) : '–'}</td></tr>`; }).join('')}</table></div>` : ''}
    ${cur.builtin ? '' : `<div class="row" style="margin-top:12px"><label class="small muted row">Landschaft <select class="inp sm" id="rTheme">${Object.keys(THEME_N).map(k => `<option value="${k}" ${k === (cur.theme || 'auto') ? 'selected' : ''}>${THEME_N[k]}</option>`).join('')}</select></label><button class="btn sm ghost danger" id="rDel">Strecke löschen</button></div>${cur.noEle ? '<p class="warn small">Diese GPX-Datei enthält keine Höhendaten, die Strecke ist daher flach.</p>' : ''}`}`;
  trackMap($('#rMap', el), cur.pts.map(p => [p[0], p[1]]), { width: 5 });
  profileChart($('#rProf', el), dist, ele, { climbs: R.climbs });
  $('#rSel', el).onclick = () => { sel.routeId = cur.id; saveSel(); render(el, [cur.id]); };
  $('#rGo', el).onclick = () => { sel.routeId = cur.id; saveSel(); };
  $('#rTheme', el)?.addEventListener('change', async e => { cur.theme = e.target.value; await saveRoute(cur); toast('Landschaft geändert'); });
  $('#rDel', el)?.addEventListener('click', async () => { if (await dialog({ title: 'Strecke löschen?', buttons: [{ label: 'Abbrechen', value: false }, { label: 'Löschen', value: true, cls: 'danger' }] })) { await deleteRoute(cur.id); if (sel.routeId === cur.id) { sel.routeId = 'b-hills'; saveSel(); } location.hash = '#/routes'; } });
}
