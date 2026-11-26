// Multiplayer-Motivation während der Fahrt mit echten Mitspielern:
// Gruppenbonus (XP fürs Zusammenfahren), Duelle (Aufholjagd, Vorsprung halten, Sprint), Gruppenziel bei Gruppenfahrten,
// echte Ride Ons. Alles wird lokal ausgewertet; Mitspieler bekommen nur kurze Nachrichten (wer fordert wen heraus).
import { gapOf } from './npc.js';
import { sid } from './online/presence.js';
import { esc, fmtT } from './util.js';

const XP = { chase: 30, defend: 25, sprint: 40, lose: 5, together: 3, goal: 100, rideOnGot: 5, rideOnGiven: 2 };
export function mpInit(S) { S.mp = { near: 0, together: 0, met: new Set(), next: 45, ch: null, won: 0, lost: 0, roGot: 0, roGiven: 0, base: new Map(), odo0: null, goalDone: false, xp: 0 }; }
const remotes = S => S.field.filter(n => n.remote && S.live?.peers.has(n.id));
const gap = (S, n) => gapOf(S.route, n.d, S.dist);
function award(S, H, xp, why) { S.mp.xp += xp; H.xpPop(`+${xp} XP ${why}`); }

export function mpTick(S, H, dt) {
  const M = S.mp; if (!M || !S.live) return;
  const rs = remotes(S); for (const n of rs) M.met.add(n.name);
  const riding = S.state === 'riding';
  // Gruppenbonus: je Minute dicht an einem echten Fahrer
  if (riding && rs.some(n => Math.abs(gap(S, n)) < 40)) {
    if (!M.together) H.flash('👥 Ihr fahrt zusammen: jede Minute gibt es Gruppenbonus-XP', 2600);
    M.together += dt; M.near += dt; if (M.near >= 60) { M.near -= 60; award(S, H, XP.together, 'Gruppenbonus'); }
  }
  // Gruppenziel (nur Gruppenfahrt): gemeinsam gefahrene Kilometer
  if (S.group) {
    M.odo0 ??= S.odo; let km = (S.odo - M.odo0) / 1000;
    for (const [id, p] of S.live.peers) { if (!M.base.has(id)) M.base.set(id, p.odo || 0); km += Math.max(0, ((p.odo || 0) - M.base.get(id)) / 1000); }
    M.goal = Math.min(60, 10 * (1 + S.live.peers.size)); M.goalKm = km;
    if (!M.goalDone && km >= M.goal) { M.goalDone = true; H.flash(`🏆 Gruppenziel geschafft: ${M.goal} km gemeinsam!`, 4000); H.sound?.fanfare?.(); award(S, H, XP.goal, 'Gruppenziel'); }
  }
  // Laufendes Duell auswerten
  const c = M.ch;
  if (c) {
    const n = rs.find(x => x.id === c.who);
    if (!n) { M.ch = null; H.flash('Duell abgebrochen: ' + c.name + ' ist nicht mehr auf der Strecke', 2200); return; }
    const g = gap(S, n), left = c.dur - (S.t - c.t0);
    c.gap = g; c.left = left;
    if (c.kind === 'chase' && g <= 0) return end(S, H, true, `🎯 ${c.name} eingeholt!`);
    if (c.kind === 'defend' && g >= 0) return end(S, H, false, `${c.name} hat dich eingeholt`);
    if (c.kind === 'sprint' && S.odo - c.odo0 >= 500) return end(S, H, g < 0, g < 0 ? `⚡ Sprint gegen ${c.name} gewonnen!` : `${c.name} war im Sprint schneller`);
    if (left <= 0) return end(S, H, c.kind === 'defend', c.kind === 'defend' ? `🛡️ Vorsprung gegen ${c.name} gehalten!` : `${c.name} ist entkommen`);
    return;
  }
  // Neues Duell vorschlagen: nur der Fahrer mit der kleineren Sitzungs-ID fängt an (sonst starten beide gleichzeitig)
  if (!riding || !rs.length || S.t < M.next) return;
  const n = rs.reduce((a, b) => Math.abs(gap(S, a)) < Math.abs(gap(S, b)) ? a : b), g = gap(S, n);
  if (sid > n.id) { M.next = S.t + 20; return; }
  let kind = null;
  if (Math.abs(g) < 25) kind = 'sprint'; else if (g > 25 && g < 450) kind = 'chase'; else if (g < -25 && g > -200) kind = 'defend';
  if (!kind) { M.next = S.t + 30; return; }
  start(S, H, kind, n.id, n.name, Math.random().toString(36).slice(2, 8));
  // Gegenseite bekommt die passende Rolle: wer gejagt wird, verteidigt und umgekehrt
  S.live.emit('ch', n.id, { kind: { chase: 'defend', defend: 'chase', sprint: 'sprint' }[kind], id: M.ch.id });
}
function start(S, H, kind, who, name, id) {
  const M = S.mp;
  M.ch = { kind, who, name, id, t0: S.t, dur: kind === 'sprint' ? 120 : 180, odo0: S.odo, gap: 0, left: 0 };
  H.flash({ chase: `🎯 Duell: Hole ${name} in 3 Minuten ein! (+${XP.chase} XP)`, defend: `🔥 ${name} jagt dich! Halte 3 Minuten den Vorsprung (+${XP.defend} XP)`, sprint: `⚡ Sprint-Duell mit ${name}: Wer ist nach 500 m vorn? (+${XP.sprint} XP)` }[kind], 3500);
  H.sound?.pass?.();
}
function end(S, H, won, msg) {
  const M = S.mp, c = M.ch; M.ch = null; M.next = S.t + 150 + Math.random() * 90;
  if (won) { M.won++; H.flash(msg + ` +${XP[c.kind]} XP`, 3000); award(S, H, XP[c.kind], 'Duell'); H.sound?.fanfare?.(); }
  else { M.lost++; H.flash(msg + ` · Starker Kampf, +${XP.lose} XP`, 3000); award(S, H, XP.lose, 'Duell'); }
}
// Nachrichten anderer Mitspieler
export function mpOnMsg(S, H, m) {
  const M = S.mp; if (!M) return;
  if (m.t === 'rideon') { M.roGot++; S.rideOnsGot = (S.rideOnsGot || 0) + 1; H.flash('👍 Echter Ride On von ' + m.name + '!', 2600); H.say?.('Ride On von ' + m.name, 'mp'); award(S, H, XP.rideOnGot, 'Ride On'); H.sound?.pass?.(); return; }
  // Herausforderung: die Gegenseite schickt direkt meine Rolle (jagen, verteidigen oder Sprint)
  if (m.t === 'ch' && !M.ch && m.kind && S.field.some(n => n.remote && n.id === m.from)) start(S, H, m.kind, m.from, m.name, m.id);
}
// Ride On an einen echten Mitspieler senden
export function mpRideOn(S, H, n) { S.live?.emit('rideon', n.id); S.mp.roGiven++; H.flash('👍 Ride On an ' + n.name + ' gesendet', 1600); award(S, H, XP.rideOnGiven, 'Ride On'); }

// Anzeige: laufendes Duell, Gruppenziel, gemeinsame Zeit
export function mpHtml(S) {
  const M = S.mp; if (!M || (!M.ch && !S.group && !M.together)) return '';
  let h = '';
  if (M.ch) {
    const c = M.ch, t = c.kind === 'sprint' ? `noch ${Math.max(0, Math.round(500 - (S.odo - c.odo0)))} m` : fmtT(Math.max(0, c.left)), g = Math.round(Math.abs(c.gap));
    const what = { chase: `🎯 Hole ${esc(c.name)} ein`, defend: `🛡️ Halte ${esc(c.name)} hinter dir`, sprint: `⚡ Sprint gegen ${esc(c.name)}` }[c.kind];
    const pos = c.gap > 0 ? `${g} m vor dir` : c.gap < 0 ? `${g} m hinter dir` : 'gleichauf';
    h += `<div class="mprow"><b>${what}</b><span>${pos} · ${t}</span></div>`;
  }
  if (S.group && M.goal) { const f = Math.min(1, M.goalKm / M.goal); h += `<div class="mprow"><b>🏆 Gruppenziel ${M.goal} km</b><span>${M.goalKm.toFixed(1).replace('.', ',')} km${M.goalDone ? ' ✓' : ''}</span></div><div class="mpbar"><i style="width:${(f * 100).toFixed(1)}%"></i></div>`; }
  if (M.together >= 5) h += `<div class="mprow small"><span>👥 zusammen ${fmtT(M.together)}</span><span>${M.won ? '🏅 ' + M.won + ' Duell' + (M.won > 1 ? 'e' : '') : ''}${M.roGot ? ' · 👍 ' + M.roGot : ''}</span></div>`;
  return h;
}
