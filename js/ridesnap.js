// Fahrt fortsetzen nach Absturz, leerem Akku oder geschlossenem Tab: Die laufende Fahrt wird alle 15 s (und beim
// Verlassen der Seite) nur auf diesem Gerät gesichert (kv „rideSnap“, nie abgeglichen). Beim nächsten Öffnen bietet die
// App an: weiterfahren, so speichern oder verwerfen. Rennen, Gruppenfahrten, Zeitfahren und Demo-Fahrten nicht.
import { kv } from './db.js';

const KEY = 'rideSnap', MAX_AGE = 48 * 3600e3;
// Was zum Weiterfahren und Speichern gebraucht wird (Zähler, Verlauf, Bestzeiten-Logs, Fotos)
const FIELDS = ['t', 'dist', 'odo', 'asc', 'kj', 'lap', 'lapT0', 'wT', 'wOff', 'woDone', 'finished', 'routeDoneT', 'startWall', 'wall', 'mode', 'ergW', 'gear',
  'samples', 'shots', 'climbLog', 'sprintLog', 'overtakes', 'gates', 'rideOnsGot', 'rideOnsGiven', 'bonusXp', 'pupUsed', 'beamed', 'demoUsed', 'nextDrink', 'env'];

export const snapAllowed = S => !!S && !S.race && !S.group && !S.tt && !S.kidMin && !S.joinRider && S.samples?.length >= 10;

export async function saveSnap(S) {
  if (!snapAllowed(S)) return;
  const o = { v: 1, at: Date.now(), routeId: S.route.id, routeName: S.route.name, woId: S.wo?.id || null, woName: S.wo?.name || null };
  for (const k of FIELDS) if (S[k] !== undefined) o[k] = S[k];
  try { await kv.set(KEY, o); } catch (e) { }
}
export async function getSnap() {
  try { const o = await kv.get(KEY, null); if (!o || o.v !== 1 || Date.now() - o.at > MAX_AGE || !o.samples?.length) return null; return o; } catch (e) { return null; }
}
export async function clearSnap() { try { await kv.del(KEY); } catch (e) { } }

// In eine frisch gestartete Fahrt übernehmen (gleiche Strecke). Danach steht die Fahrt pausiert an der alten Stelle.
export function applySnap(S, o) {
  for (const k of FIELDS) if (o[k] !== undefined && k !== 'env') S[k] = o[k];
  S.lastE = null; S.resumed = true;
  S.gateFor = null; // Zieltor neu bestimmen
}

// Ohne weiterzufahren speichern: eine Fahrt-Hülle wie in ride.js für saveRide bauen
export async function saveSnapAsRide(o) {
  const { getRoute } = await import('./routes.js'), { getWorkout } = await import('./workouts.js'), { saveRide } = await import('./ridesave.js');
  const route = await getRoute(o.routeId); if (!route) throw new Error('Strecke nicht gefunden');
  const wo = o.woId ? await getWorkout(o.woId).catch(() => null) : null;
  const S = { route, wo, climbLog: [], sprintLog: [], shots: [], samples: [], overtakes: 0, gates: 0, rideOnsGot: 0, rideOnsGiven: 0, lap: 0, wT: 0, wOff: 0, t: 0, mp: null, race: null, env: null };
  for (const k of FIELDS) if (o[k] !== undefined) S[k] = o[k];
  return saveRide(S);
}

// Beim App-Start fragen (nicht während einer Fahrt, nicht auf Zuschauer-/Fernseherseiten)
export async function offerResume() {
  if (/^#\/(ride|watch\/|tv\b)/.test(location.hash)) return;
  const o = await getSnap(); if (!o) return;
  const { dialog, toast, esc, fmtT, fmtKm } = await import('./util.js');
  const when = new Date(o.at).toLocaleString(document.documentElement.lang, { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  const v = await dialog({
    title: '🔁 Unterbrochene Fahrt gefunden',
    html: `<p><b>${esc(o.routeName || 'Fahrt')}</b>${o.woName ? ' · ' + esc(o.woName) : ''}</p><p class="muted">${fmtKm(o.odo || 0)} km · ${fmtT(o.t || 0)} · zuletzt gesichert ${esc(when)}</p><p class="small muted">Die App wurde während der Fahrt geschlossen (Absturz, Akku, Tab zu). Du kannst an derselben Stelle weiterfahren oder die Fahrt so speichern.</p>`,
    buttons: [{ label: '▶ Weiterfahren', value: 'go', cls: 'pri' }, { label: '💾 So speichern', value: 'save' }, { label: '🗑 Verwerfen', value: 'drop', cls: 'ghost danger' }],
  });
  if (v === 'go') {
    const { sel, saveSel } = await import('./state.js');
    sel.routeId = o.routeId; sel.workoutId = o.woId || null; if (o.mode) sel.mode = o.mode; saveSel?.();
    sessionStorage.setItem('resumeRide', '1'); location.hash = '#/ride';
  } else if (v === 'save') {
    try { const id = await saveSnapAsRide(o); await clearSnap(); location.hash = '#/summary/' + id + '?neu'; } catch (e) { toast('Speichern ging nicht: ' + e.message, 6000); }
  } else if (v === 'drop') await clearSnap();
}
