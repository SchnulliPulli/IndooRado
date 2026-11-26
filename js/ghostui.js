// Dialoge für Freunde-Geister: teilen (Datei, Code) und verwalten/importieren
import { esc, toast, download } from './util.js';
import { makeGhost, ghostFile, ghostCode, fromCode, addGhost, listGhosts, setGhostOn, delGhost } from './ghosts.js';
import { fmtKm, fmtT } from './util.js';

function modal(html) {
  const w = document.createElement('div'); w.className = 'modal on'; w.innerHTML = `<div class="card dlg ghostdlg" role="dialog" aria-modal="true">${html}</div>`;
  document.body.appendChild(w);
  const close = () => { w.remove(); document.removeEventListener('keydown', k, true); };
  const k = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  document.addEventListener('keydown', k, true);
  w.addEventListener('click', e => { if (e.target === w || e.target.closest('[data-x]')) close(); });
  return { w, close };
}
export async function shareGhost(ride, routeName) {
  if (!ride.samples?.length || ride.samples.length < 60) { toast('Die Fahrt ist zu kurz für einen Geist'); return; }
  const g = makeGhost(ride, routeName), f = ghostFile(g), code = await ghostCode(g);
  const { w, close } = modal(`<div class="row between"><h2>👻 Als Geist teilen</h2><button class="btn sm ghost" data-x>✕</button></div>
    <p>Freunde fahren gegen deine Fahrt auf <b>${esc(g.routeName)}</b> (${fmtKm(g.dist)} km in ${fmtT(g.dur)}): Du erscheinst bei ihnen als durchsichtiger Fahrer mit deinem Namen und Trikot.</p>
    <p class="small muted">Enthalten sind nur Strecke, Name, Aussehen, Tag und deine Position alle 2 Sekunden – kein Puls, keine Watt.</p>
    <div class="row shbtns">${navigator.canShare?.({ files: [f] }) ? '<button class="btn pri" id="gsShare">📤 Datei teilen …</button>' : ''}<button class="btn" id="gsDl">⬇ Datei speichern</button><button class="btn" id="gsCopy">📋 Code kopieren</button></div>
    <label class="f">Geist-Code (${Math.round(code.length / 1024 * 10) / 10} KB) – z. B. per Messenger schicken<textarea class="inp gcode" readonly rows="3">${esc(code)}</textarea></label>`);
  w.querySelector('#gsShare')?.addEventListener('click', () => navigator.share({ files: [f], title: 'IndooRado-Geist', text: `Fahr gegen mich auf ${g.routeName}! Datei in IndooRado unter Aktivitäten › Importieren › Geist öffnen.` }).catch(() => { }));
  w.querySelector('#gsDl').onclick = () => download(f.name, f);
  w.querySelector('#gsCopy').onclick = async () => { try { await navigator.clipboard.writeText(code); toast('Code kopiert'); } catch (e) { w.querySelector('.gcode').select(); toast('Bitte markierten Code kopieren'); } };
}
export async function ghostManager() {
  const { w } = modal(`<div class="row between"><h2>👻 Freunde-Geister</h2><button class="btn sm ghost" data-x>✕</button></div>
    <p class="small muted">Geister fahren automatisch mit, wenn du ihre Strecke wählst (bis zu fünf gleichzeitig). Du erhältst sie als Datei (.vvghost) oder Code von Freunden.</p>
    <div class="row"><label class="btn sm pri">📄 Datei öffnen<input type="file" id="ghFile" accept=".vvghost,.json,application/json" multiple hidden></label></div>
    <label class="f">… oder Code einfügen<textarea class="inp gcode" id="ghCode" rows="2" placeholder="VVG1.…"></textarea></label><div class="row"><button class="btn sm" id="ghAdd">Code übernehmen</button></div>
    <div id="ghList" class="ghlist"></div>`);
  const draw = async () => {
    const l = await listGhosts();
    w.querySelector('#ghList').innerHTML = l.length ? l.map(g => `<div class="ghrow"><label class="switch"><input type="checkbox" data-on="${esc(g.id)}" ${g.on !== false ? 'checked' : ''}><span></span></label><div><b>${esc(g.name)}</b> · ${esc(g.routeName || g.route)}<div class="small muted">${fmtKm(g.dist)} km in ${fmtT(g.dur)}${g.day ? ' · ' + new Date(g.day).toLocaleDateString('de-DE') : ''}</div></div><button class="btn sm ghost danger" data-del="${esc(g.id)}" aria-label="Geist löschen">🗑</button></div>`).join('') : '<p class="muted small">Noch keine Geister.</p>';
  };
  const add = async obj => { try { const g = await addGhost(obj); toast(`👻 ${g.name} auf ${g.routeName || g.route} hinzugefügt`); draw(); } catch (e) { toast(e.message); } };
  w.querySelector('#ghFile').onchange = async e => { for (const f of e.target.files) { try { await add(JSON.parse(await f.text())); } catch (er) { toast('Datei nicht lesbar: ' + f.name); } } e.target.value = ''; };
  w.querySelector('#ghAdd').onclick = async () => { try { await add(await fromCode(w.querySelector('#ghCode').value)); w.querySelector('#ghCode').value = ''; } catch (e) { toast(e.message); } };
  w.addEventListener('change', e => { const c = e.target.closest('[data-on]'); if (c) setGhostOn(c.dataset.on, c.checked); });
  w.addEventListener('click', async e => { const d = e.target.closest('[data-del]'); if (d) { await delGhost(d.dataset.del); draw(); } });
  draw();
}
