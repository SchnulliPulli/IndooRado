// Trainingsbuddy für freie Fahrten: fährt wie ein etwas stärkerer Trainingspartner.
// Er orientiert sich an deiner Leistung der letzten Minuten und legt ein paar Prozent drauf. Fällst du zurück, wartet er;
// überholst du ihn, kontert er kurz und gibt sich dann geschlagen. Am Berg zieht er etwas mehr an, bergab rollt er.
// Fährst du dicht hinter ihm, hast du Windschatten. Ab und zu sagt er etwas.
import { gapOf } from './npc.js';

const NAMES = ['Max', 'Lena', 'Jonas', 'Mia', 'Paul', 'Sara', 'Tom', 'Nele'];
const SAY = {
  start: n => `🤝 ${n} fährt mit dir. Bleib an seinem Hinterrad!`,
  push: ['Komm, dranbleiben!', 'Noch ein bisschen, du schaffst das!', 'Gleichmäßig treten, gleich wird’s leichter.', 'Schön rund treten!'],
  wait: ['Ich warte kurz auf dich.', 'Kein Stress, ich nehm raus.', 'Komm wieder ran, wir fahren zusammen.'],
  counter: ['Na warte!', 'Oho, nicht so schnell!', 'Das lass ich nicht auf mir sitzen!'],
  beaten: ['Stark! Heute bist du besser.', 'Respekt, du ziehst mich mit.', 'Puh, du bist richtig gut drauf!'],
  climb: ['Berg! Jetzt zählt’s.', 'Hoch geht’s, kleine Gänge!'],
  draft: ['Gut so, nutz meinen Windschatten.', 'Bleib dran, ich mach den Wind.'],
};
const pick = a => a[Math.floor(Math.random() * a.length)];

export function makeBuddy(profile) {
  const ftp = profile.ftp || 200;
  return { d: 4, v: 0, crank: 0, w: ftp * .7, buddy: true, name: NAMES[Math.floor(Math.random() * NAMES.length)], avgL: null, avgS: null, surge: 0, counterUsed: -999, beatenAt: -999, said: 0, mood: 'push' };
}
// Zielleistung des Buddys für diesen Schritt; say(text) zeigt eine Meldung
export function buddyStep(S, p, myPower, ftp, dt, say) {
  const R = S.route, gap = gapOf(R, p.d, S.dist), grade = R.gradeAt(p.d), t = S.t;
  // gleitende Mittel deiner Leistung (lang ~ 3 min, kurz ~ 20 s)
  // Anfangs schnell einpendeln, danach ruhiger (wie ein Partner, der dein Tempo erst kennenlernt)
  p.avgL = p.avgL == null ? ftp * .7 : p.avgL + (myPower - p.avgL) * Math.min(1, dt / (t < 120 ? 25 : 150));
  p.avgS = p.avgS == null ? ftp * .7 : p.avgS + (myPower - p.avgS) * Math.min(1, dt / 15);
  const base = Math.max(p.avgL, p.avgS * .95);
  let k = 1.045, mood = 'push';                          // immer ein bisschen besser als du
  if (grade > 3) k += .03; else if (grade < -2) k -= .12; // am Berg drücken, bergab rollen
  if (gap > 50) { k *= Math.max(.7, 1 - (gap - 50) / 350); mood = 'wait'; } // zu weit vorn: warten
  if (gap > 220) { k = .7; mood = 'wait'; }
  if (gap < -12) {                                       // überholt: einmal kontern, dann geschlagen geben
    if (!p.surge && t - p.counterUsed > 120 && gap > -60) { p.surge = t + 18; p.counterUsed = t; say(`🤝 ${p.name}: ${pick(SAY.counter)}`); }
    if (p.surge > t) { k = 1.12 * Math.max(1, p.avgS / base); mood = 'counter'; }
    else { k = gap < -80 ? 1.03 : .99; mood = 'beaten'; if (t - p.beatenAt > 240) { p.beatenAt = t; say(`🤝 ${p.name}: ${pick(SAY.beaten)}`); } }
  }
  if (p.surge && p.surge <= t && gap > -12) p.surge = 0;
  // Obergrenze: an der FTP, aber mitwachsend, wenn du deutlich stärker fährst (FTP veraltet)
  const cap = Math.max(ftp * 1.12, p.avgL * 1.15) * (mood === 'counter' ? 1.15 : 1), floor = ftp * .45;
  const w = Math.min(cap, Math.max(floor, base * k));
  p.w += (w - p.w) * Math.min(1, dt / 4);               // sanft, wie ein Mensch
  // Sprüche: höchstens alle 75 s, passend zur Lage
  if (t - p.said > 75) {
    let msg = null;
    if (mood === 'wait' && p.mood !== 'wait') msg = pick(SAY.wait);
    else if (grade > 4 && p.lastGrade <= 4) msg = pick(SAY.climb);
    else if (gap > .5 && gap < 8) msg = pick(SAY.draft);
    else if (gap > 15 && gap < 50) msg = pick(SAY.push);
    if (msg) { p.said = t; say(`🤝 ${p.name}: ${msg}`); }
  }
  p.mood = mood; p.lastGrade = grade;
  return gap;
}
// Windschatten hinter dem Buddy (0..~0,3 wie bei den Mitfahrern)
export const buddyDraft = gap => gap > .5 && gap < 9 ? .3 * (1 - (gap - .5) / 8.5) : 0;
export { SAY as BUDDY_SAY };
