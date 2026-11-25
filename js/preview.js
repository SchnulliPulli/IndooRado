// Vorschaubild je Strecke: ein einzelnes Bild der 3D-Welt vom Start, einmal gerendert und lokal gespeichert.
// Eigene kleine IndexedDB (nicht im Cloud-Abgleich, übersteht App-Updates). Gerendert wird immer nur eine Strecke zur Zeit.
const VER = 1, W = 560, H = 315;
let dbp = null;
function idb() {
  return dbp ||= new Promise((res, rej) => { const r = indexedDB.open('vv-previews', 1); r.onupgradeneeded = () => r.result.createObjectStore('p'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
const op = (mode, fn) => idb().then(db => new Promise((res, rej) => { const t = db.transaction('p', mode), q = fn(t.objectStore('p')); t.oncomplete = () => res(q?.result); t.onerror = () => rej(t.error); }));
const mem = new Map();
// Schlüssel ändert sich, wenn sich das Aussehen der Strecke ändert (Landschaft, echtes Gelände)
export const prevKey = r => `${r.id}|${r.theme || ''}|${r.realTerrain ? 1 : 0}|${VER}`;
export async function cachedPreview(r) {
  const k = prevKey(r); if (mem.has(k)) return mem.get(k);
  try { const v = await op('readonly', s => s.get(k)); if (v) mem.set(k, v); return v || null; } catch (e) { return null; }
}

let chain = Promise.resolve();
// Vorschau holen oder erzeugen (Warteschlange: nie zwei WebGL-Welten gleichzeitig)
export function routePreview(r) {
  return cachedPreview(r).then(v => v || (chain = chain.then(() => cachedPreview(r)).then(v2 => v2 || render(r)).catch(() => null)));
}
async function render(raw) {
  const [{ World }, { getRoute }, { profile }] = await Promise.all([import('./world.js'), import('./routes.js'), import('./state.js')]);
  const R = await getRoute(raw.id);
  const cv = document.createElement('canvas');
  Object.assign(cv.style, { position: 'fixed', left: '-10000px', top: '0', width: W + 'px', height: H + 'px', pointerEvents: 'none' });
  document.body.appendChild(cv);
  let world = null;
  try {
    world = new World(cv, R, { ...profile, quality: 'medium', living: true });
    world.resize(); world.setEnv({ time: 'day', weather: 'clear' });
    const d = Math.min(R.total * .02 + 40, R.total * .5);
    world.setRiders?.([]); world.preload(d);
    for (let i = 0; i < 4; i++) { world.update({ dist: d, lat: 1.5, v: 0, crank: 0, npcs: [] }, 1 / 30); await new Promise(f => requestAnimationFrame(f)); }
    world.preload(d);
    const url = world.capture(W).toDataURL('image/jpeg', .82);
    const k = prevKey(raw); mem.set(k, url); op('readwrite', s => s.put(url, k)).catch(() => { });
    return url;
  } finally { try { world?.dispose(); } catch (e) { } cv.remove(); }
}
