// Live-Ansicht der laufenden Fahrt deines Kontos (auf einem anderen Gerät): aktuelle Werte, Workout, Strecke und Zeitverlauf.
// Daten kommen aus dem Konto bzw. Cloud-Speicher (live.json, von der Fahrt alle 5 s geschrieben).
import { $, esc, fmtKm, fmtT, bus } from '../util.js';
import { syncReady, getLive, loadSync, sync, liveFresh } from '../sync.js';
import { multiChart } from '../charts.js';

let timer = null;
export function leave() { clearInterval(timer); timer = null; }
export async function render(el) {
  leave();
  if (!sync.cfg && !sync.online) await loadSync().catch(() => { });
  el.innerHTML = `<section class="pagehead"><h1>Live-Fahrt</h1><span class="small muted" id="lvUpd"></span></section>
    <div id="lvBody"><div class="pageload"><div class="spinner"></div><div class="small muted">Laufende Fahrt wird gesucht …</div></div></div>`;
  const T = await import('../tv.js'); await T.whenReady();
  if (!$('#lvBody', el)) return; // Seite inzwischen verlassen
  if (!syncReady() && !(await import('../online/client.js')).loggedIn()) { $('#lvBody', el).innerHTML = '<section class="card"><p class="muted">Die Live-Ansicht braucht ein IndooRado-Konto oder einen verbundenen Cloud-Speicher, damit die Fahrt vom anderen Gerät hier ankommt.</p><a class="btn" href="#/account">Zum Konto</a></section>'; return; }
  const tick = async () => {
    if (!document.body.contains(el) || !$('#lvBody', el)) return leave();
    let L = null; try { L = await T.liveNow(); } catch (e) { }
    draw(el, L);
  };
  tick(); timer = setInterval(tick, 5000);
  const off = bus.on('liveRt', () => { if (!timer) return off?.(); tick(); }); // sofort neu zeichnen, wenn der Echtzeitkanal etwas bringt
}
const fresh = L => liveFresh(L);
async function draw(el, L) {
  const body = $('#lvBody', el); if (!body) return;
  const map = fresh(L) ? await (await import('../livemap.js')).liveMapSvg(L.routeId, L.pos) : '';
  $('#lvUpd', el).textContent = L?.ts ? 'Stand: vor ' + Math.max(0, Math.round((Date.now() - L.ts) / 1000)) + ' s' : '';
  if (!fresh(L)) { body.innerHTML = `<section class="card"><p class="muted">Gerade läuft keine Fahrt mit deinem Konto.${L?.state === 'ended' ? ' Die letzte Fahrt wurde beendet.' : ''}</p><div class="row"><a class="btn pri" href="#/ride">Selbst eine Fahrt starten</a><a class="btn" href="#/history">Zum Verlauf</a></div></section>`; return; }
  const pct = L.total ? Math.min(100, (L.pos / L.total) * 100) : 0, w = L.wo, paused = L.state === 'paused' || L.state === 'auto' || L.state === 'ready';
  const html = `
    <section class="card live">
      <div class="row between"><div><span class="livedot ${paused ? 'off' : ''}"></span> <b>${paused ? (L.state === 'ready' ? 'Bereit' : 'Pause') : 'Live'}</b> <span class="small muted">· ${esc(L.route)}${L.devName ? ' · auf ' + esc(L.devName) : ''}</span></div><b class="num">${fmtT(L.t || 0)}</b></div>
      <div class="livebig"><div><b class="num">${L.p ?? 0}</b><span>Watt</span></div><div><b class="num" style="color:var(--hr)">${L.hr ?? '–'}</b><span>Puls</span></div><div><b class="num" style="color:var(--cad)">${L.cad ?? '–'}</b><span>U/min</span></div></div>
      <div class="tiles">${[[String(L.v ?? 0).replace('.', ','), 'km/h'], [fmtKm(L.odo || 0), 'km'], [L.asc ?? 0, 'Hm'], [String(L.grade ?? 0).replace('.', ',') + ' %', 'Steigung'], [L.np ?? '–', 'NP'], [L.kj ?? 0, 'kJ'], ...(L.place ? [[L.place + '.', 'Platz']] : [])].map(([v, l]) => `<div class="tile"><b class="num">${v}</b><span>${l}</span></div>`).join('')}</div>
      ${w ? `<div class="livewo"><div class="row between small"><b>${esc(w.name)}</b><span class="num">${w.i ? `Intervall ${w.i}/${w.n} · noch ${fmtT(w.left)}` : 'fertig'}</span></div>${w.target ? `<div class="small">Ziel <b class="num">${w.target} W</b></div>` : ''}<div class="bar thin"><i style="width:${Math.min(100, w.done / (w.total || 1) * 100).toFixed(1)}%"></i></div></div>` : ''}
      ${map}
      ${!L.loop && L.total ? `<div class="small muted">Strecke ${pct.toFixed(0)} % · noch ${fmtKm(Math.max(0, L.total - L.pos))} km</div><div class="bar thin"><i style="width:${pct.toFixed(1)}%"></i></div>` : ''}
    </section>
    <section class="card"><h2>Verlauf</h2>${(L.hist || []).length > 2 ? '<canvas id="lvChart" class="lvchart"></canvas>' : '<p class="small muted">Der Verlauf erscheint nach den ersten Minuten.</p>'}</section>`;
  body.innerHTML = html;
  const H = L.hist || [];
  if (H.length > 2) multiChart($('#lvChart', el), { x: H.map(h => h[0]), xFmt: v => fmtT(Math.round(v)), tracks: [
    { label: 'Leistung', y: H.map(h => h[1]), color: '#ff6a3d', min: 0 },
    { label: 'Puls', y: H.map(h => h[2]), color: '#ef4458' },
    { label: 'Tempo', y: H.map(h => h[4]), color: '#3fa7f5', min: 0 },
  ] });
}
