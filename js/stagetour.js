// Tour de IndooRado (Wochen-Etappenrennen) und Bergkönig je Anstieg. Beides online (Konto), Ergebnisse über Supabase.
import * as O from './online/client.js';
import { BUILTIN, quickStats } from './routes.js';
import { esc, fmtT, fmtKm, toast } from './util.js';
import { sel, saveSel } from './state.js';

// Montag der aktuellen Woche (wie public.league_week) und daraus fest gewählte Etappen
export const weekKey = (d = new Date()) => { const m = new Date(d); m.setHours(12, 0, 0, 0); m.setDate(m.getDate() - ((m.getDay() + 6) % 7)); return m.toISOString().slice(0, 10); };
export function stages(wk = weekKey()) {
  const pool = BUILTIN.filter(r => { const s = quickStats(r); return s.dist >= 6000 && s.dist <= 32000; });
  let h = 0; for (const c of wk) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const rnd = () => (h = (h * 1103515245 + 12345) >>> 0) / 4294967296, list = [...pool].sort(() => rnd() - .5).slice(0, 5);
  // aufsteigend nach Höhenmetern: Flachetappe vorn, Königsetappe am Ende
  return list.sort((a, b) => quickStats(a).asc - quickStats(b).asc).map((r, i) => ({ n: i + 1, id: r.id, name: r.name, dist: quickStats(r).dist, asc: quickStats(r).asc, loop: r.loop }));
}
const rpc = async (n, a) => { const { data, error } = await (await O.client()).rpc(n, a); if (error) throw error; return data; };

// Fahrt: Etappe fertig (Ziel bzw. volle Runde) → Zeit einreichen
export async function submitStage(S) {
  const st = S.tour; if (!st || S.tourDone) return; S.tourDone = true;
  const climb = S.climbLog.reduce((a, c) => a + (c.time || 0), 0), sprint = (S.sprintLog || []).reduce((a, c) => a + (c.time || 0), 0);
  try { await rpc('tour_submit', { p_stage: st.n, p_route: S.route.id, p_time: Math.round(S.t), p_climb: Math.round(climb), p_sprint: Math.round(sprint) }); return true; }
  catch (e) { toast('Tour: Ergebnis nicht gespeichert (' + (/function|schema cache/i.test(e.message) ? 'schema.sql neu ausführen' : e.message) + ')', 6000); return false; }
}
// Bergkönig: nach jedem geschafften Anstieg Bestzeit melden; gibt zurück, ob man jetzt vorn ist
export async function submitKom(routeId, climbs) {
  if (!O.loggedIn() || !climbs.length) return [];
  try { return await rpc('kom_submit', { p_route: routeId, p_climbs: climbs.map(c => ({ id: String(c.id), t: Math.round(c.time * 10) / 10 })) }) || []; } catch (e) { return []; }
}
export async function komTop(routeId) { if (!O.loggedIn()) return {}; try { return await rpc('kom_top', { p_route: routeId }) || {}; } catch (e) { return {}; } }

/* ---------- Karte unter Events & Teams ---------- */
export async function tourCard(box) {
  const S = stages(), ends = new Date(weekKey()); ends.setDate(ends.getDate() + 7);
  let rows = []; try { rows = await rpc('tour_standings', {}) || []; } catch (e) { box.innerHTML = `<h2>🏆 Tour de IndooRado</h2><p class="small muted">${/function|schema cache/i.test(e.message) ? 'Die Tour fehlt in der Datenbank (schema.sql neu ausführen).' : esc(e.message)}</p>`; return; }
  const me = rows.find(r => r.me), done = me?.per || {};
  const tab = box.dataset.tab || 'gc';
  const list = rows.filter(r => tab === 'gc' || r[tab === 'kom' ? 'climb' : 'sprint']).sort((a, b) => b.stages - a.stages || (tab === 'gc' ? a.time - b.time : tab === 'kom' ? a.climb - b.climb : a.sprint - b.sprint)).slice(0, 15);
  const val = r => fmtT(tab === 'gc' ? r.time : tab === 'kom' ? r.climb : r.sprint);
  box.innerHTML = `<div class="row between"><h2>🏆 Tour de IndooRado</h2><span class="small muted">bis ${new Date(ends - 864e5).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' })}</span></div>
    <p class="small muted">Fünf Etappen in dieser Woche. Fahr jede Strecke einmal komplett (bzw. eine volle Runde) – die schnellste Zeit je Etappe zählt.</p>
    <div class="tourst">${S.map(s => `<button class="tstage ${done[s.n] ? 'done' : ''}" data-stage="${s.n}"><b>Etappe ${s.n}</b><span>${esc(s.name)}</span><small class="muted">${fmtKm(s.dist)} km · ${Math.round(s.asc)} hm${s.loop ? ' · 1 Runde' : ''}</small>${done[s.n] ? `<small class="ok">✓ ${fmtT(done[s.n])}</small>` : '<small>▶ Fahren</small>'}</button>`).join('')}</div>
    <div class="seg sm tourtabs">${[['gc', '🟡 Gesamt'], ['kom', '🔴 Berg'], ['spr', '🟢 Sprint']].map(([k, l]) => `<button data-ttab="${k}" aria-pressed="${tab === k}">${l}</button>`).join('')}</div>
    ${list.length ? `<ol class="league">${list.map((r, i) => `<li class="${r.me ? 'me' : ''}"><span class="num">${i === 0 ? { gc: '🟡', kom: '🔴', spr: '🟢' }[tab] : i + 1}</span><b>${esc(r.name)}${r.me ? ' (du)' : ''} <small class="muted">${r.stages}/5</small></b><span class="num">${val(r)}</span></li>`).join('')}</ol>` : '<p class="small muted">Noch keine Ergebnisse – sei die oder der Erste!</p>'}`;
  box.onclick = e => {
    const t = e.target.closest('[data-ttab]'); if (t) { box.dataset.tab = t.dataset.ttab; tourCard(box); return; }
    const b = e.target.closest('[data-stage]'); if (!b) return; const st = S.find(x => x.n === +b.dataset.stage);
    sel.routeId = st.id; sel.workoutId = null; saveSel(); sessionStorage.setItem('tourStage', JSON.stringify(st)); location.hash = '#/ride';
  };
}
