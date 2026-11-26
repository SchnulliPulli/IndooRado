// Strecken-Baukasten: Bausteine (Geraden, Kurven, Kehren, Anstiege, verrückte Elemente) → Streckenpunkte [lat, lon, Höhe]
const TAU = Math.PI * 2, D2R = Math.PI / 180, M_DEG = 111320;
// Steigungsverläufe (t = 0…1 innerhalb des Bausteins, g = Steigung in %)
const GP = {
  flat: () => 0, const: (t, g) => g, wave: (t, g, n = 4) => g * Math.sin(TAU * n * t), crest: (t, g) => t < .5 ? g : -g, valley: (t, g) => t < .5 ? -g : g,
  ramp: (t, g) => g * Math.min(1, t * 4) * Math.min(1, (1 - t) * 6 + .2), stairs: (t, g) => (Math.floor(t * 6) % 2 ? g : 0),
};
// Kurvenverläufe: Drehrate (Anteil der Gesamtdrehung je t), Integral über 0…1 = 1 (bei s/chicane/snake: Spitzenwinkel)
const TP = {
  none: () => 0, const: () => 1, mid: t => (t > .2 && t < .8 ? 1 / .6 : 0),
  s: t => (t < .5 ? 2 : -2), chicane: t => (t < .25 ? 4 : t < .75 ? -4 : 4), snake: (t, n = 4) => TAU * n / 2 * Math.cos(TAU * n * t) / Math.PI * 2,
  serp: (t, n = 6) => { const seg = t * n, f = seg - Math.floor(seg), dir = Math.floor(seg) % 2 ? -1 : 1; return f > .55 ? dir * n / .45 : 0; },
  zigzag: (t, n = 6) => { const seg = t * n, f = seg - Math.floor(seg), dir = Math.floor(seg) % 2 ? -1 : 1; return f < .3 ? dir * n / .3 * (Math.floor(seg) ? 2 : 1) : 0; },
};
// Katalog: k, Name, Symbol, Kategorie, Länge (m), Drehung (°), Kurvenform, Steigung (%), Steigungsform
export const BLOCKS = [
  ['flat', 'Gerade', '➖', 'Geraden', 1000, 0, 'none', 0, 'flat'],
  ['long', 'Lange Gerade', '🛣️', 'Geraden', 3000, 0, 'none', 0, 'flat'],
  ['falseflat', 'Falsche Ebene', '📐', 'Geraden', 2000, 0, 'none', 1.5, 'const'],
  ['rollers', 'Wellen', '〰️', 'Geraden', 2000, 0, 'none', 3, 'wave'],
  ['sprint', 'Sprint-Gerade', '⚡', 'Geraden', 400, 0, 'none', 0, 'flat'],
  ['bendL', 'Weiter Bogen links', '↖️', 'Kurven', 1000, 60, 'const', 0, 'flat'],
  ['bendR', 'Weiter Bogen rechts', '↗️', 'Kurven', 1000, -60, 'const', 0, 'flat'],
  ['left45', 'Leichte Linkskurve', '↰', 'Kurven', 150, 45, 'const', 0, 'flat'],
  ['right45', 'Leichte Rechtskurve', '↱', 'Kurven', 150, -45, 'const', 0, 'flat'],
  ['left90', 'Linkskurve 90°', '⬅️', 'Kurven', 200, 90, 'const', 0, 'flat'],
  ['right90', 'Rechtskurve 90°', '➡️', 'Kurven', 200, -90, 'const', 0, 'flat'],
  ['hairL', 'Spitzkehre links', '↩️', 'Kurven', 140, 180, 'mid', 0, 'flat'],
  ['hairR', 'Spitzkehre rechts', '↪️', 'Kurven', 140, -180, 'mid', 0, 'flat'],
  ['scurve', 'S-Kurve', '〽️', 'Kurven', 400, 50, 's', 0, 'flat'],
  ['chicane', 'Schikane', '🔀', 'Kurven', 220, 35, 'chicane', 0, 'flat'],
  ['snake', 'Schlangenlinie', '🐍', 'Kurven', 1500, 25, 'snake', 0, 'flat'],
  ['loop', 'Kreisverkehr (360°)', '🔄', 'Kurven', 450, 360, 'const', 0, 'flat'],
  ['kicker', 'Rampe', '📈', 'Berge', 150, 0, 'none', 10, 'ramp'],
  ['climbS', 'Kurzer Anstieg', '⛰️', 'Berge', 600, 0, 'none', 6, 'const'],
  ['climb', 'Anstieg', '🏔️', 'Berge', 2000, 20, 'snake', 5, 'const'],
  ['pass', 'Langer Pass', '🗻', 'Berge', 6000, 30, 'snake', 7, 'const'],
  ['wall', 'Steilwand', '🧗', 'Berge', 250, 0, 'none', 15, 'const'],
  ['serpUp', 'Serpentinen bergauf', '🐐', 'Berge', 2600, 180, 'serp', 8, 'const'],
  ['spiral', 'Spirale bergauf', '🌀', 'Berge', 1300, 360, 'const', 6, 'const'],
  ['crest', 'Kuppe', '⛰', 'Berge', 1000, 0, 'none', 5, 'crest'],
  ['stairs', 'Treppe', '🪜', 'Berge', 1500, 0, 'none', 11, 'stairs'],
  ['descent', 'Abfahrt', '⬇️', 'Abfahrten', 2000, 15, 'snake', -5, 'const'],
  ['dive', 'Sturzflug', '🪂', 'Abfahrten', 400, 0, 'none', -12, 'const'],
  ['serpDown', 'Serpentinen bergab', '🎿', 'Abfahrten', 2600, 180, 'serp', -8, 'const'],
  ['valley', 'Senke', '🥣', 'Abfahrten', 1000, 0, 'none', 4, 'valley'],
  ['coaster', 'Achterbahn', '🎢', 'Verrückt', 1500, 30, 'snake', 9, 'wave'],
  ['zigzag', 'Zickzack', '⚡', 'Verrückt', 900, 80, 'zigzag', 0, 'flat'],
  ['corkscrew', 'Korkenzieher', '🍾', 'Verrückt', 900, 720, 'const', 5, 'const'],
  ['heart', 'Herzschleife', '💗', 'Verrückt', 1200, 360, 's', 0, 'wave'],
  ['bigloop', 'Große Acht', '♾️', 'Verrückt', 3000, 360, 's', 0, 'flat'],
].map(([k, n, i, cat, len, turn, tp, g, gp]) => ({ k, n, i, cat, len, turn, tp, g, gp }));
export const BLOCK = Object.fromEntries(BLOCKS.map(b => [b.k, b]));
export const CATS = [...new Set(BLOCKS.map(b => b.cat))];

// Ein platzierter Baustein: { k, lf (Längenfaktor), gf (Steilheit), mir (gespiegelt) }
export const blockLen = p => Math.round(BLOCK[p.k].len * (p.lf ?? 1));
function walk(blocks, ele0) {
  const P = [[0, 0, ele0]], marks = []; let x = 0, z = 0, h = 0, e = ele0, d = 0;
  for (const p of blocks) {
    const B = BLOCK[p.k]; if (!B) continue;
    const L = blockLen(p), steps = Math.max(2, Math.round(L / 2)), ds = L / steps, turn = B.turn * D2R * (p.mir ? -1 : 1), g = B.g * (p.gf ?? 1);
    const from = d;
    for (let s = 0; s < steps; s++) {
      const t = (s + .5) / steps;
      h += TP[B.tp](t) * turn * ds / L;
      e += GP[B.gp](t, g) / 100 * ds;
      x += Math.sin(h) * ds; z -= Math.cos(h) * ds; d += ds;
      P.push([x, z, e]);
    }
    marks.push({ k: p.k, from, to: d });
  }
  return { P, h, marks };
}
// Rundkurs schließen: weicher Bogen (Hermite) zurück zum Start, Höhe gleitet zurück
function closeLoop(P, hEnd) {
  const [x0, z0, e0] = P.at(-1), [x1, z1, e1] = P[0], dist = Math.hypot(x1 - x0, z1 - z0);
  if (dist < 5) return 0;
  const k = Math.max(60, dist * .9), t0 = [Math.sin(hEnd) * k, -Math.cos(hEnd) * k], t1 = [0, -k]; // Start-Richtung: Norden
  const n = Math.max(10, Math.round(dist * 1.4 / 2)); let len = 0, prev = [x0, z0];
  for (let i = 1; i <= n; i++) {
    const s = i / n, h00 = 2 * s ** 3 - 3 * s ** 2 + 1, h10 = s ** 3 - 2 * s ** 2 + s, h01 = -2 * s ** 3 + 3 * s ** 2, h11 = s ** 3 - s ** 2;
    const x = h00 * x0 + h10 * t0[0] + h01 * x1 + h11 * t1[0], z = h00 * z0 + h10 * t0[1] + h01 * z1 + h11 * t1[1];
    len += Math.hypot(x - prev[0], z - prev[1]); prev = [x, z];
    if (i < n) P.push([x, z, e0 + (e1 - e0) * (s * s * (3 - 2 * s))]);
  }
  return len;
}
export function buildKit(kit) {
  const { P, h, marks } = walk(kit.blocks || [], kit.ele0 ?? 300);
  const closeLen = kit.loop ? closeLoop(P, h) : 0;
  // in Breiten-/Längengrade, alle 10 m ein Punkt
  const lat0 = kit.lat0 ?? 47.3, lon0 = kit.lon0 ?? 11.2, kx = M_DEG * Math.cos(lat0 * D2R), pts = []; let acc = 0, next = 0;
  for (let i = 0; i < P.length; i++) { if (i) acc += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); if (acc >= next || i === P.length - 1) { pts.push([+(lat0 - P[i][1] / M_DEG).toFixed(6), +(lon0 + P[i][0] / kx).toFixed(6), +P[i][2].toFixed(1)]); next += 10; } }
  let asc = 0, maxG = 0; for (let i = 1; i < P.length; i++) { const de = P[i][2] - P[i - 1][2], dd = Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); if (de > 0) asc += de; if (dd > 1) maxG = Math.max(maxG, Math.abs(de / dd * 100)); }
  return { pts, P, marks, dist: acc, closeLen, asc, maxG };
}
// Zufallsstrecke aus 8–14 Bausteinen
export function randomKit(seed = Math.random()) {
  let s = Math.floor(seed * 1e9) || 1; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const n = 8 + Math.floor(r() * 7), blocks = [];
  for (let i = 0; i < n; i++) { const b = BLOCKS[Math.floor(r() * BLOCKS.length)]; blocks.push({ k: b.k, lf: +(0.6 + r() * .9).toFixed(2), gf: 1, mir: r() < .5 }); }
  return blocks;
}
export const PRESETS = {
  'Flaches Oval': ['long', 'hairL', 'long', 'hairL'],
  'Alpenpass': ['flat', 'climbS', 'serpUp', 'pass', 'crest', 'serpDown', 'descent', 'flat'],
  'Achterbahn-Park': ['sprint', 'coaster', 'corkscrew', 'zigzag', 'coaster', 'loop', 'dive', 'valley', 'kicker'],
  'Kurvenfestival': ['scurve', 'chicane', 'snake', 'hairR', 'bendL', 'zigzag', 'scurve', 'left90', 'right90'],
  'Kletterwand': ['flat', 'wall', 'flat', 'stairs', 'wall', 'descent', 'spiral', 'dive'],
};
