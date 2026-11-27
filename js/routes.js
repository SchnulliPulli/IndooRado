// Strecken: eingebaute Welten, GPX-Import, Aufbereitung für Physik und 3D-Welt
import { clamp, lerp, smooth, fbm, noise1 } from './util.js';
import { db, tomb } from './db.js';

const R2D = 180 / Math.PI, M_DEG = 111320;
const TAU = Math.PI * 2;

/* ---------- Themen der Landschaft ---------- */
export const THEMES = {
  meadow: { sky: ['#3d86d4', '#cfe6f7'], grass: ['#5f9a46', '#78ad4f', '#8fb85a'], hillAmp: 22, hillScale: 520, valley: 0.04, trees: 0.6, conifer: 0.35, houses: 0.08, rocks: 0.05, snow: 9999, mountains: 0.5 },
  lake: { sky: ['#3f8ed8', '#d4ebf8'], grass: ['#5b9844', '#74ab4c', '#93bb5c'], hillAmp: 16, hillScale: 480, valley: 0.05, trees: 0.55, conifer: 0.4, houses: 0.06, rocks: 0.04, snow: 9999, mountains: 0.8, lake: true },
  alpine: { sky: ['#2f74c4', '#d9ecf8'], grass: ['#5a8f43', '#6d9a4a', '#8aa46a'], hillAmp: 45, hillScale: 650, valley: 0.22, trees: 0.7, conifer: 0.95, houses: 0.02, rocks: 0.25, snow: 1750, mountains: 1.6 },
  coast: { sky: ['#4a92d8', '#e2f1fa'], grass: ['#86a85a', '#9db66a', '#c7c08a'], hillAmp: 26, hillScale: 600, valley: 0.06, trees: 0.25, conifer: 0.2, houses: 0.1, rocks: 0.15, snow: 9999, mountains: 0.4, coast: -1 },
  forest: { sky: ['#4b8fd0', '#d6eaf5'], grass: ['#4c853a', '#5d9343', '#6f9d48'], hillAmp: 20, hillScale: 380, valley: 0.05, trees: 1.0, conifer: 0.6, houses: 0.01, rocks: 0.08, snow: 9999, mountains: 0.3 },
  tropical: { sky: ['#2d8fe0', '#e6f6ff'], grass: ['#3f9a3a', '#4fac43', '#76b84e'], hillAmp: 55, hillScale: 420, valley: 0.08, trees: 0.8, conifer: 0, palm: 0.45, houses: 0.25, rocks: 0.12, snow: 9999, mountains: 0.9, coast: -1, landmark: 'dome', waterGap: 4 },
  himalaya: { sky: ['#1c5fc4', '#d7e8f7'], grass: ['#8c8a5e', '#9e8f66', '#b5a57a'], hillAmp: 70, hillScale: 700, valley: 0.3, trees: 0.12, conifer: 0.9, houses: 0.03, rocks: 0.7, snow: 4950, mountains: 2.6, flags: true, dry: true },
  desert: { sky: ['#3d8bd0', '#f4ead8'], grass: ['#d6b47a', '#c99d62', '#e0c48c'], hillAmp: 30, hillScale: 500, valley: 0.05, trees: 0.12, conifer: 0, cactus: 0.85, houses: 0.02, rocks: 0.5, snow: 9999, mountains: 0.6, landmark: 'mesa', dry: true },
  fjord: { sky: ['#3f7fc0', '#dce9f2'], grass: ['#4f7f3f', '#5d8c45', '#7a9a5a'], hillAmp: 60, hillScale: 520, valley: 0.35, trees: 0.8, conifer: 0.95, houses: 0.05, rocks: 0.3, snow: 1150, mountains: 1.5, coast: 1, waterGap: 7 },
  ridge: { sky: ['#2a6cc4', '#e0eef9'], grass: ['#8a8f72', '#9a9a80', '#b2ab92'], hillAmp: 8, hillScale: 300, valley: -0.62, trees: 0.02, conifer: 1, houses: 0, rocks: 0.9, snow: 3150, mountains: 2.2, dry: true },
  farm: { sky: ['#4790db', '#e4f1f8'], grass: ['#6fa64a', '#86b552', '#b9c26a'], hillAmp: 7, hillScale: 600, valley: 0.01, trees: 0.3, conifer: 0.1, houses: 0.08, rocks: 0.01, snow: 9999, mountains: 0.25, cows: true },
  moon: { sky: ['#000000', '#07080c'], grass: ['#8d8f93', '#a3a5a9', '#77797d'], hillAmp: 14, hillScale: 220, valley: 0.03, trees: 0, conifer: 0, houses: 0, rocks: 1.4, snow: 99999, mountains: 0.9, moon: true, gravity: 1.62, dry: true },
  tuscany: { sky: ['#3f8ad8', '#f0eee0'], grass: ['#9aa651', '#b8a95c', '#c6b06a'], hillAmp: 28, hillScale: 420, valley: 0.04, trees: 0.35, conifer: 0.7, houses: 0.14, rocks: 0.03, snow: 9999, mountains: 0.35 },
  // Jahreszeiten und Regionen für mehr Abwechslung
  autumn: { sky: ['#5d86b8', '#f1dcc0'], grass: ['#8c8a3c', '#9c7e3e', '#76803a'], hillAmp: 24, hillScale: 420, valley: 0.05, trees: 0.95, conifer: 0.2, houses: 0.05, rocks: 0.08, snow: 9999, mountains: 0.5, tints: ['#e2762a', '#c9452a', '#e8b12f', '#b35a24', '#d89a2c', '#8f9a3a'], tintKinds: ['leafy'], particles: 'autumn' },
  winter: { sky: ['#8ea6bf', '#e9eef3'], grass: ['#eef3f6', '#e3eaef', '#f7f9fb'], rock: '#9aa3ab', hillAmp: 30, hillScale: 480, valley: 0.08, trees: 0.8, conifer: 0.85, houses: 0.06, rocks: 0.15, snow: 99999, mountains: 1.2, tints: ['#e9f0ec', '#c9d8cf', '#a9bfb2'], particles: 'snow', noTufts: true, walls: ['#7a4a32', '#8b5a3c', '#6b3f2a', '#9a6a4a'], roofs: ['#ffffff', '#f2f5f7', '#e8eef2', '#ffffff'] },
  lavender: { sky: ['#4a8fd8', '#f3ecdc'], grass: ['#8a9a4c', '#a1a35a', '#7f8f44'], fields: ['#8a6cc8', '#e3c35a', '#9aa04a', '#7a5bb8', null, '#d9b45a', '#a7b45a', null], hillAmp: 10, hillScale: 600, valley: 0.02, trees: 0.25, conifer: 0.75, houses: 0.1, rocks: 0.03, snow: 9999, mountains: 0.35, tints: ['#8a9a5a', '#7f8f4f'], tintKinds: ['leafy'], walls: ['#e8c98f', '#dcb676', '#f0d8a8', '#e2bf86'], roofs: ['#c4623a', '#b5562c', '#d07040', '#a84a28'], particles: 'pollen' },
  sakura: { sky: ['#78a8e0', '#fbe9f0'], grass: ['#7fb85a', '#93c467', '#a9cf7a'], hillAmp: 26, hillScale: 400, valley: 0.06, trees: 0.7, conifer: 0.12, houses: 0.08, rocks: 0.1, snow: 9999, mountains: 0.9, tints: ['#ffb7d5', '#ffc9e0', '#f7a1c4', '#fff0f6'], tintKinds: ['leafy'], walls: ['#f6f2ea', '#efe6d6', '#f8f6f0', '#e9e1d0'], roofs: ['#3a3f4a', '#2f3440', '#8b2a2a', '#44403c'], particles: 'petals', landmark: 'fuji' },
  savanna: { sky: ['#3d8ad6', '#f6e6c4'], grass: ['#c9b25a', '#d8c070', '#b89e4a'], hillAmp: 16, hillScale: 650, valley: 0.03, trees: 0.22, conifer: 0, houses: 0.01, rocks: 0.2, snow: 9999, mountains: 0.6, flatTrees: true, tints: ['#7a8a3a', '#6f7f34', '#8a9a48'], tintKinds: ['leafy'], safari: true, dry: true },
  // Verrückte Welten
  clouds: { sky: ['#4aa8ff', '#e8f6ff'], grass: ['#ffffff', '#f2f7ff', '#e6eefc'], rock: '#dfe8f5', hillAmp: 26, hillScale: 300, valley: 0.04, trees: 0.45, conifer: 0, houses: 0, rocks: 0.2, snow: 99999, mountains: 0.4, tints: ['#ffffff', '#f4f8ff', '#ffe6f4', '#e6f0ff'], noTufts: true, particles: 'pollen', fields: ['#fff1f8', '#eef6ff', null, '#f6fff0'] },
  lava: { sky: ['#2a1410', '#c2502a'], grass: ['#2b2422', '#3a2f2b', '#1f1a19'], rock: '#3c3532', fields: ['#ff5a1a', null, null, '#ff8a2a', null, null, null], hillAmp: 48, hillScale: 260, valley: 0.1, trees: 0.12, conifer: 0, palm: 0.7, houses: 0, rocks: 1.2, snow: 99999, mountains: 1.6, landmark: 'volcano', dry: true, noTufts: true },
  mushroom: { sky: ['#5b3f8f', '#f3c6e8'], grass: ['#3f6b3a', '#56803f', '#7a6bb0'], hillAmp: 22, hillScale: 340, valley: 0.05, trees: 0.35, conifer: 0, houses: 0.02, rocks: 0.15, snow: 99999, mountains: 0.7, mushrooms: true, tints: ['#8fd16a', '#c08fe0', '#6ac0d1'], tintKinds: ['leafy'], particles: 'pollen' },
  // Fantasiewelten
  space: { sky: ['#000000', '#07040f'], grass: ['#2c2346', '#3b2f5e', '#221a36'], hillAmp: 20, hillScale: 240, valley: 0.04, trees: 0, conifer: 0, houses: 0, rocks: 1.1, snow: 99999, mountains: 1.1, moon: true, planet: 'ring', crystals: true, gravity: 3.71, dry: true },
  deepsea: { sky: ['#010b14', '#063a52'], grass: ['#5d6b66', '#6f7867', '#8a8466'], hillAmp: 34, hillScale: 300, valley: 0.12, trees: 0.75, conifer: 0.55, houses: 0, rocks: 0.9, snow: 99999, mountains: 1.6, underwater: true, fish: true, dry: true, tints: ['#3f9a52', '#2f7a44', '#c0412f', '#e0703a', '#d65a9a', '#5a8a3a'] },
  dino: { sky: ['#d9774a', '#f8d9a4'], grass: ['#4f7f2f', '#5f8f36', '#7a9a3e'], hillAmp: 42, hillScale: 420, valley: 0.08, trees: 0.85, conifer: 0.15, palm: 0.6, houses: 0, rocks: 0.3, snow: 99999, mountains: 1.3, landmark: 'volcano', dinos: true },
  candy: { sky: ['#ff8fd0', '#ffe8f6'], grass: ['#ff6fbf', '#4fe0b0', '#ffcf3a'], hillAmp: 18, hillScale: 360, valley: 0.03, trees: 0.6, conifer: 0.2, houses: 0.06, rocks: 0, snow: 99999, mountains: 0.5, candy: true, tints: ['#ff5aa8', '#ffd23f', '#6fe0ff', '#9a7bff', '#5affb0', '#ff8a3d'], walls: ['#b8743e', '#c98a4e', '#a5652f', '#d29a5c'], roofs: ['#ffffff', '#ffe6f2', '#fff7d6', '#e8fbff'] },
  plains: { sky: ['#4790db', '#e4f1f8'], grass: ['#7ea94c', '#a8b85a', '#c9b864'], hillAmp: 6, hillScale: 700, valley: 0.01, trees: 0.25, conifer: 0.1, houses: 0.12, rocks: 0.01, snow: 9999, mountains: 0.2 },
};

/* ---------- Eingebaute Strecken ---------- */
function polarLoop({ len, lobes, seed, ele, lat0, lon0 }) {
  const N = 6000, P = [];
  const R = th => 1 + lobes.reduce((s, [k, a, ph]) => s + a * Math.sin(k * th + ph), 0);
  for (let i = 0; i <= N; i++) { const th = i / N * TAU; const r = R(th); P.push([Math.cos(th) * r, Math.sin(th) * r, th]); }
  let L = 0; for (let i = 1; i <= N; i++) L += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
  const sc = len / L;
  return resampleXY(P.map(p => [p[0] * sc, p[1] * sc, ele(p[2])]), lat0, lon0, { center: [-P[0][0] * sc, -P[0][1] * sc], rAt: th => R(th) * sc });
}
function pathOpen({ len, heading, ele, lat0, lon0 }) {
  const P = []; let x = 0, z = 0;
  for (let d = 0; d <= len; d += 2) { const h = heading(d); P.push([x, z, ele(d)]); x += Math.sin(h) * 2; z -= Math.cos(h) * 2; }
  return resampleXY(P, lat0, lon0, null);
}
function resampleXY(P, lat0, lon0, shape) {
  const pts = []; let acc = 0, next = 0;
  for (let i = 0; i < P.length; i++) {
    if (i) acc += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
    if (acc >= next || i === P.length - 1) {
      const [x, z, e] = P[i];
      pts.push([lat0 + (-z) / M_DEG, lon0 + x / (M_DEG * Math.cos(lat0 / R2D)), +e.toFixed(2)]);
      next += 10;
    }
  }
  return { pts, shape };
}
const S = (k, a, ph) => [k, a, ph];
const BUILTIN_DEF = [
  { id: 'b-hills', name: 'Hügelland-Runde', theme: 'meadow', desc: 'Welliger Rundkurs durch Wiesen, Wälder und Dörfer.', make: () => polarLoop({ len: 24000, lobes: [S(2, .18, .5), S(3, .12, 1.3), S(5, .05, 2)], lat0: 49.55, lon0: 11.0, ele: th => 330 + 38 * Math.sin(th * 3 + .4) + 16 * Math.sin(th * 7 + 1.2) + 5 * Math.sin(th * 15 + .3) + 2 * Math.sin(th * 23) }), loop: true, climbNames: ['Kirchberg', 'Hohe Leite', 'Lindenbuck', 'Steinacker'] },
  { id: 'b-lake', name: 'Seenrunde', theme: 'lake', desc: 'Flache Runde um einen Bergsee, ideal für Intervalle.', make: () => polarLoop({ len: 16000, lobes: [S(2, .22, 0), S(3, .08, 2.1), S(4, .04, .7)], lat0: 47.7, lon0: 11.75, ele: th => 780 + 3 * Math.sin(th * 2) + 1.5 * Math.sin(th * 9 + 1) }), loop: true, climbNames: [] },
  { id: 'b-pass', name: 'Passo Bianco', theme: 'alpine', desc: '13 km Bergauffahrt mit Kehren bis über die Baumgrenze.', make: () => pathOpen({ len: 13000, heading: d => 0.3 + 1.5 * Math.sin(d / 230) + 0.25 * Math.sin(d / 71), ele: d => 920 + d * 0.074 + 9 * Math.sin(d / 400) + 4 * Math.sin(d / 130) + (d > 12400 ? -(d - 12400) * 0.05 : 0), lat0: 46.55, lon0: 11.85 }), loop: false, climbNames: ['Passo Bianco'] },
  { id: 'b-coast', name: 'Küstenstraße', theme: 'coast', desc: '28 km entlang des Meeres, leicht wellig.', make: () => pathOpen({ len: 28000, heading: d => 1.2 + 0.35 * Math.sin(d / 1700) + 0.18 * Math.sin(d / 430 + 1), ele: d => 40 + 22 * Math.sin(d / 2100) + 12 * Math.sin(d / 760 + .5) + 5 * Math.sin(d / 230) + 18 * Math.max(0, Math.sin(d / 5200 - 1)), lat0: 43.6, lon0: 7.2 }), loop: false, climbNames: ['Capo Rosso', 'Punta Verde', 'Belvedere'] },
  { id: 'b-forest', name: 'Herbstwald-Runde', theme: 'autumn', desc: 'Kurze, knackige Runde im dichten Mischwald.', make: () => polarLoop({ len: 9000, lobes: [S(2, .2, 1), S(3, .15, 0), S(6, .05, 1)], lat0: 50.1, lon0: 10.4, ele: th => 450 + 14 * Math.sin(th * 2 + 1) + 9 * Math.sin(th * 5) + 4 * Math.sin(th * 11 + 2) }), loop: true, climbNames: ['Buchenrampe', 'Fuchsbau'] },
  { id: 'b-tour', name: 'Königsetappe', theme: 'alpine', desc: '55 km mit Talfahrt und zwei harten Anstiegen.', make: () => pathOpen({ len: 55000, heading: d => 0.8 * Math.sin(d / 3100) + 0.5 * Math.sin(d / 900 + .3) + (d > 18000 && d < 25000 ? 1.2 * Math.sin((d - 18000) / 200) : 0) + (d > 42000 && d < 47000 ? 1.3 * Math.sin((d - 42000) / 170) : 0), ele: d => { let e = 600 + 8 * Math.sin(d / 1300) + 4 * Math.sin(d / 400); if (d > 18000) e += Math.min(d - 18000, 7000) * 0.062; if (d > 25000) e -= Math.min(d - 25000, 9000) * 0.042; if (d > 42000) e += Math.min(d - 42000, 5000) * 0.078; if (d > 47000) e -= Math.min(d - 47000, 8000) * 0.04; return e; }, lat0: 46.9, lon0: 10.8 }), loop: false, climbNames: ['Colle di Fieno', 'Muro Finale'] },
  { id: 'b-glacier', name: 'Alpen: Gletscherstraße', theme: 'alpine', desc: '24 km in Kehren bis auf 2750 m, oben Schnee und Fels.', make: () => pathOpen({ len: 24000, heading: d => 0.6 + 0.4 * Math.sin(d / 2300) + (d > 9000 ? 1.6 * Math.sin((d - 9000) / 210) : 0.2 * Math.sin(d / 500)), ele: d => 1280 + 25 * Math.sin(d / 900) + Math.min(d, 2000) * 0.01 + Math.max(0, d - 2000) * 0.065 - Math.max(0, d - 23300) * 0.08 + 6 * Math.sin(d / 170), lat0: 46.53, lon0: 10.45 }), loop: false, climbNames: ['Gletscherstraße'] },
  { id: 'b-alps3', name: 'Alpen: Drei-Pässe-Runde', theme: 'alpine', desc: '62 km Rundfahrt über drei Pässe, dazwischen schnelle Abfahrten durch Täler.', make: () => polarLoop({ len: 62000, lobes: [S(2, .2, .3), S(3, .14, 1.1), S(7, .04, .5)], lat0: 46.6, lon0: 8.5, ele: th => 1200 + 520 * Math.max(0, Math.sin(th * 3 + .4)) ** 1.6 + 40 * Math.sin(th * 11) + 15 * Math.sin(th * 29) }), loop: true, climbNames: ['Furkelpass', 'Grimselhöhe', 'Sustenjoch'] },
  { id: 'b-rio', name: 'Rio: Strände und Felsen', theme: 'tropical', desc: '21 km an Palmenstränden entlang, ein steiler Hügel mit Blick auf den Felsdom im Meer.', make: () => pathOpen({ len: 21000, heading: d => 0.9 + 0.45 * Math.sin(d / 1500) + 0.2 * Math.sin(d / 380 + 2), ele: d => 8 + 3 * Math.sin(d / 600) + 95 * Math.exp(-(((d - 11500) / 1300) ** 2)) + 20 * Math.exp(-(((d - 4000) / 600) ** 2)), lat0: -22.95, lon0: -43.2 }), loop: false, climbNames: ['Morro Vista', 'Mirante'] },
  { id: 'b-himalaya', name: 'Himalaya: Pass der Gebetsfahnen', theme: 'himalaya', desc: '30 km von 3800 m auf über 5100 m, dünne Luft, Gebetsfahnen und Gletscherriesen.', make: () => pathOpen({ len: 30000, heading: d => 0.2 + 0.5 * Math.sin(d / 2600) + (d > 14000 && d < 26000 ? 1.3 * Math.sin((d - 14000) / 260) : 0.15 * Math.sin(d / 700)), ele: d => 3800 + 12 * Math.sin(d / 800) + Math.min(d, 27500) * 0.048 - Math.max(0, d - 28200) * 0.06 + 8 * Math.sin(d / 230), lat0: 27.9, lon0: 86.8 }), loop: false, climbNames: ['La Dzong', 'Gebetsfahnen-Pass'] },
  { id: 'b-desert', name: 'Canyon-Wüste', theme: 'desert', desc: '35 km wellig durch rote Tafelberge, Kakteen und Felsen.', make: () => polarLoop({ len: 35000, lobes: [S(2, .28, .9), S(3, .1, 0), S(5, .05, 2.2)], lat0: 36.9, lon0: -111.5, ele: th => 1300 + 30 * Math.sin(th * 4 + .2) + 14 * Math.sin(th * 9) + 6 * Math.sin(th * 21 + 1) }), loop: true, climbNames: ['Red Mesa'] },
  { id: 'b-fjord', name: 'Fjordrunde', theme: 'fjord', desc: '26 km am Wasser entlang zwischen steilen Bergflanken und Nadelwald.', make: () => pathOpen({ len: 26000, heading: d => 1.8 + 0.5 * Math.sin(d / 2000) + 0.25 * Math.sin(d / 520 + 1), ele: d => 15 + 10 * Math.sin(d / 1100) + 120 * Math.exp(-(((d - 16000) / 2200) ** 2)) + 4 * Math.sin(d / 240), lat0: 61.1, lon0: 7.1 }), loop: false, climbNames: ['Fjellkante'] },
  { id: 'b-tuscany', name: 'Toskana-Hügel', theme: 'tuscany', desc: '32 km Runde über sanfte Hügel mit Zypressen und Dörfern.', make: () => polarLoop({ len: 32000, lobes: [S(2, .16, 1.4), S(3, .14, .2), S(6, .05, 1)], lat0: 43.3, lon0: 11.3, ele: th => 280 + 60 * Math.sin(th * 4 + 1) + 22 * Math.sin(th * 9 + .4) + 7 * Math.sin(th * 19) }), loop: true, climbNames: ['Poggio Alto', 'Colle Verde', 'San Ciro', 'Montepino'] },
  { id: 'b-gravel', name: 'Gravel: Schotter im Hochwald', theme: 'forest', surface: 'gravel', width: 2.1, desc: '18 km Schotterweg durch hohen Nadelwald, wellig und schattig.', make: () => polarLoop({ len: 18000, lobes: [S(2, .2, .4), S(3, .12, 1.7), S(7, .04, .2)], lat0: 48.2, lon0: 8.2, ele: th => 720 + 34 * Math.sin(th * 3 + .2) + 14 * Math.sin(th * 8 + 1) + 5 * Math.sin(th * 17) }), loop: true, climbNames: ['Holzfällerstich', 'Hirschbuckel'] },
  { id: 'b-feldweg', name: 'Feldweg mit Kuhweide', theme: 'farm', surface: 'dirt', width: 1.5, desc: '14 km flacher Feldweg zwischen Weiden. Die Kühe schauen zu.', make: () => polarLoop({ len: 14000, lobes: [S(2, .3, 1), S(5, .05, .3)], lat0: 47.8, lon0: 10.3, ele: th => 640 + 4 * Math.sin(th * 3) + 2 * Math.sin(th * 9) }), loop: true, climbNames: [] },
  { id: 'b-trail', name: 'MTB: Wurzel-Singletrail', theme: 'forest', surface: 'trail', width: 0.85, desc: '9 km schmaler Pfad mit kurzen, giftigen Rampen und Abfahrten.', make: () => pathOpen({ len: 9000, heading: d => 0.4 + 0.9 * Math.sin(d / 160) + 0.35 * Math.sin(d / 47), ele: d => 540 + 28 * Math.sin(d / 420) + 15 * Math.sin(d / 130 + 1) + 6 * Math.sin(d / 37) + d * 0.012, lat0: 50.3, lon0: 7.9 }), loop: false, climbNames: ['Wurzelwand', 'Fuchsbau-Rampe', 'Krähenkopf'] },
  { id: 'b-grat', name: 'Gipfelgrat', theme: 'ridge', surface: 'dirt', width: 1.1, desc: '6 km auf dem Grat in 2900 m Höhe, links und rechts geht es steil hinab. Nichts für schwache Nerven.', make: () => pathOpen({ len: 6000, heading: d => 0.9 + 0.25 * Math.sin(d / 600) + 0.1 * Math.sin(d / 90), ele: d => 2880 + 45 * Math.sin(d / 700) + 18 * Math.sin(d / 180 + 2) + 6 * Math.sin(d / 55), lat0: 46.4, lon0: 9.9 }), loop: false, climbNames: ['Gratturm'] },
  { id: 'b-mond', name: 'Mond: Krater-Runde', theme: 'moon', surface: 'moon', width: 2.6, desc: '12 km durch Staub und Krater bei einem Sechstel der Schwerkraft. Bergauf fühlt sich an wie fliegen.', make: () => polarLoop({ len: 12000, lobes: [S(2, .15, .8), S(4, .1, 2), S(9, .03, .4)], lat0: 0.67, lon0: 23.47, ele: th => 100 + 40 * Math.sin(th * 3 + 1) + 18 * Math.sin(th * 7) + 8 * Math.sin(th * 13 + 2) }), loop: true, climbNames: ['Kraterrand', 'Tranquility-Hügel'] },
  { id: 'b-weltall', name: 'Weltall: Ringplanet-Orbit', theme: 'space', surface: 'cosmic', width: 3, desc: '16 km auf einem Asteroiden mit Ringplanet am Himmel, leuchtenden Kristallen und Mars-Schwerkraft (38 %).', make: () => polarLoop({ len: 16000, lobes: [S(2, .2, .3), S(3, .12, 1.7), S(7, .04, .2)], lat0: -1.2, lon0: -40.5, ele: th => 300 + 60 * Math.sin(th * 2 + .4) + 30 * Math.sin(th * 5 + 1) + 12 * Math.sin(th * 11) }), loop: true, climbNames: ['Kristallkamm', 'Orbit-Rampe', 'Kometenhügel'] },
  { id: 'b-marianen', name: 'Marianengraben: Tiefsee-Runde', theme: 'deepsea', surface: 'sand', width: 3, desc: '18 km am tiefsten Punkt der Erde, fast 11 km unter dem Meer: Tangwälder, Korallen, Fischschwärme und leuchtende Quallen.', make: () => polarLoop({ len: 18000, lobes: [S(2, .22, 1.1), S(4, .08, .3), S(6, .04, 2)], lat0: 11.35, lon0: 142.2, ele: th => -10920 + 45 * Math.sin(th * 2) + 25 * Math.sin(th * 5 + 2) + 10 * Math.sin(th * 9 + 1) }), loop: true, climbNames: ['Challenger-Tiefe', 'Riffkante'] },
  { id: 'b-dino', name: 'Urzeit-Tal: Dinosaurier-Runde', theme: 'dino', surface: 'dirt', width: 2.6, desc: '15 km durch den Dschungel der Kreidezeit: Langhälse, ein T-Rex am Wegesrand, Flugsaurier und ein rauchender Vulkan.', make: () => polarLoop({ len: 15000, lobes: [S(2, .18, 2.2), S(3, .14, .5), S(8, .03, 1)], lat0: 4.6, lon0: 9.4, ele: th => 220 + 55 * Math.sin(th * 3 + .2) + 22 * Math.sin(th * 6 + 1.5) }), loop: true, climbNames: ['Vulkanflanke', 'Farnhügel', 'Raptor-Rampe'] },
  { id: 'b-candy', name: 'Zuckerland-Runde', theme: 'candy', surface: 'candy', width: 3, desc: '10 km durch rosa Hügel mit Lollibäumen, Zuckerstangen und Lebkuchenhäusern. Garantiert kalorienfrei.', make: () => polarLoop({ len: 10000, lobes: [S(2, .25, .5), S(5, .06, 1), S(3, .08, 2)], lat0: 47.1, lon0: 9.5, ele: th => 400 + 35 * Math.sin(th * 2 + 1) + 15 * Math.sin(th * 7) }), loop: true, climbNames: ['Zuckerwatteberg', 'Gummibärchen-Pass'] },
  { id: 'b-winter', name: 'Winterwald im Schnee', theme: 'winter', desc: '16 km durch verschneite Nadelwälder und an Holzhütten vorbei, leise rieselt der Schnee.', make: () => polarLoop({ len: 16000, lobes: [S(2, .2, .6), S(3, .12, 2.1), S(6, .04, .4)], lat0: 46.9, lon0: 11.3, ele: th => 1250 + 70 * Math.sin(th * 2 + .8) + 30 * Math.sin(th * 5 + 1.2) }), loop: true, climbNames: ['Hüttenstich', 'Schneekamm'] },
  { id: 'b-sakura', name: 'Kirschblüten-Runde', theme: 'sakura', desc: '13 km unter blühenden Kirschbäumen, durch Dörfer mit dunklen Dächern und mit Blick auf einen Vulkankegel.', make: () => polarLoop({ len: 13000, lobes: [S(2, .18, 1.6), S(4, .1, .3), S(7, .03, 2)], lat0: 35.36, lon0: 138.73, ele: th => 320 + 45 * Math.sin(th * 3 + .5) + 15 * Math.sin(th * 8) }), loop: true, climbNames: ['Tempelstufe', 'Blütenhang'] },
  { id: 'b-savanne', name: 'Savanne: Safari-Runde', theme: 'savanna', surface: 'dirt', width: 2.8, desc: '22 km über rote Pisten durch goldenes Gras und Schirmakazien, vorbei an Giraffen und Elefanten.', make: () => polarLoop({ len: 22000, lobes: [S(2, .24, .2), S(3, .1, 1.4), S(5, .05, .7)], lat0: -2.33, lon0: 34.83, ele: th => 1500 + 25 * Math.sin(th * 2 + 1) + 12 * Math.sin(th * 6 + .4) }), loop: true, climbNames: ['Kopje-Anstieg'] },
  { id: 'b-wolken', name: 'Wolkenstraße mit Regenbogen', theme: 'clouds', surface: 'rainbow', width: 3.2, desc: '14 km auf einer Regenbogen-Fahrbahn über einem Meer aus Wolken. Fahr nicht zu weit an den Rand!', make: () => polarLoop({ len: 14000, lobes: [S(2, .22, .9), S(3, .1, 2.6), S(5, .05, .3)], lat0: 47.5, lon0: 10.9, ele: th => 2200 + 50 * Math.sin(th * 2 + .3) + 25 * Math.sin(th * 5 + 1) }), loop: true, climbNames: ['Kumulus-Kamm', 'Schäfchenhügel'] },
  { id: 'b-lava', name: 'Lava-Insel', theme: 'lava', surface: 'dirt', width: 2.8, desc: '16 km über schwarzen Basalt zwischen glühenden Lavafeldern, immer mit Blick auf den rauchenden Vulkan.', make: () => polarLoop({ len: 16000, lobes: [S(2, .2, 1.2), S(4, .1, .4), S(7, .04, 2.2)], lat0: 19.4, lon0: -155.3, ele: th => 180 + 80 * Math.sin(th * 2 + 1) + 30 * Math.sin(th * 6) }), loop: true, climbNames: ['Kraterauffahrt', 'Ascheberg'] },
  { id: 'b-pilze', name: 'Riesenpilz-Wald', theme: 'mushroom', surface: 'trail', width: 1.6, desc: '9 km auf weichem Waldboden zwischen haushohen Fliegenpilzen in Abendlicht. Ein bisschen wie im Märchen.', make: () => polarLoop({ len: 9000, lobes: [S(2, .2, 2), S(3, .12, .7), S(6, .05, 1.5)], lat0: 50.9, lon0: 10.6, ele: th => 420 + 30 * Math.sin(th * 3 + .4) + 12 * Math.sin(th * 8) }), loop: true, climbNames: ['Hutkrempe', 'Sporenstich'] },
  { id: 'b-flat', name: 'Provence-Achter (flach)', theme: 'lavender', desc: 'Topfebene Runde durch Felder für ERG-Workouts.', make: () => polarLoop({ len: 20000, lobes: [S(2, .35, .3), S(4, .06, 1)], lat0: 52.3, lon0: 9.7, ele: th => 60 + 1.2 * Math.sin(th * 3) }), loop: true, climbNames: [] },
];
// Ortschaften [Beginn m, Länge m, Name] und Tunnel [von m, bis m]
const EXTRAS = {
  'b-hills': { towns: [[2500, 650, 'Kirchdorf'], [11000, 800, 'Lindenau'], [18500, 550, 'Steinach']] },
  'b-lake': { towns: [[4000, 700, 'Seehausen'], [12000, 500, 'Uferweiler']] },
  'b-pass': { towns: [[250, 500, 'Fondovalle']], tunnels: [[6200, 6650]] },
  'b-coast': { towns: [[2500, 900, 'Marina Chiara'], [15500, 700, 'San Vento'], [25500, 800, 'Capo Lume']], tunnels: [[9500, 9900], [20000, 20380]] },
  'b-forest': { towns: [[6000, 300, 'Forsthaus']] },
  'b-tour': { towns: [[2000, 1000, 'Talstadt'], [30000, 1200, 'Mittelberg'], [52800, 900, 'Gipfeldorf']], tunnels: [[27000, 27550], [38000, 38420]] },
  'b-glacier': { towns: [[400, 600, 'Bormino']], tunnels: [[5200, 5550]] },
  'b-alps3': { towns: [[1500, 800, 'Andermatt-Dorf'], [22000, 700, 'Innertal'], [43000, 800, 'Wassen']], tunnels: [[30000, 30500]] },
  'b-rio': { towns: [[1200, 1500, 'Praia Clara'], [16000, 1200, 'Leme']], tunnels: [[8200, 8600]] },
  'b-himalaya': { towns: [[1500, 700, 'Namche'], [12000, 500, 'Tengbo']] },
  'b-desert': { towns: [[9000, 500, 'Dusty Springs']] },
  'b-fjord': { towns: [[2000, 900, 'Flåm-by'], [20500, 700, 'Nesvik']], tunnels: [[7000, 7900], [12500, 13100]] },
  'b-tuscany': { towns: [[3000, 800, 'Montalba'], [13500, 700, 'Pienzia'], [24000, 900, 'Castel Lupo']] },
  'b-feldweg': { towns: [[6000, 300, 'Hof Sonnleiten']] },
  'b-mond': { tunnels: [[7400, 7800]] },
  'b-flat': { towns: [[5000, 900, 'Feldheim'], [14000, 700, 'Kornau']] },
};
// Reihenfolge in der Auswahl: bunt gemischt (Klassiker, Fantasie, Jahreszeiten, Berge, Gelände), nicht alle Alpen am Stück
const ORDER = ['b-hills', 'b-candy', 'b-coast', 'b-dino', 'b-pass', 'b-wolken', 'b-winter', 'b-lake', 'b-marianen', 'b-flat', 'b-rio', 'b-pilze', 'b-forest', 'b-sakura', 'b-savanne', 'b-mond', 'b-tuscany', 'b-lava', 'b-desert', 'b-weltall', 'b-glacier', 'b-fjord', 'b-himalaya', 'b-gravel', 'b-tour', 'b-feldweg', 'b-alps3', 'b-trail', 'b-grat'];
BUILTIN_DEF.sort((a, b) => (ORDER.indexOf(a.id) + 1 || 999) - (ORDER.indexOf(b.id) + 1 || 999));
export const BUILTIN = BUILTIN_DEF.map(r => ({ id: r.id, name: r.name, theme: r.theme, desc: r.desc, loop: r.loop, builtin: true, climbNames: r.climbNames, surface: r.surface, width: r.width, _make: r.make, ...EXTRAS[r.id] }));

let cache = new Map();
// Aufbereitete Strecken freigeben (nach der Fahrt)
export function clearRouteCache() { cache.clear(); }
export async function listRoutes() {
  const own = (await db.all('routes')).sort((a, b) => (b.created || '').localeCompare(a.created || ''));
  return [...BUILTIN, ...own];
}
export async function getRaw(id) {
  const b = BUILTIN.find(r => r.id === id);
  if (b) { if (!b.pts) { const m = b._make(); b.pts = m.pts; b.shape = m.shape; } return b; }
  return db.get('routes', id);
}
export async function getRoute(id) {
  if (cache.has(id)) return cache.get(id);
  const raw = await getRaw(id) || await getRaw('b-hills');
  // Gelände fehlt (z. B. nach Wiederherstellung aus Sicherung oder NAS): erneut laden
  if (raw.realTerrain && !raw.dem) { try { await loadDem(raw); await db.put('routes', raw); } catch (e) { console.warn('Gelände nicht geladen', e); } }
  const r = prepare(raw);
  cache.set(id, r);
  return r;
}
export function quickStats(raw) {
  if (raw.stats) return raw.stats;
  if (!raw.pts) { const m = raw._make(); raw.pts = m.pts; raw.shape = m.shape; }
  let d = 0, asc = 0;
  for (let i = 1; i < raw.pts.length; i++) {
    d += hav(raw.pts[i - 1], raw.pts[i]);
    const de = raw.pts[i][2] - raw.pts[i - 1][2]; if (de > 0) asc += de;
  }
  raw.stats = { dist: d, asc };
  return raw.stats;
}
function hav(a, b) { const r = 6371000, dl = (b[0] - a[0]) / R2D, dn = (b[1] - a[1]) / R2D, x = Math.sin(dl / 2) ** 2 + Math.cos(a[0] / R2D) * Math.cos(b[0] / R2D) * Math.sin(dn / 2) ** 2; return 2 * r * Math.asin(Math.sqrt(x)); }

/* ---------- GPX ---------- */
export function parseGpx(text, fname) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('Datei ist kein gültiges GPX');
  let nodes = [...doc.getElementsByTagName('trkpt')];
  if (!nodes.length) nodes = [...doc.getElementsByTagName('rtept')];
  if (nodes.length < 2) throw new Error('Keine Trackpunkte gefunden');
  const raw = nodes.map(n => [+n.getAttribute('lat'), +n.getAttribute('lon'), parseFloat(n.getElementsByTagName('ele')[0]?.textContent)]);
  const hasEle = raw.some(p => !isNaN(p[2]));
  const pts = []; let last = null, acc = 0;
  for (const p of raw) {
    if (isNaN(p[2])) p[2] = 0;
    if (!last) { pts.push(p); last = p; continue; }
    acc += hav(last, p); last = p;
    if (acc >= 8) { pts.push(p); acc = 0; }
  }
  if (pts.length < 3) throw new Error('Strecke ist zu kurz');
  const nm = (doc.getElementsByTagName('name')[0]?.textContent || fname || 'Eigene Strecke').trim().slice(0, 60);
  const loop = hav(pts[0], pts[pts.length - 1]) < 150;
  const r = { id: 'g-' + Date.now().toString(36), name: nm, theme: 'auto', loop, builtin: false, created: new Date().toISOString(), pts: pts.map(p => [+p[0].toFixed(6), +p[1].toFixed(6), +p[2].toFixed(1)]), noEle: !hasEle };
  r.stats = quickStats(r);
  if (r.stats.dist < 500) throw new Error('Strecke ist kürzer als 500 m');
  return r;
}
/* ---------- Echtes Gelände: Höhenmodell aus freien Terrain-Kacheln (AWS Open Data, Terrarium-Format) ---------- */
const TILE_URL = (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
const lon2x = (lon, z) => (lon + 180) / 360 * 2 ** z;
const lat2y = (lat, z) => { const r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 2 ** z; };
async function tileData(z, x, y) {
  const res = await fetch(TILE_URL(z, x, y), { mode: 'cors' });
  if (!res.ok) throw new Error('Höhendaten nicht erreichbar (HTTP ' + res.status + ')');
  const bmp = await createImageBitmap(await res.blob());
  const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(bmp, 0, 0);
  return g.getImageData(0, 0, c.width, c.height).data;
}
// Lädt das Gelände rund um die Strecke (Rand 2,5 km) und speichert es als Raster in der Strecke
export async function loadDem(raw, onProgress = () => { }) {
  const P = raw.pts, lat0 = P[0][0], lon0 = P[0][1], kx = M_DEG * Math.cos(lat0 / R2D), M = 2500;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of P) { const x = (p[1] - lon0) * kx, z = -(p[0] - lat0) * M_DEG; x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  x0 -= M; x1 += M; z0 -= M; z1 += M;
  const latN = lat0 - z0 / M_DEG, latS = lat0 - z1 / M_DEG, lonW = lon0 + x0 / kx, lonE = lon0 + x1 / kx;
  // Zoomstufe: so fein wie möglich, höchstens 80 Kacheln
  let z = 13, tx0, tx1, ty0, ty1;
  for (; z >= 9; z--) { tx0 = Math.floor(lon2x(lonW, z)); tx1 = Math.floor(lon2x(lonE, z)); ty0 = Math.floor(lat2y(latN, z)); ty1 = Math.floor(lat2y(latS, z)); if ((tx1 - tx0 + 1) * (ty1 - ty0 + 1) <= 80) break; }
  const tiles = new Map(), list = [];
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) list.push([tx, ty]);
  let done = 0;
  // 6 Kacheln gleichzeitig laden
  const queue = [...list]; const worker = async () => { while (queue.length) { const [tx, ty] = queue.shift(); tiles.set(tx + ',' + ty, await tileData(z, tx, ty)); onProgress(++done / list.length); } };
  await Promise.all(Array.from({ length: 6 }, worker));
  const ele = (lat, lon) => {
    const fx = lon2x(lon, z), fy = lat2y(lat, z), tx = Math.floor(fx), ty = Math.floor(fy), d = tiles.get(tx + ',' + ty); if (!d) return 0;
    const px = Math.min(255, Math.floor((fx - tx) * 256)), py = Math.min(255, Math.floor((fy - ty) * 256)), o = (py * 256 + px) * 4;
    return d[o] * 256 + d[o + 1] + d[o + 2] / 256 - 32768;
  };
  // Raster in lokalen Metern, Zellgröße nach Fläche (höchstens ~1,4 Mio. Punkte)
  const cell = Math.max(15, Math.ceil(Math.sqrt((x1 - x0) * (z1 - z0) / 1.4e6))), nx = Math.ceil((x1 - x0) / cell) + 1, nz = Math.ceil((z1 - z0) / cell) + 1;
  const scale = .25, data = new Int16Array(nx * nz); let min = Infinity, max = -Infinity;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = x0 + i * cell, zz = z0 + j * cell, e = ele(lat0 - zz / M_DEG, lon0 + x / kx);
    data[j * nx + i] = Math.round(Math.max(-500, Math.min(8000, e)) / scale); min = Math.min(min, e); max = Math.max(max, e);
  }
  raw.dem = { x0, z0, cell, nx, nz, scale, data, min, max, zoom: z, src: 'AWS Terrain Tiles' }; raw.realTerrain = true;
  // GPX ohne Höhen: Straßenhöhe aus dem Gelände übernehmen
  if (raw.noEle) { for (const p of P) p[2] = +ele(p[0], p[1]).toFixed(1); raw.noEle = false; raw.stats = null; quickStats(raw); }
  return raw;
}

export async function saveRoute(r) { await db.put('routes', r); cache.delete(r.id); }
export async function deleteRoute(id) { await tomb('deletedRoutes', id); await db.del('routes', id); cache.delete(id); }

/* ---------- Aufbereitung ---------- */
export function prepare(raw) {
  const P = raw.pts, lat0 = P[0][0], lon0 = P[0][1], kx = M_DEG * Math.cos(lat0 / R2D);
  // lokale Koordinaten (x Ost, z Süd), dann auf 5 m neu abtasten
  const L = P.map(p => [(p[1] - lon0) * kx, -(p[0] - lat0) * M_DEG, p[2]]);
  if (raw.loop) L.push([...L[0]]);
  const cum = [0]; for (let i = 1; i < L.length; i++) cum.push(cum[i - 1] + Math.hypot(L[i][0] - L[i - 1][0], L[i][1] - L[i - 1][1]));
  const total0 = cum[cum.length - 1], STEP = 5, N = Math.max(4, Math.floor(total0 / STEP));
  let x = new Float64Array(N + 1), z = new Float64Array(N + 1), e = new Float64Array(N + 1);
  let j = 0;
  for (let i = 0; i <= N; i++) {
    const d = i * total0 / N;
    while (j < L.length - 2 && cum[j + 1] < d) j++;
    const t = cum[j + 1] > cum[j] ? clamp((d - cum[j]) / (cum[j + 1] - cum[j]), 0, 1) : 0;
    x[i] = lerp(L[j][0], L[j + 1][0], t); z[i] = lerp(L[j][1], L[j + 1][1], t); e[i] = lerp(L[j][2], L[j + 1][2], t);
  }
  const wrap = i => raw.loop ? ((i % N) + N) % N : clamp(i, 0, N);
  const smoothArr = (a, w) => { const o = new Float64Array(a.length); for (let i = 0; i <= N; i++) { let s = 0, c = 0; for (let k = -w; k <= w; k++) { const q = wrap(i + k); s += a[q]; c++; } o[i] = s / c; } return o; };
  if (!raw.builtin) { x = smoothArr(x, 3); z = smoothArr(z, 3); e = smoothArr(e, 8); }
  else e = smoothArr(e, 2);
  if (raw.loop) { x[N] = x[0]; z[N] = z[0]; e[N] = e[0]; }
  const step = total0 / N, total = total0;
  // Kurs, Steigung
  const head = new Float64Array(N + 1), grade = new Float64Array(N + 1);
  for (let i = 0; i <= N; i++) {
    const a = wrap(i - 2), b = wrap(i + 2);
    head[i] = Math.atan2(x[b] - x[a], -(z[b] - z[a]));
    const ga = wrap(i - 5), gb = wrap(i + 5);
    const span = raw.loop ? 10 * step : (Math.min(N, i + 5) - Math.max(0, i - 5)) * step;
    grade[i] = span > 0 ? clamp((e[gb] - e[ga]) / span * 100, -25, 25) : 0;
  }
  let asc = 0, minE = Infinity, maxE = -Infinity;
  for (let i = 0; i <= N; i++) { if (i && e[i] > e[i - 1]) asc += e[i] - e[i - 1]; minE = Math.min(minE, e[i]); maxE = Math.max(maxE, e[i]); }
  const lat = i => lat0 - z[i] / M_DEG, lon = i => lon0 + x[i] / kx;

  // Themenwahl für GPX: Höhe entscheidet
  let themeKey = raw.theme;
  if (themeKey === 'auto') themeKey = maxE > 1300 ? 'alpine' : (maxE - minE > 250 ? 'meadow' : (asc / total * 1000 < 5 ? 'plains' : 'forest'));
  const theme = THEMES[themeKey] || THEMES.meadow;
  // Echtes Höhenmodell (nur importierte Strecken, wenn geladen)
  const dem = raw.dem && raw.dem.data ? raw.dem : null;
  const demAt = dem ? (px, pz) => {
    const gx = (px - dem.x0) / dem.cell, gz = (pz - dem.z0) / dem.cell, w = dem.nx, D = dem.data;
    const i = clamp(Math.floor(gx), 0, w - 2), j = clamp(Math.floor(gz), 0, dem.nz - 2), fx = clamp(gx - i, 0, 1), fz = clamp(gz - j, 0, 1);
    return lerp(lerp(D[j * w + i], D[j * w + i + 1], fx), lerp(D[(j + 1) * w + i], D[(j + 1) * w + i + 1], fx), fz) * dem.scale;
  } : null;
  const water = dem ? (dem.min <= .5 ? 0 : null) : theme.lake ? minE - 2.5 : theme.coast ? (theme.waterGap != null ? minE - theme.waterGap : Math.min(0, minE - 25)) : null;

  // Räumlicher Index: grob (25 m) und fein (5 m)
  const CELL = 100, grid = new Map(), FAR = 600, far = new Map();
  const key = (a, b) => a * 73856093 ^ b * 19349663;
  for (let i = 0; i <= N; i += 5) {
    const k = key(Math.floor(x[i] / CELL), Math.floor(z[i] / CELL));
    if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i);
  }
  for (let i = 0; i <= N; i += 20) {
    const k = key(Math.floor(x[i] / FAR), Math.floor(z[i] / FAR));
    if (!far.has(k)) far.set(k, []); far.get(k).push(i);
  }
  let meanE = 0; for (let i = 0; i <= N; i++) meanE += e[i]; meanE /= N + 1;

  function nearest(px, pz) {
    const cx = Math.floor(px / CELL), cz = Math.floor(pz / CELL);
    let best = -1, bd = Infinity;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const l = grid.get(key(cx + a, cz + b)); if (!l) continue;
      for (const i of l) { const dd = (x[i] - px) ** 2 + (z[i] - pz) ** 2; if (dd < bd) { bd = dd; best = i; } }
    }
    if (best < 0) return null;
    // fein: Segmentprojektion in der Umgebung
    let res = null, rd = Infinity;
    for (let k = best - 6; k < best + 6; k++) {
      const a = raw.loop ? wrap(k) : clamp(k, 0, N - 1), b = raw.loop ? wrap(a + 1) : a + 1;
      if (b > N) continue;
      const ux = x[b] - x[a], uz = z[b] - z[a], l2 = ux * ux + uz * uz || 1;
      const t = clamp(((px - x[a]) * ux + (pz - z[a]) * uz) / l2, 0, 1);
      const qx = x[a] + ux * t, qz = z[a] + uz * t, dd = (px - qx) ** 2 + (pz - qz) ** 2;
      if (dd < rd) { rd = dd; res = { i: a, t, dist: Math.sqrt(dd), ele: lerp(e[a], e[b], t), side: Math.sign(ux * (pz - z[a]) - uz * (px - x[a])) }; }
    }
    return res;
  }
  function farBase(px, pz) {
    const cx = Math.floor(px / FAR), cz = Math.floor(pz / FAR);
    let bd = Infinity, be = meanE, bi = -1;
    for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) {
      const l = far.get(key(cx + a, cz + b)); if (!l) continue;
      for (const i of l) { const dd = (x[i] - px) ** 2 + (z[i] - pz) ** 2; if (dd < bd) { bd = dd; be = e[i]; bi = i; } }
    }
    let side = 0;
    if (bi >= 0) { const j = Math.min(N, bi + 1), i0 = j === bi ? bi - 1 : bi; const ux = x[j] - x[i0], uz = z[j] - z[i0]; side = Math.sign(ux * (pz - z[i0]) - uz * (px - x[i0])); }
    return { ele: be, dist: bi >= 0 ? Math.sqrt(bd) : 5000, side };
  }
  const shape = raw.shape;
  // Orte und Tunnel (GPX: Orte automatisch, keine Tunnel)
  let towns = (raw.towns || []).map(([at, len, name]) => ({ from: at, to: Math.min(total - 50, at + len), name }));
  if (!raw.builtin && !raw.towns && total > 8000 && !raw.osm?.b?.length) towns = [[.3, 'Ortschaft'], [.7, 'Weiler']].map(([f, name]) => ({ from: total * f, to: total * f + 600, name }));
  const tunnels = (raw.tunnels || []).map(([from, to]) => ({ from, to })).filter(t => t.to < total - 60);
  const townAt = d => towns.find(t => d >= t.from && d <= t.to) || null;
  const tunnelAt = (d, pad = 0) => tunnels.find(t => d >= t.from - pad && d <= t.to + pad) || null;
  const cover = d => { let c = 0; for (const t of tunnels) c = Math.max(c, smooth(t.from - 30, t.from + 15, d) * (1 - smooth(t.to - 15, t.to + 30, d))); return c; };
  const RW = raw.width || 3.3;
  function heightAt(px, pz) {
    const n = nearest(px, pz);
    let h, hills = 0, d = 999, side = 0;
    if (demAt) {
      // Echtes Gelände: Höhenmodell, nahe der Straße auf deren GPX-Höhe angeglichen
      h = demAt(px, pz);
      if (n && n.dist < 400) h += (n.ele - demAt(x[n.i], z[n.i])) * smooth(400, 30, n.dist);
      hills = 4 * fbm(px / 60, pz / 60, 2, 9); h += hills * smooth(20, 120, n ? n.dist : 999);
    } else {
    let base;
    if (n && n.dist < 260) { base = n.ele; d = n.dist; side = n.side; }
    else { const f = farBase(px, pz); base = f.ele; d = Math.max(260, f.dist); side = f.side; }
    const sc = theme.hillScale;
    hills = theme.hillAmp * (fbm(px / sc, pz / sc, 4, 3) + 0.25 * fbm(px / 90, pz / 90, 2, 9));
    h = base + hills * smooth(14, 150, d) + Math.min(d, 900) * theme.valley * (0.6 + 0.4 * fbm(px / 800, pz / 800, 2, 5));
    if (theme.mountains) h += theme.mountains * 180 * smooth(500, 2200, d) * (0.55 + 0.45 * fbm(px / 1500, pz / 1500, 3, 11));
    }
    if (water != null && !demAt) {
      if (theme.coast && side === theme.coast) h = lerp(h, water - 14, smooth(22, 150, d));
      if (theme.lake && shape) {
        const ang = Math.atan2(pz - shape.center[1], px - shape.center[0]);
        const th = ang < 0 ? ang + TAU : ang;
        const r = Math.hypot(px - shape.center[0], pz - shape.center[1]), R = shape.rAt(th);
        if (r < R) h = lerp(h, water - 10, smooth(R - 25, R - 140, r));
      }
    }
    const cv = n && tunnels.length && n.dist < 90 ? cover(n.i * step) * smooth(90, 50, n.dist) : 0;
    if (n && n.dist < 40) h = lerp(lerp(n.ele - 0.7, h, smooth(RW + 1.3, RW * 7 + 9, n.dist)), h, cv);
    // Tunnel: Bergrücken über der Straße
    if (cv > 0) h = lerp(h, Math.max(h, n.ele + 13 + n.dist * .55 + hills * .5), cv);
    // Orte: Gelände flacher
    if (n && n.dist < 70 && towns.length) { const tw = townAt(n.i * step); if (tw) h = lerp(n.ele - .5, h, smooth(20, 70, n.dist)); }
    return h;
  }

  // Anstiege erkennen
  const climbs = [];
  {
    let low = 0, hi = 0, inC = false;
    for (let i = 1; i <= N; i++) {
      if (!inC) { if (e[i] < e[low]) low = i; if (e[i] - e[low] > 12) { inC = true; hi = i; } }
      else {
        if (e[i] > e[hi]) hi = i;
        if (e[hi] - e[i] > 10 || i === N) {
          const g200 = (a, dir) => { const b = clamp(a + dir * Math.round(200 / step), 0, N); return (e[Math.max(a, b)] - e[Math.min(a, b)]) / (Math.abs(b - a) * step || 1); };
          while (low < hi - 40 && g200(low, 1) < 0.02) low += 10;
          while (hi > low + 40 && g200(hi, -1) < 0.02) hi -= 10;
          const len = (hi - low) * step, gain = e[hi] - e[low];
          if (gain >= 25 && len >= 500 && gain / len >= 0.03) climbs.push({ from: low * step, to: hi * step, len, gain, avg: gain / len * 100 });
          inC = false; low = i;
        }
      }
    }
    climbs.forEach((c, k) => { c.name = raw.climbNames?.[k] || 'Anstieg ' + (k + 1); c.id = k; let mx = 0; for (let i = Math.floor(c.from / step); i < c.to / step; i += 4) mx = Math.max(mx, grade[i]); c.max = mx; });
  }

  // Sprintwertungen: 300 m in Ortschaften
  const sprints = towns.filter(t => t.to - t.from >= 400).map((t, k) => ({ id: k, name: 'Sprint ' + t.name, from: t.from + 60, to: t.from + 360, len: 300 }));

  const idxAt = d => { const u = d / step; return [Math.floor(u), u - Math.floor(u)]; };
  function sample(arr, d) {
    if (raw.loop) d = ((d % total) + total) % total; else d = clamp(d, 0, total);
    const [i, t] = idxAt(d); const a = clamp(i, 0, N), b = clamp(i + 1, 0, N);
    return lerp(arr[a], arr[b], t);
  }
  function headAt(d) {
    if (raw.loop) d = ((d % total) + total) % total; else d = clamp(d, 0, total);
    const [i, t] = idxAt(d); const a = clamp(i, 0, N), b = clamp(i + 1, 0, N);
    let h1 = head[a], h2 = head[b]; let dh = h2 - h1; while (dh > Math.PI) dh -= TAU; while (dh < -Math.PI) dh += TAU;
    return h1 + dh * t;
  }
  return {
    id: raw.id, name: raw.name, desc: raw.desc, builtin: raw.builtin, loop: raw.loop, themeKey, theme, water, surface: raw.surface || (theme.moon ? 'moon' : 'asphalt'), roadW: raw.width || 3.3,
    N, step, total, x, z, e, head, grade, asc, minE, maxE, climbs, lat, lon, towns, tunnels, sprints, townAt, tunnelAt,
    eleAt: d => sample(e, d), gradeAt: d => sample(grade, d), xAt: d => sample(x, d), zAt: d => sample(z, d), headAt,
    latAt: d => lat0 - sample(z, d) / M_DEG, lonAt: d => lon0 + sample(x, d) / kx,
    heightAt, nearest, realTerrain: !!dem, dem, demAt,
    osm: raw.osm?.b?.length ? raw.osm : null, geo: { lat0, lon0, kx }, // echte Gebäude (OpenStreetMap) und Umrechnung Grad → Meter
  };
}
