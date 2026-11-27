// Eigene Baukasten-Strecken mit anderen teilen: Der Bauplan (wenige Bausteine) reist im Online-Status mit.
// Wer mitfährt oder einer Gruppenfahrt beitritt und die Strecke nicht hat, baut sie daraus lokal nach (gleiche ID, gleiche Form).
import { getRaw, saveRoute, THEMES } from '../routes.js';
import { BLOCK, buildKit } from '../routekit.js';

const SURF = ['asphalt', 'gravel', 'dirt', 'trail', 'sand', 'cosmic', 'candy', 'rainbow'];
// Kompakter Bauplan für den Online-Status
export async function kitOf(routeId) {
  const r = routeId && await getRaw(routeId).catch(() => null);
  if (!r?.kit?.blocks?.length) return null;
  return { n: String(r.name || 'Strecke').slice(0, 40), th: r.theme, sf: r.surface || 'asphalt', l: !!r.kit.loop, e: Math.round(r.kit.ele0 ?? 300), b: r.kit.blocks.slice(0, 80).map(p => [p.k, +(p.lf ?? 1).toFixed(2), +(p.gf ?? 1).toFixed(2), p.mir ? 1 : 0]) };
}
// Daten von anderen: streng prüfen
export function cleanKit(k) {
  if (!k || typeof k !== 'object' || !Array.isArray(k.b) || !k.b.length || k.b.length > 80) return null;
  const num = (v, lo, hi, d) => { v = +v; return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
  const b = []; for (const x of k.b) { if (!Array.isArray(x) || !BLOCK[x[0]]) return null; b.push([x[0], num(x[1], .25, 4, 1), num(x[2], 0, 2.5, 1), x[3] ? 1 : 0]); }
  return { n: String(k.n || 'Strecke').replace(/[<>]/g, '').slice(0, 40), th: THEMES[k.th] ? k.th : 'meadow', sf: SURF.includes(k.sf) ? k.sf : 'asphalt', l: !!k.l, e: num(k.e, -500, 5000, 300), b };
}
// Strecke vorhanden machen. true = kann gefahren werden.
export async function ensureRoute(routeId, kit, owner) {
  if (!routeId) return false;
  if (await getRaw(routeId).catch(() => null)) return true;
  const k = cleanKit(kit); if (!k || !/^k-[a-z0-9]{4,20}$/.test(routeId)) return false;
  const blocks = k.b.map(([key, lf, gf, mir]) => ({ k: key, lf, gf, mir: !!mir })), r = buildKit({ blocks, loop: k.l, ele0: k.e });
  await saveRoute({ id: routeId, name: k.n + (owner ? ` (von ${String(owner).slice(0, 30)})` : ''), theme: k.th, surface: k.sf, loop: k.l, builtin: false, created: new Date().toISOString(), pts: r.pts,
    desc: `Geteilte Baukasten-Strecke${owner ? ' von ' + owner : ''}.`, kit: { blocks, loop: k.l, ele0: k.e }, shared: true, stats: { dist: r.dist, asc: r.asc } });
  return true;
}
export const notShareable = 'Diese Strecke hat der andere Fahrer selbst importiert (GPX/Strava) – sie lässt sich nicht automatisch teilen. Baukasten-Strecken gehen.';
// Vor dem Mitfahren: Strecke des anderen (Online-Status) bereitstellen; false = geht nicht (Hinweis wurde gezeigt)
export async function prepareJoin(sid, routeId, toast) {
  const PR = await import('./presence.js'), p = PR.P.peers.get(sid) || [...PR.P.peers.values()].find(x => x.route === routeId && x.kit);
  if (await ensureRoute(routeId, p?.kit, p?.name)) return true;
  toast?.(notShareable, 6000); return false;
}
