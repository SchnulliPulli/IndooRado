// Fahrt auswerten und dauerhaft speichern, Fortschritt fortschreiben
import { db } from './db.js';
import { profile, progress, saveProgress, saveProfile, levelOf } from './state.js';
import { summarize, intervals, xpFor, BADGES, totals, bestCurve, bestAvg } from './analysis.js';
import { total as woTotal } from './workouts.js';

export async function saveRide(S) {
  const id = 'r-' + Date.now().toString(36);
  const start = new Date(S.startWall).toISOString();
  const sum = summarize(S.samples, profile);
  const rides = await db.all('rides');
  const before = bestCurve(rides);
  const prs = Object.keys(sum.curve).filter(k => !before[k] || sum.curve[k] > before[k].w).map(Number);
  const workoutDone = !!(S.wo && S.wT >= woTotal(S.wo) - 2);
  // Tests auswerten
  let test = null;
  if (S.wo?.test === 'ramp') { const p60 = bestAvg(S.samples.map(s => s.p), 60); if (p60) test = { type: 'Rampentest', ftp: Math.round(p60 * .75), basis: `beste Minute ${Math.round(p60)} W × 0,75` }; }
  if (S.wo?.test === 'ftp20') { const p = bestAvg(S.samples.map(s => s.p), 1200); if (p) test = { type: '20-Minuten-Test', ftp: Math.round(p * .95), basis: `20 Minuten ${Math.round(p)} W × 0,95` }; }
  const climbPrs = S.climbLog.filter(c => c.pr).length;
  const xp = xpFor(sum, { workoutDone, climbs: S.climbLog.length, prs: prs.length + climbPrs });
  const lvBefore = levelOf(progress.xp).lv;
  // Bestzeiten
  for (const c of S.climbLog) { const k = S.route.id + ':' + c.id; if (c.pr) progress.climbBest[k] = { time: c.time, date: start, rideId: id }; }
  let routePr = null;
  if (!S.route.loop && S.finished) { const k = S.route.id, b = progress.routeBest[k]; routePr = { time: S.t, best: b?.time ?? null, pr: !b || S.t < b.time }; if (routePr.pr) progress.routeBest[k] = { time: S.t, date: start, rideId: id }; }
  progress.xp += xp;
  const ride = {
    id, date: start, start, title: S.route.name + (S.wo ? ' · ' + S.wo.name : ''), routeId: S.route.id, routeName: S.route.name, loop: S.route.loop,
    workoutId: S.wo?.id || null, workoutName: S.wo?.name || null, workout: S.wo ? { name: S.wo.name, segs: S.wo.segs } : null,
    mode: S.mode, sum, samples: S.samples, climbs: S.climbLog, intervals: intervals(S.samples, S.wo), prs, xp, laps: S.lap, test, routePr,
    lvBefore, lvAfter: levelOf(progress.xp).lv, ftpUsed: profile.ftp, shots: S.shots.length, newBadges: [],
  };
  const t = totals([...rides, ride]);
  for (const b of BADGES) if (!progress.badges[b.id] && b.test(sum, t, { workoutDone, testDone: !!test })) { progress.badges[b.id] = { date: start, rideId: id }; ride.newBadges.push(b.id); }
  await db.put('rides', ride);
  let k = 0;
  for (const s of S.shots) await db.put('shots', { id: id + '-' + (k++), rideId: id, blob: s.blob, caption: s.caption, t: s.t, d: s.d });
  await saveProgress();
  return id;
}

export async function deleteRide(id) {
  await db.del('rides', id); await db.delByIndex('shots', 'ride', id);
}
export async function applyFtp(ftp, source) {
  profile.ftpHistory = [...(profile.ftpHistory || []), { date: new Date().toISOString(), ftp, source }];
  profile.ftp = ftp; saveProfile();
}
