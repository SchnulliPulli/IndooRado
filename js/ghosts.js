// Freunde-Geister: eine Fahrt als kleine Geist-Datei (oder als Code) teilen und gegen sie fahren.
// Inhalt: Strecke, Name, Aussehen und die Position alle 2 s – keine Puls- oder Wattwerte, kein Datum genauer als der Tag.
import { kv } from './db.js';
import { profile } from './state.js';
const KIND = 'indoorado-ghost', OLD_KINDS = ['veloverse-ghost'], STEP = 2;
export async function listGhosts() { return (await kv.get('ghosts', [])) || []; }
async function saveGhosts(l) { await kv.set('ghosts', l); }
export async function ghostsFor(routeId) { return (await listGhosts()).filter(g => g.route === routeId && g.on !== false); }
export async function setGhostOn(id, on) { const l = await listGhosts(); const g = l.find(x => x.id === id); if (g) { g.on = on; await saveGhosts(l); } }
export async function delGhost(id) { await saveGhosts((await listGhosts()).filter(g => g.id !== id)); }

// Fahrt → Geist (Distanz in Dezimetern, Differenzen alle STEP Sekunden)
export function makeGhost(ride, routeName) {
  const s = ride.samples || [], d = [];
  let prev = 0;
  for (let i = 0; i < s.length; i += STEP) { const v = Math.round((s[i].d || 0) * 10); d.push(v - prev); prev = v; }
  const av = profile.av || {};
  return { v: 1, kind: KIND, id: ride.id + '-' + (profile.name || 'x').slice(0, 12), route: ride.routeId, routeName: routeName || ride.routeName || ride.name, name: (profile.name || 'Freund').slice(0, 30), day: (ride.date || '').slice(0, 10),
    dur: ride.sum?.dur || s.length, dist: ride.sum?.dist || (s.at(-1)?.d || 0), step: STEP, look: { jersey: profile.jersey, helmet: profile.helmet, bikeColor: profile.bikeColor, skin: profile.skin, av: { bike: av.bike, head: av.head, pattern: av.pattern, jersey2: av.jersey2, helmetStyle: av.helmetStyle } }, d };
}
// Geist auslesen und prüfen (Daten von außen: nur erwartete Felder, Längen begrenzt)
export function parseGhost(obj) {
  if (!obj || (obj.kind !== KIND && !OLD_KINDS.includes(obj.kind)) || !Array.isArray(obj.d) || !obj.route) throw new Error('Das ist keine IndooRado-Geist-Datei');
  if (obj.d.length > 20000 || !obj.d.every(Number.isFinite)) throw new Error('Geist-Datei ist beschädigt');
  const col = c => /^#[0-9a-f]{6}$/i.test(c || '') ? c : undefined, word = w => /^[a-z0-9]{1,12}$/i.test(w || '') ? w : undefined, L = obj.look || {}, A = L.av || {};
  return { v: 1, kind: KIND, id: String(obj.id || Date.now()).slice(0, 80), route: String(obj.route).slice(0, 80), routeName: String(obj.routeName || '').slice(0, 80), name: String(obj.name || 'Freund').replace(/[<>]/g, '').slice(0, 30),
    day: String(obj.day || '').slice(0, 10), dur: +obj.dur || 0, dist: +obj.dist || 0, step: Math.max(1, Math.min(10, +obj.step || STEP)),
    look: { jersey: col(L.jersey), helmet: col(L.helmet), bikeColor: col(L.bikeColor), skin: col(L.skin), av: { bike: word(A.bike), head: word(A.head), pattern: word(A.pattern), jersey2: col(A.jersey2), helmetStyle: word(A.helmetStyle) } }, d: obj.d.map(x => Math.round(x)) };
}
// Positionen als Meter-Array je Sekunde
export function track(g) { const out = new Float32Array(g.d.length * g.step); let acc = 0, prev = 0; for (let i = 0; i < g.d.length; i++) { acc += g.d[i]; const v = acc / 10; for (let k = 0; k < g.step; k++) out[i * g.step + k] = prev + (v - prev) * (k / g.step); prev = v; } return out; }
export async function addGhost(obj) { const g = parseGhost(obj), l = (await listGhosts()).filter(x => x.id !== g.id); g.added = new Date().toISOString(); g.on = true; l.unshift(g); await saveGhosts(l.slice(0, 50)); return g; }

// Als Datei
export const ghostFile = g => new File([JSON.stringify(g)], `geist-${g.name}-${g.routeName || g.route}.vvghost`.replace(/[^\w.\-äöüÄÖÜß]+/g, '_'), { type: 'application/json' });
// Als Code zum Kopieren (gzip + base64url), z. B. für Messenger
export async function ghostCode(g) {
  const cs = new Blob([JSON.stringify(g)]).stream().pipeThrough(new CompressionStream('gzip'));
  const u8 = new Uint8Array(await new Response(cs).arrayBuffer()); let s = ''; for (const b of u8) s += String.fromCharCode(b);
  return 'VVG1.' + btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export async function fromCode(code) {
  const m = String(code).trim().match(/VVG1\.([A-Za-z0-9_-]+)/); if (!m) throw new Error('Kein Geist-Code gefunden (beginnt mit VVG1.)');
  const b = atob(m[1].replace(/-/g, '+').replace(/_/g, '/')), u8 = Uint8Array.from(b, c => c.charCodeAt(0));
  const txt = await new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
  if (txt.length > 2e6) throw new Error('Code zu groß');
  return JSON.parse(txt);
}
