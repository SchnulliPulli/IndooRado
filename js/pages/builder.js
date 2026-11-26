// Strecken-Baukasten: Bausteine antippen, anordnen, anpassen – Vorschau als Karte und Höhenprofil, speichern, fahren
import { $, esc, toast, fmtKm, clamp } from '../util.js';
import { sel, saveSel } from '../state.js';
import { BLOCKS, BLOCK, CATS, blockLen, buildKit, randomKit, PRESETS } from '../routekit.js';
import { saveRoute, getRaw, THEMES } from '../routes.js';
import { THEME_N } from './routes.js';

const SURF = [['asphalt', 'Asphalt'], ['gravel', 'Schotter'], ['dirt', 'Feldweg'], ['trail', 'Trail'], ['sand', 'Sand'], ['cosmic', 'Kosmisch'], ['candy', 'Zuckerguss'], ['rainbow', 'Regenbogen']];
let K = null, selI = -1;
const fresh = () => ({ id: null, name: 'Meine Strecke', theme: 'meadow', surface: 'asphalt', loop: true, ele0: 300, blocks: PRESETS['Kurvenfestival'].map(k => ({ k })) });
export async function render(el, params = []) {
  if (params[0]) { const raw = await getRaw(params[0]); if (raw?.kit) K = { ...raw.kit, id: raw.id, name: raw.name, theme: raw.theme, surface: raw.surface || 'asphalt' }; }
  if (!K) { try { K = JSON.parse(sessionStorage.getItem('kitDraft') || 'null'); } catch (e) { } K ||= fresh(); }
  el.innerHTML = `
  <section class="pagehead"><h1>🧱 Strecken-Baukasten</h1><span class="row"><a class="btn sm ghost" href="#/routes">Zu den Strecken</a></span></section>
  <section class="kit">
    <div class="card kitpal"><h2>Bausteine</h2><p class="small muted">Antippen hängt den Baustein ans Ende (oder hinter den gewählten).</p>
      ${CATS.map(c => `<h3 class="sub">${c}</h3><div class="kitblocks">${BLOCKS.filter(b => b.cat === c).map(b => `<button class="kb" data-add="${b.k}" title="${esc(b.n)}: ${fmtKm(b.len)} km${b.g ? ', ' + b.g + ' %' : ''}${b.turn ? ', ' + Math.abs(b.turn) + '°' : ''}"><span>${b.i}</span>${esc(b.n)}</button>`).join('')}</div>`).join('')}
      <h3 class="sub">Vorlagen</h3><div class="kitblocks">${Object.keys(PRESETS).map(n => `<button class="kb" data-preset="${esc(n)}">${esc(n)}</button>`).join('')}<button class="kb" data-rand>🎲 Zufall</button></div>
    </div>
    <div class="kitmain">
      <div class="card kitprev"><canvas id="kitMap"></canvas><canvas id="kitProf"></canvas><div class="kitstats num" id="kitStats"></div></div>
      <div class="card"><div class="row between"><h2>Deine Strecke</h2><span class="small muted" id="kitN"></span></div>
        <ol class="kitseq" id="kitSeq"></ol>
        <div class="kitedit" id="kitEdit" hidden></div>
      </div>
      <div class="card form"><h2>Einstellungen</h2>
        <div class="grid2 tight"><label class="f">Name<input class="inp" id="kName" maxlength="40" value="${esc(K.name)}"></label>
          <label class="f">Landschaft<select class="inp" id="kTheme">${Object.keys(THEMES).map(t => `<option value="${t}" ${K.theme === t ? 'selected' : ''}>${esc(THEME_N[t] || t)}</option>`).join('')}</select></label></div>
        <div class="grid2 tight"><label class="f">Belag<select class="inp" id="kSurf">${SURF.map(([v, l]) => `<option value="${v}" ${K.surface === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label class="f">Starthöhe (m)<input class="inp" id="kEle" type="number" min="-500" max="5000" step="50" value="${K.ele0 ?? 300}"></label></div>
        <label class="switch"><input type="checkbox" id="kLoop" ${K.loop ? 'checked' : ''}><span></span> <div class="swt">Rundkurs<small class="muted">Ein weicher Bogen führt am Ende zurück zum Start</small></div></label>
        <div class="row end"><button class="btn ghost" id="kNew">Neu</button><button class="btn" id="kSave">💾 Speichern</button><button class="btn pri" id="kRide">Speichern und fahren</button></div>
      </div>
    </div>
  </section>`;
  const draft = () => { try { sessionStorage.setItem('kitDraft', JSON.stringify(K)); } catch (e) { } };
  const redraw = () => { seq(); prev(); edit(); draft(); };
  function seq() {
    $('#kitSeq', el).innerHTML = K.blocks.map((p, i) => { const B = BLOCK[p.k]; return `<li class="${i === selI ? 'on' : ''}" data-i="${i}"><button class="kitli" data-pick="${i}"><span class="ki">${B.i}</span><span>${esc(B.n)}${p.mir ? ' ⇄' : ''}</span><small class="muted num">${fmtKm(blockLen(p))} km${B.g ? ' · ' + (B.g * (p.gf ?? 1)).toFixed(1).replace('.', ',') + ' %' : ''}</small></button>
      <span class="kitops"><button class="btn xs ghost" data-up="${i}" aria-label="nach vorne">▲</button><button class="btn xs ghost" data-dn="${i}" aria-label="nach hinten">▼</button><button class="btn xs ghost" data-dup="${i}" aria-label="verdoppeln">⧉</button><button class="btn xs ghost danger" data-del="${i}" aria-label="entfernen">✕</button></span></li>`; }).join('') || '<p class="muted small">Noch leer – tippe links auf Bausteine.</p>';
    $('#kitN', el).textContent = K.blocks.length + ' Bausteine';
  }
  function edit() {
    const box = $('#kitEdit', el), p = K.blocks[selI]; box.hidden = !p; if (!p) return; const B = BLOCK[p.k];
    box.innerHTML = `<h3 class="sub">${B.i} ${esc(B.n)} anpassen</h3>
      <label class="f">Länge: <b id="eLv">${fmtKm(blockLen(p))} km</b><input type="range" id="eL" min="0.25" max="4" step="0.05" value="${p.lf ?? 1}"></label>
      ${B.g ? `<label class="f">Steilheit: <b id="eGv">${(B.g * (p.gf ?? 1)).toFixed(1).replace('.', ',')} %</b><input type="range" id="eG" min="0" max="2.5" step="0.05" value="${p.gf ?? 1}"></label>` : ''}
      ${B.turn ? `<label class="switch"><input type="checkbox" id="eM" ${p.mir ? 'checked' : ''}><span></span> Gespiegelt (andere Richtung)</label>` : ''}`;
    $('#eL', box).oninput = e => { p.lf = +e.target.value; $('#eLv', box).textContent = fmtKm(blockLen(p)) + ' km'; seq(); prev(); draft(); };
    const g = $('#eG', box); if (g) g.oninput = e => { p.gf = +e.target.value; $('#eGv', box).textContent = (B.g * p.gf).toFixed(1).replace('.', ',') + ' %'; seq(); prev(); draft(); };
    const m = $('#eM', box); if (m) m.onchange = e => { p.mir = e.target.checked; seq(); prev(); draft(); };
  }
  function prev() {
    const r = buildKit(K), cv = $('#kitMap', el), pc = $('#kitProf', el), dpr = Math.min(2, devicePixelRatio || 1); if (!cv || !cv.isConnected) return r;
    for (const c of [cv, pc]) { c.width = c.clientWidth * dpr; c.height = c.clientHeight * dpr; }
    const c = cv.getContext('2d'), W = cv.width, H = cv.height, P = r.P;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const [x, z] of P) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const sc = Math.min((W - 40 * dpr) / Math.max(50, x1 - x0), (H - 40 * dpr) / Math.max(50, z1 - z0)), ox = W / 2 - (x0 + x1) / 2 * sc, oz = H / 2 - (z0 + z1) / 2 * sc;
    c.clearRect(0, 0, W, H); c.lineCap = c.lineJoin = 'round';
    const sel0 = r.marks[selI];
    let d = 0;
    for (let i = 1; i < P.length; i++) {
      const dd = Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]), g = dd > .5 ? (P[i][2] - P[i - 1][2]) / dd * 100 : 0; d += dd;
      c.strokeStyle = g > 8 ? '#ff4f5e' : g > 4 ? '#ff9a3d' : g > 1 ? '#f5d142' : g < -3 ? '#3fa7f5' : '#4fd18b';
      c.lineWidth = (sel0 && d >= sel0.from && d <= sel0.to ? 9 : 5) * dpr;
      c.beginPath(); c.moveTo(ox + P[i - 1][0] * sc, oz + P[i - 1][1] * sc); c.lineTo(ox + P[i][0] * sc, oz + P[i][1] * sc); c.stroke();
    }
    c.fillStyle = '#fff'; c.strokeStyle = '#111'; c.lineWidth = 2 * dpr; c.beginPath(); c.arc(ox + P[0][0] * sc, oz + P[0][1] * sc, 7 * dpr, 0, 7); c.fill(); c.stroke();
    c.font = `700 ${12 * dpr}px system-ui`; c.fillStyle = '#fff'; c.fillText('Start', ox + P[0][0] * sc + 10 * dpr, oz + P[0][1] * sc + 4 * dpr);
    // Höhenprofil
    const p = pc.getContext('2d'), PW = pc.width, PH = pc.height; let e0 = Infinity, e1 = -Infinity; for (const q of P) { e0 = Math.min(e0, q[2]); e1 = Math.max(e1, q[2]); }
    const er = Math.max(30, e1 - e0); p.clearRect(0, 0, PW, PH); p.beginPath(); d = 0; p.moveTo(0, PH);
    const tot = r.dist; for (let i = 0; i < P.length; i++) { if (i) d += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); p.lineTo(d / tot * PW, PH - 6 * dpr - (P[i][2] - e0) / er * (PH - 16 * dpr)); }
    p.lineTo(PW, PH); p.closePath(); const gr = p.createLinearGradient(0, 0, 0, PH); gr.addColorStop(0, 'rgba(255,106,61,.75)'); gr.addColorStop(1, 'rgba(255,106,61,.08)'); p.fillStyle = gr; p.fill();
    if (sel0) { p.fillStyle = 'rgba(255,255,255,.15)'; p.fillRect(sel0.from / tot * PW, 0, (sel0.to - sel0.from) / tot * PW, PH); }
    $('#kitStats', el).innerHTML = `<span><b>${fmtKm(r.dist)}</b> km</span><span><b>${Math.round(r.asc)}</b> Hm</span><span>max. <b>${r.maxG.toFixed(1).replace('.', ',')}</b> %</span>${K.loop && r.closeLen > 50 ? `<span class="muted">davon ${fmtKm(r.closeLen)} km Rückweg</span>` : ''}`;
    return r;
  }
  el.onclick = e => {
    const t = e.target.closest('button'); if (!t) return; const at = selI >= 0 ? selI + 1 : K.blocks.length;
    if (t.dataset.add) { K.blocks.splice(at, 0, { k: t.dataset.add }); selI = at; redraw(); return; }
    if (t.dataset.preset) { K.blocks = PRESETS[t.dataset.preset].map(k => ({ k })); K.name = t.dataset.preset; $('#kName', el).value = K.name; selI = -1; redraw(); return; }
    if (t.dataset.rand != null) { K.blocks = randomKit(); selI = -1; redraw(); return; }
    if (t.dataset.pick) { selI = +t.dataset.pick === selI ? -1 : +t.dataset.pick; redraw(); return; }
    const sw = (i, j) => { if (j < 0 || j >= K.blocks.length) return; [K.blocks[i], K.blocks[j]] = [K.blocks[j], K.blocks[i]]; selI = j; redraw(); };
    if (t.dataset.up) return sw(+t.dataset.up, +t.dataset.up - 1);
    if (t.dataset.dn) return sw(+t.dataset.dn, +t.dataset.dn + 1);
    if (t.dataset.dup) { const i = +t.dataset.dup; K.blocks.splice(i + 1, 0, { ...K.blocks[i] }); selI = i + 1; redraw(); return; }
    if (t.dataset.del) { K.blocks.splice(+t.dataset.del, 1); selI = -1; redraw(); return; }
  };
  $('#kName', el).oninput = e => { K.name = e.target.value; draft(); };
  $('#kTheme', el).onchange = e => { K.theme = e.target.value; draft(); };
  $('#kSurf', el).onchange = e => { K.surface = e.target.value; draft(); };
  $('#kEle', el).onchange = e => { K.ele0 = clamp(+e.target.value || 0, -500, 5000); prev(); draft(); };
  $('#kLoop', el).onchange = e => { K.loop = e.target.checked; prev(); draft(); };
  $('#kNew', el).onclick = () => { K = fresh(); K.blocks = []; selI = -1; sessionStorage.removeItem('kitDraft'); render(el); };
  const save = async () => {
    if (K.blocks.length < 1) { toast('Füge zuerst Bausteine hinzu'); return null; }
    const r = buildKit(K); if (r.dist < 500) { toast('Die Strecke ist zu kurz (mind. 0,5 km)'); return null; }
    const id = K.id || 'k-' + Date.now().toString(36); K.id = id;
    const kit = { blocks: K.blocks, loop: K.loop, ele0: K.ele0 ?? 300 };
    await saveRoute({ id, name: (K.name || 'Meine Strecke').trim().slice(0, 40), theme: K.theme, surface: K.surface, loop: !!K.loop, builtin: false, created: new Date().toISOString(), pts: r.pts, desc: `Selbst gebaut im Baukasten: ${K.blocks.length} Bausteine.`, kit, stats: { dist: r.dist, asc: r.asc } });
    draft(); toast('💾 Strecke gespeichert'); return id;
  };
  $('#kSave', el).onclick = save;
  $('#kRide', el).onclick = async () => { const id = await save(); if (id) { sel.routeId = id; saveSel(); location.hash = '#/ride'; } };
  addEventListener('resize', prev, { once: true });
  redraw();
}
