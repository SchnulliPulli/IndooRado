// Mitfahrer: computergesteuerte Fahrer mit eigener Leistung, Windschatten und Spurwechsel
import { integrate } from './physics.js';
import { rng, clamp } from './util.js';

const NAMES = ['M. Berger', 'L. Hofmann', 'S. Kaya', 'J. Novak', 'A. Rossi', 'K. Lindqvist', 'T. Schuster', 'E. Moreau', 'P. Wagner', 'N. Okafor', 'R. Fischer', 'C. Brandt', 'I. Petrov', 'D. Haas', 'F. Mendes', 'H. Sato'];
const JERSEYS = ['#ef4458', '#3fa7f5', '#4fd18b', '#f5c542', '#7b4fd6', '#00c2c7', '#ff4fa3', '#1b1e22', '#f2f4f6', '#ff8a3d', '#0b3d91', '#8a1538'];
const SKINS = ['#f1c7a5', '#e3b18c', '#c99272', '#9a6a4b', '#6b4532'];

// Lücke entlang der Strecke (positiv = vor dem Spieler)
export function gapOf(R, a, b) {
  let g = a - b;
  if (R.loop) { if (g > R.total / 2) g -= R.total; if (g < -R.total / 2) g += R.total; }
  return g;
}

export function makeField(R, profile, count) {
  const r = rng(Date.now() & 0xffff), base = profile.ftp / profile.kg * .62 + (profile.npcStrength || 0);
  // Spreizung: einige im eigenen Tempo, ein paar langsamer und schneller
  const offs = [0, .15, -.15, .3, -.3, .5, -.5, .8, -.7, 1.1, .05, -.05, .4, -.4, 1.4, -.9];
  const list = [];
  for (let i = 0; i < count; i++) {
    const wkg = clamp(base + offs[i % offs.length] + (r() - .5) * .2, 1.2, 5.2);
    const d0 = (i % 2 ? 1 : -1) * (25 + r() * 320);
    list.push({
      i, name: NAMES[i % NAMES.length], wkg, kg: 62 + r() * 22, d: R.loop ? ((d0 % R.total) + R.total) % R.total : (i % 3 === 0 ? r() * 12 : 15 + r() * 380),
      v: 7, lat: .4 + r() * 2.6, latT: 0, crank: r() * 6, cadence: 82 + r() * 14, ph: r() * 100, passed: false, gap: 0,
      look: { jersey: JERSEYS[(i * 5) % JERSEYS.length], bikeColor: ['#e9eef2', '#1b1e22', '#c8102e', '#3fa7f5'][i % 4], helmet: ['#f2f4f6', '#1b1e22', JERSEYS[(i * 3) % JERSEYS.length]][i % 3], skin: SKINS[i % SKINS.length], name: NAMES[i % NAMES.length] },
    });
    list[i].latT = list[i].lat;
  }
  return list;
}

// Ein Simulationsschritt. me = { d, lat, v }. Gibt { draft, overtook } für den Spieler zurück.
export function stepField(R, field, me, dt, running) {
  const all = [...field, { me: true, d: me.d, lat: me.lat, v: me.v }];
  let overtook = 0;
  for (const n of field) {
    if (!running) { n.v *= Math.pow(.3, dt); continue; }
    const g = R.gradeAt(n.d);
    // Am Berg etwas mehr, bergab weniger treten, dazu langsames Schwanken
    const surge = 1 + .07 * Math.sin((performance.now() / 1000 + n.ph) / 9) + .04 * Math.sin((performance.now() / 1000 + n.ph) / 2.3);
    const wkg = n.wkg * clamp(1 + g * .025, .55, 1.25) * surge;
    // Windschatten: jemand 0,5 bis 6 m vor mir in ähnlicher Spur
    let draft = 0;
    for (const o of all) { if (o === n) continue; const gp = gapOf(R, o.d, n.d); if (gp > .5 && gp < 6 && Math.abs(o.lat - n.lat) < 1.1) draft = Math.max(draft, .33 * (1 - (gp - .5) / 6)); }
    // Rechnet mit der Masse des Spielers, darum W/kg mal Spielergewicht
    n.v = integrate(n.v, wkg * me.kg, g, dt, draft);
    n.d += n.v * dt; n.crank += n.cadence / 60 * Math.PI * 2 * dt;
    // Spurwechsel, wenn jemand Langsameres direkt vor mir ist
    const block = all.find(o => o !== n && gapOf(R, o.d, n.d) > 0 && gapOf(R, o.d, n.d) < 4 && Math.abs(o.lat - n.lat) < .8 && o.v < n.v);
    if (block) n.latT = clamp(n.lat + (n.lat > 1.6 ? -1.1 : 1.1), .3, 3);
    n.lat += (n.latT - n.lat) * Math.min(1, dt * .9);
    // Strecke: Runde oder am Ende hinter den Spieler zurücksetzen
    if (R.loop) n.d = ((n.d % R.total) + R.total) % R.total;
    else if (n.d >= R.total - 5) { n.d = Math.max(0, me.d - 250 - Math.random() * 200); n.v = me.v; }
    // Feld zusammenhalten: zu weit weg -> außer Sicht neu einsetzen
    let gap = gapOf(R, n.d, me.d);
    if (Math.abs(gap) > 900) { const ahead = gap < 0; n.d = me.d + (ahead ? 1 : -1) * (300 + Math.random() * 250); if (!R.loop) n.d = clamp(n.d, 0, R.total - 10); if (R.loop) n.d = ((n.d % R.total) + R.total) % R.total; n.v = me.v; gap = gapOf(R, n.d, me.d); n.passed = gap < 0; }
    // Überholt: von vorne nach hinten gewechselt, nahe am Spieler
    const was = n.gap; n.gap = gap;
    if (was > 0 && gap <= 0 && Math.abs(gap) < 15 && running && me.v > n.v - .5) overtook++;
  }
  // Windschatten für den Spieler
  let draft = 0, wheel = null;
  for (const n of field) { const gp = gapOf(R, n.d, me.d); if (gp > .5 && gp < 6 && Math.abs(n.lat - me.lat) < 1.3) { const dr = .33 * (1 - (gp - .5) / 6); if (dr > draft) { draft = dr; wheel = n; } } }
  return { draft, wheel, overtook };
}
