// Fahrt auswerten und dauerhaft speichern, Fortschritt fortschreiben
import { db, kv } from './db.js';
import { profile, progress, saveProgress, saveProfile, levelOf } from './state.js';
import { summarize, intervals, xpFor, BADGES, totals, bestCurve, bestAvg } from './analysis.js';
import { total as woTotal } from './workouts.js';
import { markDone } from './plans.js';
import { missionState, weekKey, streakBonus } from './game.js';

export async function saveRide(S) {
  const id = 'r-' + Date.now().toString(36);
  const start = new Date(S.startWall).toISOString();
  const sum = summarize(S.samples, profile);
  const rides = await db.all('rides');
  const before = bestCurve(rides);
  const prs = Object.keys(sum.curve).filter(k => !before[k] || sum.curve[k] > before[k].w).map(Number);
  const woLen = S.wo ? woTotal(S.wo) : 0;
  const workoutDone = !!(S.wo && S.wT >= woLen - 2);
  // Tests auswerten
  let test = null;
  if (S.wo?.test === 'ramp') { const p60 = bestAvg(S.samples.map(s => s.p), 60); if (p60) test = { type: 'Rampentest', ftp: Math.round(p60 * .75), basis: `beste Minute ${Math.round(p60)} W × 0,75` }; }
  if (S.wo?.test === 'ftp20') { const p = bestAvg(S.samples.map(s => s.p), 1200); if (p) test = { type: '20-Minuten-Test', ftp: Math.round(p * .95), basis: `20 Minuten ${Math.round(p)} W × 0,95` }; }
  if (!test) { const P = S.samples.map(s => s.p), b20 = bestAvg(P, 1200), b8 = bestAvg(P, 480); const est = Math.round(Math.max(b20 ? b20 * .95 : 0, b8 ? b8 * .9 : 0)); if (est > profile.ftp * 1.02) test = { type: 'Erkannt aus dieser Fahrt', ftp: est, basis: b20 && b20 * .95 >= (b8 || 0) * .9 ? `beste 20 Minuten ${Math.round(b20)} W × 0,95` : `beste 8 Minuten ${Math.round(b8)} W × 0,9`, auto: true }; }
  const climbPrs = S.climbLog.filter(c => c.pr).length;
  const sprintPrs = (S.sprintLog || []).filter(c => c.pr).length;
  const lvBefore = levelOf(progress.xp).lv;
  // Bestzeiten
  for (const c of S.climbLog) { const k = S.route.id + ':' + c.id; if (c.pr) progress.climbBest[k] = { time: c.time, date: start, rideId: id }; }
  progress.sprintBest = progress.sprintBest || {};
  for (const c of S.sprintLog || []) { const k = S.route.id + ':' + c.id; if (c.pr) progress.sprintBest[k] = { time: c.time, date: start, rideId: id }; }
  let routePr = null;
  if (!S.route.loop && S.finished && !S.beamed) { const k = S.route.id, b = progress.routeBest[k]; routePr = { time: S.t, best: b?.time ?? null, pr: !b || S.t < b.time }; if (routePr.pr) progress.routeBest[k] = { time: S.t, date: start, rideId: id }; }

  // Trainingsplan: Einheit gilt ab 90 % der Dauer als erledigt
  let planInfo = null;
  if (S.wo?.planId && S.wT >= woLen * .9) planInfo = markDone(S.wo.id, { rideId: id });

  const ride = {
    id, date: start, start, title: S.route.name + (S.wo ? ' · ' + S.wo.name : ''), routeId: S.route.id, routeName: S.route.name, loop: S.route.loop,
    workoutId: S.wo?.id || null, workoutName: S.wo?.name || null, workout: S.wo ? { name: S.wo.name, segs: S.wo.segs } : null, workoutDone,
    planId: S.wo?.planId || null, planWeek: S.wo?.week || null,
    mode: S.mode, sum, samples: S.samples, climbs: S.climbLog, sprints: S.sprintLog || [], intervals: intervals(S.samples, S.wo), prs, laps: S.lap, test, routePr,
    overtakes: S.overtakes || 0, rideOns: { got: S.rideOnsGot || 0, given: S.rideOnsGiven || 0 }, beamed: !!S.beamed, env: S.env || null, ftpUsed: profile.ftp, shots: S.shots.length, newBadges: [], missionsDone: [],
  };

  // XP: Basis + Serienbonus + Plan + Missionen
  const tAll = totals([...rides, ride]);
  let xp = xpFor(sum, { workoutDone, climbs: S.climbLog.length, prs: prs.length + climbPrs + sprintPrs });
  xp += (S.overtakes || 0) + (S.sprintLog?.length || 0) * 20 + (S.gates || 0) * 5 + (S.rideOnsGot || 0) * 2 + (S.rideOnsGiven || 0);
  const bonus = streakBonus(tAll.streak);
  const xpParts = [['Fahrt', xp]];
  if (bonus) { const b = Math.round(xp * bonus); xp += b; xpParts.push([`Serie ${tAll.streak} Tage (+${Math.round(bonus * 100)} %)`, b]); }
  if (planInfo?.first) { xp += 75; xpParts.push(['Plan-Einheit', 75]); }
  if (planInfo?.finished) { xp += 500; xpParts.push(['Plan abgeschlossen', 500]); }
  const wk = weekKey(); progress.missions = progress.missions || {}; const got = progress.missions[wk] = progress.missions[wk] || {};
  const ms = missionState([...rides, ride]);
  for (const m of ms) if (m.done && !got[m.id]) { got[m.id] = true; xp += m.xp; xpParts.push(['Mission: ' + m.text, m.xp]); ride.missionsDone.push(m.text); }
  for (const k of Object.keys(progress.missions).sort().slice(0, -12)) delete progress.missions[k];
  progress.xp += xp;
  Object.assign(ride, { xp, xpParts, lvBefore, lvAfter: levelOf(progress.xp).lv, plan: planInfo ? { name: planInfo.plan.name, finished: planInfo.finished } : null });

  const x = { workoutDone, testDone: !!test && !test.auto, planFinished: planInfo?.finished ? planInfo.plan.id : false, overtakes: S.overtakes, sprints: S.sprintLog?.length || 0, allMissions: ms.every(m => m.done), hour: new Date(S.startWall).getHours() };
  for (const b of BADGES) if (!progress.badges[b.id] && b.test(sum, tAll, x)) { progress.badges[b.id] = { date: start, rideId: id }; ride.newBadges.push(b.id); }
  await db.put('rides', ride);
  let k = 0;
  for (const s of S.shots) await db.put('shots', { id: id + '-' + (k++), rideId: id, blob: s.blob, caption: s.caption, t: s.t, d: s.d });
  await saveProgress();
  return id;
}

export async function deleteRide(id) {
  // Merken, damit die Fahrt auch im Cloud-Speicher und auf anderen Geräten verschwindet
  const gone = await kv.get('deletedRides', []); if (!gone.includes(id)) await kv.set('deletedRides', [...gone, id]);
  await db.del('rides', id); await db.delByIndex('shots', 'ride', id);
}
export async function applyFtp(ftp, source) {
  profile.ftpHistory = [...(profile.ftpHistory || []), { date: new Date().toISOString(), ftp, source }];
  profile.ftp = ftp; saveProfile();
}
