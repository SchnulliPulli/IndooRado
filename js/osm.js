// Echte Gebäude aus OpenStreetMap entlang einer importierten Strecke (Overpass-API, Server der FOSSGIS e.V. in Deutschland).
// Abgefragt wird nur ein Korridor von 150 m um die Strecke. Daten: © OpenStreetMap-Mitwirkende, Lizenz ODbL.
// Gespeichert lokal an der Strecke (nicht im Abgleich, zu groß); auf anderen Geräten bei Bedarf neu laden.
const API = 'https://overpass-api.de/api/interpreter', CORR = 150, MAXB = 20000;
export const OSM_ATTR = '© OpenStreetMap-Mitwirkende (ODbL)';
const R2D = 180 / Math.PI, hav = (a, b) => { const dl = (b[0] - a[0]) / R2D, dn = (b[1] - a[1]) / R2D, x = Math.sin(dl / 2) ** 2 + Math.cos(a[0] / R2D) * Math.cos(b[0] / R2D) * Math.sin(dn / 2) ** 2; return 2 * 6371000 * Math.asin(Math.sqrt(x)); };
// Strecken mit echter Lage (GPX, Strava). Eingebaute und Baukasten-Strecken liegen an erfundenen Orten.
export const osmPossible = raw => !!raw && !raw.builtin && !raw.kit && Array.isArray(raw.pts) && raw.pts.length > 1;
const TYPE_H = { house: 7, detached: 7, residential: 9, semidetached_house: 7, terrace: 8, bungalow: 4, garage: 3, garages: 3, shed: 3, hut: 3, carport: 3, roof: 4, apartments: 15, commercial: 12, retail: 8, office: 18, industrial: 9, warehouse: 9, church: 18, cathedral: 30, chapel: 9, school: 11, university: 15, hospital: 18, hotel: 18, barn: 8, farm: 7, farm_auxiliary: 6, greenhouse: 4, stadium: 18, train_station: 12, civic: 12, public: 12, tower: 25 };
const KIND = t => /church|cathedral|chapel/.test(t) ? 2 : /industrial|warehouse|garage|shed|hut|carport|barn|farm_aux|greenhouse/.test(t) ? 1 : /apartments|commercial|office|retail|hotel|hospital|school|university|civic|public|train/.test(t) ? 3 : 0;
function heightOf(tags) {
  const h = parseFloat(String(tags.height || '').replace(',', '.')); if (h > 1 && h < 400) return h;
  const lv = parseFloat(tags['building:levels']); if (lv > 0 && lv < 120) return lv * 3.1 + (parseFloat(tags['roof:levels']) || 0) * 2 + 1.5;
  return TYPE_H[tags.building] || 8;
}
// Strecke alle ~80 m abtasten und in Abschnitte für einzelne Anfragen teilen
function corridors(pts) {
  const s = [pts[0]]; let acc = 0;
  for (let i = 1; i < pts.length; i++) { acc += hav(pts[i - 1], pts[i]); if (acc >= 80) { s.push(pts[i]); acc = 0; } }
  s.push(pts.at(-1)); const out = []; for (let i = 0; i < s.length; i += 140) out.push(s.slice(Math.max(0, i - 1), i + 140)); return out;
}
export async function loadBuildings(raw, onProgress = () => { }) {
  const parts = corridors(raw.pts), seen = new Set(), b = [];
  for (let i = 0; i < parts.length; i++) {
    onProgress(`Gebäude werden geladen … Abschnitt ${i + 1}/${parts.length}`);
    const line = parts[i].map(p => `${p[0].toFixed(5)},${p[1].toFixed(5)}`).join(',');
    const q = `[out:json][timeout:90];way["building"](around:${CORR},${line});out tags geom qt;`;
    let res = null;
    for (let tr = 0; tr < 3 && !res; tr++) {
      try { const r = await fetch(API, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
        if (r.status === 429 || r.status === 504) { onProgress('Server ausgelastet, kurz warten …'); await new Promise(f => setTimeout(f, 4000 * (tr + 1))); continue; }
        if (!r.ok) throw new Error('Overpass antwortet mit ' + r.status); res = await r.json(); } catch (e) { if (tr === 2) throw e; await new Promise(f => setTimeout(f, 2500)); }
    }
    for (const w of res?.elements || []) {
      if (w.type !== 'way' || seen.has(w.id) || !Array.isArray(w.geometry) || w.geometry.length < 4) continue; seen.add(w.id);
      const g = w.geometry, tags = w.tags || {}, lat0 = Math.round(g[0].lat * 1e6), lon0 = Math.round(g[0].lon * 1e6), d = [];
      let pl = lat0, pn = lon0; for (let k = 1; k < g.length - 1; k++) { const la = Math.round(g[k].lat * 1e6), lo = Math.round(g[k].lon * 1e6); d.push(la - pl, lo - pn); pl = la; pn = lo; }
      b.push([Math.round(heightOf(tags) * 10) / 10, KIND(tags.building || ''), lat0, lon0, d]);
      if (b.length >= MAXB) break;
    }
    if (b.length >= MAXB) break;
    if (i < parts.length - 1) await new Promise(f => setTimeout(f, 1200)); // fair zur kostenlosen Schnittstelle
  }
  raw.osm = { v: 1, at: new Date().toISOString(), n: b.length, b };
  return b.length;
}
// Gebäude als Grundriss [[lat, lon], …] + Höhe + Art
export function* footprints(osm) {
  for (const [h, kind, la, lo, d] of osm?.b || []) {
    const p = [[la / 1e6, lo / 1e6]]; let a = la, o = lo; for (let k = 0; k < d.length; k += 2) { a += d[k]; o += d[k + 1]; p.push([a / 1e6, o / 1e6]); }
    yield { h, kind, p };
  }
}
