// Saison-Belohnungspfad (vierteljährlich) und Werkstatt für Rad-Upgrades.
// Saison-XP = alle XP aus Fahrten innerhalb der Saison. 25 Stufen à 200 XP. Belohnungen bleiben für immer.
// Werkstatt: jede 3. Stufe gibt einen Teile-Gutschein 🔧. Teile wirken leicht auf die Physik (nur deine Fahrt, nicht im Multiplayer).
import { progress, saveProgress } from './state.js';
export const TIER_XP = 200, TIERS = 25;
const SEASON_META = [
  { n: 'Wintersaison', e: '❄️', cols: [['#9fd8ff', 'Eisblau'], ['#e9f5ff', 'Schnee'], ['#4a6fb5', 'Polarnacht'], ['#7fe0d0', 'Gletscher']] },
  { n: 'Frühlingssaison', e: '🌸', cols: [['#ff9ec7', 'Kirschblüte'], ['#b6e36a', 'Maigrün'], ['#ffd85e', 'Löwenzahn'], ['#a98bff', 'Flieder']] },
  { n: 'Sommersaison', e: '☀️', cols: [['#ffb02e', 'Sonnenglut'], ['#22c3d6', 'Lagune'], ['#ff5d5d', 'Wassermelone'], ['#f4e3b5', 'Sandstrand']] },
  { n: 'Herbstsaison', e: '🍂', cols: [['#d9722b', 'Kürbis'], ['#9b2f2f', 'Weinlaub'], ['#c9a227', 'Goldlaub'], ['#5e4632', 'Kastanie']] },
];
export function seasonOf(d = new Date()) {
  const y = d.getFullYear(), q = Math.floor(d.getMonth() / 3), m = SEASON_META[q];
  return { id: `${y}-Q${q + 1}`, y, q, name: `${m.n} ${y}`, emoji: m.e, start: new Date(y, q * 3, 1), end: new Date(y, q * 3 + 3, 1), cols: m.cols };
}
// Belohnungen je Stufe (gleiches Schema jede Saison, Farben je Saison eigen)
export function rewardsOf(s = seasonOf()) {
  const r = [];
  for (let t = 1; t <= TIERS; t++) {
    if (t === TIERS) r.push({ t, kind: 'trophy', label: `🏆 Saison-Pokal + Gold-Lack`, key: 'trophy:' + s.id });
    else if (t % 3 === 0) r.push({ t, kind: 'token', label: '🔧 Teile-Gutschein' });
    else if ([1, 5, 10, 16].includes(t)) { const c = s.cols[[1, 5, 10, 16].indexOf(t)]; r.push({ t, kind: 'color', label: `🎨 Farbe „${c[1]}“`, key: 'col:' + c[0], c: c[0], cname: c[1] }); }
    else if ([8, 14, 20, 23].includes(t)) r.push({ t, kind: 'title', label: `🏷️ Titel „${['Saisonstarter', 'Kilometerfresser', 'Bergziege', 'Saisonheld'][[8, 14, 20, 23].indexOf(t)]}“`, key: 'title:' + ['Saisonstarter', 'Kilometerfresser', 'Bergziege', 'Saisonheld'][[8, 14, 20, 23].indexOf(t)] });
    else r.push({ t, kind: 'xp', label: '⭐ +50 XP', xp: 50 });
  }
  return r;
}
export const seasonState = (s = seasonOf()) => { const st = (progress.season ||= {})[s.id] ||= { xp: 0, tier: 0 }; return st; };
export const tierOf = xp => Math.min(TIERS, Math.floor(xp / TIER_XP));
// Nach jeder Fahrt: Saison-XP gutschreiben und neue Stufen vergeben. Gibt die neu erreichten Belohnungen zurück.
export function seasonAdd(xp, when = new Date()) {
  const s = seasonOf(when), st = seasonState(s), got = [];
  st.xp += Math.max(0, xp | 0);
  const now = tierOf(st.xp), rw = rewardsOf(s);
  for (let t = st.tier + 1; t <= now; t++) {
    const r = rw[t - 1]; got.push(r);
    if (r.kind === 'token') progress.tokens = (progress.tokens || 0) + 1;
    if (r.key) (progress.unlocks ||= {})[r.key] = s.id;
    if (r.kind === 'trophy') (progress.unlocks ||= {})['col:#d4af37'] = s.id;
    if (r.kind === 'xp') { progress.xp += r.xp; st.xp += 0; }
  }
  st.tier = Math.max(st.tier, now);
  return got;
}
// Freigeschaltete Saison-Farben (für Avatar-Designer)
export const seasonColors = () => Object.keys(progress.unlocks || {}).filter(k => k.startsWith('col:')).map(k => k.slice(4));
export const seasonTitles = () => Object.keys(progress.unlocks || {}).filter(k => k.startsWith('title:')).map(k => k.slice(6));
export const trophies = () => Object.entries(progress.unlocks || {}).filter(([k]) => k.startsWith('trophy:')).map(([k]) => k.slice(7));

/* ---------- Werkstatt ---------- */
// Stufe 0 = Serienteil. Kosten der nächsten Stufe = Stufennummer (1, 2, 3 Gutscheine).
export const PARTS = {
  wheels: { n: 'Laufräder', i: '🛞', lv: [['Standard', {}], ['Alu-Aero 30 mm', { cda: .99, kg: -.2 }], ['Carbon 50 mm', { cda: .98, kg: -.35 }], ['Carbon-Scheibe 80 mm', { cda: .965, kg: -.3 }]] },
  frame: { n: 'Rahmen', i: '🚲', lv: [['Alu', {}], ['Carbon', { kg: -.6 }], ['Leichtbau-Carbon', { kg: -1.0 }], ['Aero-Carbon', { kg: -.8, cda: .985 }]] },
  tires: { n: 'Reifen', i: '⚫', lv: [['Trainingsreifen', {}], ['Rennreifen', { crr: .94 }], ['Latexschläuche', { crr: .9 }], ['Tubeless-Zeitfahrreifen', { crr: .86 }]] },
  kit: { n: 'Bekleidung', i: '👕', lv: [['Normales Trikot', {}], ['Enges Renntrikot', { cda: .985 }], ['Aero-Einteiler', { cda: .97 }], ['Aero-Einteiler + Überschuhe', { cda: .96 }]] },
};
export const partLv = k => progress.parts?.[k] || 0;
export const tokensFree = () => (progress.tokens || 0) - Object.values(progress.parts || {}).reduce((a, l) => a + l * (l + 1) / 2, 0);
export function buyPart(k) {
  const l = partLv(k), P = PARTS[k]; if (!P || l >= P.lv.length - 1) return false;
  if (tokensFree() < l + 1) return false;
  (progress.parts ||= {})[k] = l + 1; saveProgress(); return true;
}
export function resetParts() { progress.parts = {}; saveProgress(); }
// Gesamtwirkung der gewählten Teile (aktiv nur, wenn profile.upgradesOn !== false und kein Multiplayer)
export function upgradeEffect(parts = progress.parts || {}) {
  const e = { cda: 1, crr: 1, kg: 0 };
  for (const [k, P] of Object.entries(PARTS)) { const x = P.lv[parts[k] || 0][1]; e.cda *= x.cda || 1; e.crr *= x.crr || 1; e.kg += x.kg || 0; }
  return e;
}
