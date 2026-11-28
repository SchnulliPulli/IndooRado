// Mitfahrer: computergesteuerte Fahrer mit eigener Leistung, Windschatten und Spurwechsel
import { integrate } from './physics.js';
import { rng, clamp } from './util.js';

// Großer Namensvorrat: Mitfahrer wechseln von Zeit zu Zeit, damit Ride Ons an immer andere gehen
const NAMES = ['M. Berger', 'L. Hofmann', 'S. Kaya', 'J. Novak', 'A. Rossi', 'K. Lindqvist', 'T. Schuster', 'E. Moreau', 'P. Wagner', 'N. Okafor', 'R. Fischer', 'C. Brandt', 'I. Petrov', 'D. Haas', 'F. Mendes', 'H. Sato',
  'A. Yilmaz', 'B. Kowalski', 'C. Dubois', 'D. Nielsen', 'E. García', 'F. Bianchi', 'G. Papadopoulos', 'H. Müller', 'I. Svensson', 'J. van Dijk', 'K. Tanaka', 'L. Martin', 'M. Horvath', 'N. Silva', 'O. Andersen', 'P. Novák',
  'Q. Nguyen', 'R. Costa', 'S. Weber', 'T. O’Brien', 'U. Lehmann', 'V. Ricci', 'W. Zhang', 'X. Moreno', 'Y. Kim', 'Z. Becker', 'A. Schmid', 'B. Rahman', 'C. Lopez', 'D. Kovač', 'E. Laine', 'F. Huber', 'G. Murphy', 'H. Jansen',
  'I. Ortega', 'J. Keller', 'K. Mensah', 'L. Russo', 'M. Akhtar', 'N. Brunner', 'O. Varga', 'P. Fontaine', 'R. Ito', 'S. Wolf', 'T. Haddad', 'V. Popescu', 'W. Schulz', 'Y. Cohen', 'Z. Marin', 'E. Kraus', 'J. Lund', 'M. Bauer'];
export function freshName(used) { const free = NAMES.filter(n => !used.has(n)); return free[Math.floor(Math.random() * free.length)] || NAMES[Math.floor(Math.random() * NAMES.length)]; }
// Weit entfernte Mitfahrer (außer Sicht) bekommen ab und zu einen neuen Namen; liefert die Indizes zum Neubeschriften
export function rotateNames(R, field, meD) {
  const used = new Set(field.map(n => n.name)), changed = [];
  field.forEach((n, i) => { if (n.remote || n.race) return; if (n.respawned || (Math.abs(gapOf(R, n.d, meD)) > 180 && Math.random() < .35)) { n.respawned = false; n.name = n.look.name = freshName(used); used.add(n.name); changed.push(i); } });
  return changed;
}
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
      i, name: '', wkg, kg: 62 + r() * 22, d: R.loop ? ((d0 % R.total) + R.total) % R.total : (i % 3 === 0 ? r() * 12 : 15 + r() * 380),
      v: 7, lat: .4 + r() * 2.6, latT: 0, crank: r() * 6, cadence: 82 + r() * 14, ph: r() * 100, passed: false, gap: 0,
      look: { av: { bike: ['road', 'road', 'road', 'gravel', 'tt', 'mtb', 'road', 'city'][i % 8], head: i % 11 === 7 ? ['fox', 'panda', 'cat', 'bear'][i % 4] : 'human' }, jersey: JERSEYS[(i * 5) % JERSEYS.length], bikeColor: ['#e9eef2', '#1b1e22', '#c8102e', '#3fa7f5'][i % 4], helmet: ['#f2f4f6', '#1b1e22', JERSEYS[(i * 3) % JERSEYS.length]][i % 3], skin: SKINS[i % SKINS.length], name: '' },
    });
    list[i].latT = list[i].lat; list[i].name = list[i].look.name = freshName(new Set(list.map(n => n.name)));
  }
  return list;
}

// Ein Simulationsschritt. me = { d, lat, v }. Gibt { draft, overtook } für den Spieler zurück.
export function stepField(R, field, me, dt, running) {
  const all = [...field, { me: true, d: me.d, lat: me.lat, v: me.v }];
  let overtook = 0;
  for (const n of field) {
    // Echte Mitfahrer (online): nur mit ihrem gemeldeten Tempo weiterrechnen, keine Physik, kein Neu-Einsetzen
    if (n.remote) { n.d += n.v * dt; if (R.loop) n.d = ((n.d % R.total) + R.total) % R.total; else n.d = Math.min(n.d, R.total); n.crank += n.cadence / 60 * Math.PI * 2 * dt; n.gap = gapOf(R, n.d, me.d); continue; }
    if (!running) { n.v *= Math.pow(.3, dt); continue; }
    // Rennen: im Ziel locker ausrollen
    if (n.race && n.fin != null) { n.v = Math.max(0, n.v - dt * .8); n.d += n.v * dt; if (R.loop) n.d = ((n.d % R.total) + R.total) % R.total; else n.d = Math.min(n.d, R.total); n.crank += n.v > 1 ? n.cadence / 60 * Math.PI * 2 * dt * .5 : 0; n.gap = gapOf(R, n.d, me.d); continue; }
    const g = R.gradeAt(n.d);
    // Am Berg etwas mehr, bergab weniger treten, dazu langsames Schwanken
    const surge = n.pace ? 1 : 1 + .07 * Math.sin((performance.now() / 1000 + n.ph) / 9) + .04 * Math.sin((performance.now() / 1000 + n.ph) / 2.3);
    // Pace-Partner: gleichmäßig wie ein Uhrwerk, am Berg nur wenig mehr
    const wkg = n.pace ? n.wkg * clamp(1 + g * .008, .92, 1.08) : n.wkg * clamp(1 + g * .025, .55, 1.25) * surge;
    // Windschatten: jemand 0,5 bis 6 m vor mir in ähnlicher Spur
    let draft = 0;
    for (const o of all) { if (o === n) continue; const gp = gapOf(R, o.d, n.d); if (gp > .5 && gp < 6 && Math.abs(o.lat - n.lat) < 1.1) draft = Math.max(draft, .33 * (1 - (gp - .5) / 6)); }
    // Rechnet mit der Masse des Spielers, darum W/kg mal Spielergewicht
    n.v = integrate(n.v, wkg * me.kg, g, dt, draft);
    n.d += n.v * dt; n.crank += n.cadence / 60 * Math.PI * 2 * dt;
    if (n.race) n.odo = (n.odo || 0) + n.v * dt;
    // Spurwechsel, wenn jemand Langsameres direkt vor mir ist
    // Ziel nur neu setzen, wenn der alte Spurwechsel fast fertig ist (sonst Hin- und Herzucken)
    n.latCd = Math.max(0, (n.latCd || 0) - dt);
    const block = n.latCd <= 0 && Math.abs(n.latT - n.lat) < .15 && all.find(o => o !== n && gapOf(R, o.d, n.d) > 0 && gapOf(R, o.d, n.d) < 4 && Math.abs(o.lat - n.lat) < .8 && o.v < n.v);
    if (block) { n.latT = clamp(n.lat + (n.lat > 1.6 ? -1.1 : 1.1), .3, 3); n.latCd = 2.5; }
    // weich beschleunigen und abbremsen statt konstant nachziehen
    const dl = n.latT - n.lat; n.latV = (n.latV || 0) + (clamp(dl * 1.2, -.6, .6) - (n.latV || 0)) * Math.min(1, dt * 2);
    n.lat += n.latV * dt;
    // Strecke: Runde oder am Ende hinter den Spieler zurücksetzen
    if (R.loop) n.d = ((n.d % R.total) + R.total) % R.total;
    else if (n.race) n.d = Math.min(n.d, R.total);
    else if (n.d >= R.total - 5) { n.d = Math.max(0, me.d - 250 - Math.random() * 200); n.v = me.v; n.respawned = true; }
    // Feld zusammenhalten: zu weit weg -> außer Sicht neu einsetzen
    let gap = gapOf(R, n.d, me.d);
    if (Math.abs(gap) > 900 && !n.race) { const ahead = gap < 0; n.d = me.d + (ahead ? 1 : -1) * (300 + Math.random() * 250); if (!R.loop) n.d = clamp(n.d, 0, R.total - 10); if (R.loop) n.d = ((n.d % R.total) + R.total) % R.total; n.v = me.v; gap = gapOf(R, n.d, me.d); n.passed = gap < 0; n.respawned = true; }
    // Überholt: von vorne nach hinten gewechselt, nahe am Spieler
    const was = n.gap; n.gap = gap;
    if (was > 0 && gap <= 0 && Math.abs(gap) < 15 && running && me.v > n.v - .5) overtook++;
  }
  // Windschatten für den Spieler
  let draft = 0, wheel = null;
  for (const n of field) { const gp = gapOf(R, n.d, me.d); if (gp > .5 && gp < 6 && Math.abs(n.lat - me.lat) < 1.3) { const dr = .33 * (1 - (gp - .5) / 6); if (dr > draft) { draft = dr; wheel = n; } } }
  return { draft, wheel, overtook };
}

/* ---------- Pace-Partner (wie bei Zwift): feste Gruppe mit konstantem W/kg ----------
   Ein Anführer mit Schild plus vier Mitfahrer im selben Trikot. Startet knapp vor dem Spieler. */
export function makePaceGroup(R, profile, wkg, meD) {
  const col = wkg < 2.3 ? '#4fd18b' : wkg < 2.8 ? '#3fa7f5' : wkg < 3.3 ? '#f5c542' : wkg < 3.8 ? '#ff8a3d' : '#ef4458';
  const label = String(wkg.toFixed(1)).replace('.', ',');
  return Array.from({ length: 5 }, (_, i) => {
    let d = meD + 40 + i * 2.2 + (i % 2) * .6; if (R.loop) d = ((d % R.total) + R.total) % R.total; else d = Math.min(d, R.total - 20);
    const name = i === 0 ? `🐇 Pace ${label} W/kg` : freshName(new Set());
    return { i: 900 + i, name, wkg, kg: 70, d, v: 8, lat: [1.4, 1.0, 1.8, 1.2, 1.6][i], latT: [1.4, 1.0, 1.8, 1.2, 1.6][i], crank: i, cadence: 88, ph: i * 7, passed: false, gap: 0, pace: true, leader: i === 0,
      look: { av: { bike: 'road', head: 'human' }, jersey: col, bikeColor: '#222', helmet: col, skin: ['#f1c27d', '#e0ac69', '#8d5524', '#c68642', '#ffdbac'][i], name } };
  });
}
