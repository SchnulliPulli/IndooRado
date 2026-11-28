// Planbauer mit Zieldatum (wie TrainerRoad Plan Builder): rückwärts vom Ziel geplant.
// Phasen: Grundlage → Aufbau → Spitze → Formaufbau (letzte Woche locker). Jede 4. Woche Erholung (ca. 60 % Umfang).
// Wochenstunden werden auf die Einheiten verteilt (eine lange Ausfahrt), Workouts passen sich mit fitToTime der Zeit an.
import { WB, fitToTime } from './workouts.js';
const { ss, ramp, rep, free } = WB;

const warm = (m = 10) => ramp(m * 60, .45, .72, 'Einrollen'), cool = (m = 6) => ramp(m * 60, .6, .4, 'Ausrollen');
const T = {
  endu: () => ({ name: 'Grundlage', desc: 'Ruhig in Zone 2: Fettstoffwechsel und Ausdauer.', segs: [warm(), ss(2400, .66), cool()] }),
  long: () => ({ name: 'Lange Ausfahrt', desc: 'Lang und ruhig, kurze Tempospitzen gegen die Langeweile.', segs: [warm(), ...rep(4, ss(1080, .67), ss(60, .85, 'Kurz anziehen'), ss(120, .6)), cool()] }),
  tempo: () => ({ name: 'Tempo 3×12', desc: 'Zügig im Tempobereich.', segs: [warm(), ...rep(3, ss(720, .82), ss(240, .55)), cool()] }),
  ss: () => ({ name: 'Sweet Spot 3×10', desc: '88–92 % FTP: viel Wirkung, gut erholbar.', segs: [warm(), ...rep(3, ss(600, .9), ss(300, .55)), cool()] }),
  ss2: () => ({ name: 'Sweet Spot 2×20', desc: 'Lange Sweet-Spot-Blöcke für die Schwelle.', segs: [warm(), ...rep(2, ss(1200, .9), ss(300, .55)), cool()] }),
  thr: () => ({ name: 'Schwelle 3×10', desc: 'Knapp an der FTP – Kraft für lange Anstiege.', segs: [warm(), ...rep(3, ss(600, .98), ss(300, .55)), cool()] }),
  ou: () => ({ name: 'Over-Under 3×8', desc: 'Wechsel 95/108 % FTP: Laktat verarbeiten.', segs: [warm(), ...rep(3, ...rep(4, ss(90, .95), ss(30, 1.08)), ss(240, .55)), cool()] }),
  vo2: () => ({ name: 'VO2max 5×3', desc: 'Harte Intervalle für die Spitze.', segs: [warm(), ss(120, .95), ss(180, .55), ...rep(5, ss(180, 1.15), ss(180, .5)), cool()] }),
  s3030: () => ({ name: '30/30', desc: 'Kurz und knackig: Antritte, Tempowechsel.', segs: [warm(), ...rep(2, ...rep(10, ss(30, 1.25), ss(30, .5)), ss(300, .55)), cool()] }),
  sprint: () => ({ name: 'Sprints', desc: 'Volle Antritte mit langer Pause.', segs: [warm(), ...rep(8, free(15, 'Sprint! Alles geben'), ss(225, .5)), cool()] }),
  opener: () => ({ name: 'Formaufbau: Öffner', desc: 'Kurz und locker mit drei Antritten – frisch für den großen Tag.', segs: [warm(), ss(900, .65), ...rep(3, ss(60, 1.05), ss(180, .55)), cool()] }),
  recov: () => ({ name: 'Erholung', desc: 'Ganz locker, die Beine lockern.', segs: [ramp(300, .4, .55), ss(1500, .55), ramp(300, .55, .4)] }),
};
// Schwerpunkt: welche harten Einheiten im Aufbau und in der Spitze
export const FOCUS = {
  allround: { n: 'Allrounder', build: ['ss', 'thr', 'tempo'], peak: ['vo2', 'ou', 'ss2'] },
  climb: { n: 'Berge / Alpenmarathon', build: ['ss2', 'thr', 'tempo'], peak: ['ou', 'thr', 'vo2'] },
  tt: { n: 'Zeitfahren / Triathlon', build: ['ss2', 'tempo', 'thr'], peak: ['thr', 'ou', 'ss2'] },
  race: { n: 'Rennen / Kriterium', build: ['ss', 's3030', 'thr'], peak: ['vo2', 's3030', 'sprint'] },
  fit: { n: 'Fitness / Abnehmen', build: ['tempo', 'ss', 'endu'], peak: ['ss', 'tempo', 's3030'] },
};
export function buildPlan({ goal, date, hours, perWeek, focus }) {
  const F = FOCUS[focus] || FOCUS.allround;
  const weeksTo = Math.round((new Date(date) - Date.now()) / (7 * 864e5));
  const W = Math.max(4, Math.min(24, weeksTo || 8));
  const base = Math.max(1, Math.round((W - 1) * .4)), build = Math.max(1, Math.round((W - 1) * .4)), peak = Math.max(1, W - 1 - base - build);
  const phases = [...Array(base).fill('base'), ...Array(build).fill('build'), ...Array(peak).fill('peak'), 'taper'];
  const wos = [], layout = [];
  phases.forEach((ph, wi) => {
    const recovery = ph !== 'taper' && (wi + 1) % 4 === 0;
    const vol = (recovery ? .6 : 1) * (ph === 'taper' ? .55 : 1) * hours * 3600 * (1 + Math.min(.15, wi * .015)); // leicht steigend
    const n = Math.max(2, Math.min(7, perWeek)), longS = vol * (n >= 3 ? .34 : .5), restS = (vol - longS) / (n - 1);
    const list = [];
    for (let k = 0; k < n; k++) {
      let t;
      if (k === n - 1) t = ph === 'taper' ? T.opener() : recovery ? T.endu() : T.long();
      else if (recovery || ph === 'taper') t = k === 0 && ph !== 'taper' ? T.tempo() : T.recov();
      else if (ph === 'base') t = k % 2 ? T.endu() : (k === 0 ? T.tempo() : T.endu());
      else { const pool = ph === 'build' ? F.build : F.peak; t = k % 2 === 0 ? T[pool[(wi + k) % pool.length]]() : T.endu(); }
      const target = Math.max(1800, Math.min(5 * 3600, Math.round((k === n - 1 ? longS : restS) / 300) * 300));
      const w = fitToTime({ ...t, id: 'tmp' }, target);
      list.push({ name: `${t.name} · ${Math.round(target / 60)} min`, desc: `${{ base: 'Grundlage', build: 'Aufbau', peak: 'Spitze', taper: 'Formaufbau' }[ph]}${recovery ? ' (Erholungswoche)' : ''}: ${t.desc}`, segs: w.segs });
    }
    wos.push(...list); layout.push(list.length);
  });
  const d = new Date(date);
  return { name: `🎯 ${goal || 'Mein Ziel'} (${d.toLocaleDateString(document.documentElement.lang, { day: '2-digit', month: 'short' })})`, perWeek, wos, layout, weeks: W, phases: { base, build, peak }, goalDate: date };
}
