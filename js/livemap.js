// Kleine Streckenkarte mit der aktuellen Position des Fahrers (Live-Ansicht, Handy-Ansicht).
// Die Strecke kommt aus den eigenen Daten (eingebaute Strecken oder per Abgleich vorhandene eigene Strecken).
import { getRoute } from './routes.js';
const cache = new Map();
async function shape(routeId) {
  if (cache.has(routeId)) return cache.get(routeId);
  let s = null;
  try {
    const R = await getRoute(routeId);
    if (R && R.id === routeId) {
      const n = 160, P = []; for (let i = 0; i <= n; i++) { const d = R.total * i / n; P.push([R.xAt(d), R.zAt(d)]); }
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const [x, z] of P) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
      const W = 100, pad = 6, k = (W - 2 * pad) / Math.max(x1 - x0, z1 - z0, 1), H = Math.max(40, Math.round((z1 - z0) * k + 2 * pad));
      const tx = x => pad + (x - x0) * k + (W - 2 * pad - (x1 - x0) * k) / 2, tz = z => pad + (z - z0) * k;
      s = { W, H, d: 'M' + P.map(([x, z]) => tx(x).toFixed(1) + ' ' + tz(z).toFixed(1)).join('L'), at: d => [tx(R.xAt(d)), tz(R.zAt(d))], start: [tx(P[0][0]), tz(P[0][1])], end: [tx(P.at(-1)[0]), tz(P.at(-1)[1])], loop: R.loop, total: R.total };
    }
  } catch (e) { }
  cache.set(routeId, s); return s;
}
// SVG mit Strecke, Start/Ziel und Fahrer-Punkt; leer, wenn die Strecke auf diesem Gerät fehlt
export async function liveMapSvg(routeId, pos, cls = 'livemap') {
  if (!routeId) return '';
  const s = await shape(routeId); if (!s) return '';
  const [px, pz] = s.at(Math.max(0, Math.min(s.total, pos || 0)));
  return `<svg class="${cls}" viewBox="0 0 ${s.W} ${s.H}" role="img" aria-label="Position auf der Strecke"><path d="${s.d}" class="lmroad"/>${s.loop ? '' : `<circle cx="${s.end[0]}" cy="${s.end[1]}" r="2.2" class="lmend"/>`}<circle cx="${s.start[0]}" cy="${s.start[1]}" r="2.2" class="lmstart"/><circle cx="${px.toFixed(1)}" cy="${pz.toFixed(1)}" r="5" class="lmhalo"/><circle cx="${px.toFixed(1)}" cy="${pz.toFixed(1)}" r="2.8" class="lmme"/></svg>`;
}
