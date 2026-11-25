// Spielmodi: Tagesherausforderung, goldene Glocken sammeln, Zeitfahren mit Zwischenzeiten
import { profile, progress, saveProgress } from './state.js';
import { fmtT, clamp } from './util.js';
import { steadySpeed } from './physics.js';
import { BUILTIN, quickStats } from './routes.js';
import { sound } from './sound.js';

const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);
const seeded = s => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 4294967296; };

/* ---------- Tagesherausforderung: für alle dieselbe Strecke und dasselbe Ziel ---------- */
export function daily(date = new Date()) {
  const r = seeded('daily-' + dayKey(date)), pool = BUILTIN.filter(x => !['b-mond', 'b-grat', 'b-trail'].includes(x.id) || r() < .3);
  const route = pool[Math.floor(r() * pool.length)], km = Math.min([5, 6, 8, 10, 12][Math.floor(r() * 5)], route.loop ? 99 : Math.max(2, Math.floor(quickStats(route).dist / 1000) - 1));
  // Zielzeit: so schnell wie dauerhaft 78 % FTP in der Ebene, abhängig vom eigenen Profil
  const v = steadySpeed(profile.ftp * .78, 1), limit = Math.round(km * 1000 / v / 5) * 5;
  return { key: dayKey(date), routeId: route.id, routeName: route.name, km, limit, text: `${km} km auf „${route.name}“ in unter ${fmtT(limit)}` };
}
export const dailyState = () => (progress.daily ||= {})[dayKey()] || null;
export function dailyStreak() { let n = 0; const d = new Date(); for (;;) { if (progress.daily?.[dayKey(d)]?.ok) { n++; d.setDate(d.getDate() - 1); } else break; } return n; }
export function dailyTick(S, flash) {
  const c = S.daily; if (!c || c.done || S.odo < c.km * 1000) return;
  c.done = true; const ok = S.t <= c.limit, prev = dailyState();
  progress.daily[c.key] = { ok: ok || !!prev?.ok, time: Math.min(S.t, prev?.time ?? Infinity), at: new Date().toISOString() }; saveProgress();
  if (ok && !prev?.ok) { S.bonusXp = (S.bonusXp || 0) + 150; sound.fanfare(); }
  flash(ok ? `🗓️ Tagesherausforderung geschafft: ${fmtT(S.t)} (Ziel ${fmtT(c.limit)})${!prev?.ok ? ' · +150 XP' : ''}` : `🗓️ ${fmtT(S.t)}, knapp vorbei (Ziel ${fmtT(c.limit)}). Morgen gibt es eine neue!`, 4500);
}

/* ---------- Goldene Glocken: je Strecke drei versteckt, mal links, mal rechts auf dem Weg ---------- */
export function bells(R) {
  const r = seeded('bells-' + R.id), out = [];
  for (let i = 0; i < 3; i++) out.push({ i, d: R.total * (.15 + i * .28 + r() * .12), lat: r() < .5 ? .45 : 2.7 });
  return out;
}
export const bellCount = id => (progress.bells?.[id] || []).length;
export function bellsSetup(S) {
  const got = new Set(progress.bells?.[S.route.id] || []);
  S.bells = bells(S.route).filter(b => !got.has(b.i));
  S.world.setBells?.(S.bells);
}
export function bellsTick(S, prev, flash) {
  if (!S.bells?.length) return;
  for (const b of S.bells) {
    if (b.got || !(prev < b.d + 3 && S.dist >= b.d - 3)) continue;
    if (Math.abs((S.lat ?? 1.5) - b.lat) < .75) {
      b.got = true; S.world.takeBell?.(b.i); (progress.bells ||= {})[S.route.id] = [...new Set([...(progress.bells[S.route.id] || []), b.i])]; saveProgress();
      const n = bellCount(S.route.id); S.bonusXp = (S.bonusXp || 0) + 30; sound.gate();
      flash(`🔔 Goldene Glocke gefunden! ${n} von 3 auf dieser Strecke · +30 XP${n === 3 ? ' · alle gefunden 🎉' : ''}`, 3000);
    } else if (!b.missed) { b.missed = true; flash(`🔔 Knapp vorbei! Die Glocke hing ${b.lat < 1.5 ? 'links' : 'rechts'} (Pfeiltasten oder Neigen zum Lenken)`, 2800); }
  }
}

/* ---------- Zeitfahren: allein, ohne Windschatten, Zwischenzeiten gegen die eigene Bestzeit ---------- */
export function ttSetup(S) {
  const R = S.route; S.tt = { dist: R.total, splits: [.25, .5, .75].map(f => f * R.total), got: [], best: progress.ttBest?.[R.id] || null };
  S.npcOn = false; S.field = []; S.world.setRiders?.([]);
}
export function ttTick(S, flash) {
  const T = S.tt; if (!T || T.done) return;
  for (const [k, at] of T.splits.entries()) if (!T.got[k] && S.odo >= at) {
    T.got[k] = S.t; const b = T.best?.splits?.[k], diff = b != null ? S.t - b : null;
    flash(`⏱️ Zwischenzeit ${k + 1}: ${fmtT(S.t)}${diff != null ? ` (${diff <= 0 ? '−' : '+'}${fmtT(Math.abs(diff))})` : ''}`, 2500); sound.beep(diff != null && diff <= 0);
  }
  if (S.odo >= T.dist) {
    T.done = true; const pr = !T.best || S.t < T.best.time;
    if (pr) { (progress.ttBest ||= {})[S.route.id] = { time: S.t, splits: T.got, date: new Date().toISOString() }; saveProgress(); S.bonusXp = (S.bonusXp || 0) + 100; sound.fanfare(); }
    flash(`🏁 Zeitfahren: ${fmtT(S.t)}${pr ? ' · neue Bestzeit! +100 XP' : ' · Bestzeit ' + fmtT(T.best.time)}`, 5000);
  }
}
export const ttLive = S => { const T = S.tt; if (!T?.best || T.done) return null; const k = T.splits.findIndex((_, i) => !T.got[i]); if (k <= 0) return null; return clamp(T.got[k - 1] - T.best.splits[k - 1], -3600, 3600); };
