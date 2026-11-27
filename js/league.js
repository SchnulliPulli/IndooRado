// Wochenligen (online, freiwillig) und Serien-Schutz (lokal).
import { progress, saveProgress } from './state.js';
import { FROZEN } from './analysis.js';
import { esc, toast, dialog } from './util.js';

export const TIERS = [['🥉', 'Bronze'], ['🥈', 'Silber'], ['🥇', 'Gold'], ['💠', 'Saphir'], ['♦️', 'Rubin'], ['💎', 'Diamant']];

/* ---------- Serien-Schutz ----------
   Wer in einer Woche an mindestens 3 Tagen fährt, bekommt einen Serien-Schutz (höchstens 2 auf Vorrat).
   Fehlen Tage zwischen der letzten Fahrt und gestern, werden sie automatisch mit Schutz überbrückt – sofern
   genug Schutz da ist und die Serie davor mindestens 2 Tage lang war. */
const key = d => d.toISOString().slice(0, 10);
const noon = (off = 0) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + off); return d; };
const weekOf = d => { const m = new Date(d); m.setHours(12, 0, 0, 0); m.setDate(m.getDate() - ((m.getDay() + 6) % 7)); return key(m); };
export function syncFrozen() { FROZEN.clear(); for (const d of progress.frozenDays || []) FROZEN.add(d); }
export function maintainStreak(rides) {
  syncFrozen();
  const days = new Set(rides.filter(r => !r.demo).map(r => r.date.slice(0, 10))); FROZEN.forEach(d => days.add(d));
  let changed = false, msg = null;
  // verdienen: aktuelle Woche mit mindestens 3 Fahrtagen
  const wk = weekOf(new Date()), inWeek = [...days].filter(d => !FROZEN.has(d) && weekOf(new Date(d + 'T12:00:00Z')) === wk).length;
  if (inWeek >= 3 && progress.freezeWeek !== wk) { progress.freezeWeek = wk; if ((progress.freezes || 0) < 2) { progress.freezes = (progress.freezes || 0) + 1; msg = '🧊 Serien-Schutz verdient (3 Fahrtage diese Woche)'; } changed = true; }
  // einsetzen: Lücke bis gestern überbrücken
  const gap = []; let d = noon(-1);
  while (!days.has(key(d)) && gap.length < 3) { gap.push(key(d)); d.setDate(d.getDate() - 1); }
  if (gap.length && days.has(key(d)) && gap.length <= (progress.freezes || 0)) {
    let before = 0; const x = new Date(d); while (days.has(key(x))) { before++; x.setDate(x.getDate() - 1); }
    if (before >= 2) {
      progress.freezes -= gap.length; progress.frozenDays = [...(progress.frozenDays || []), ...gap].slice(-60); gap.forEach(g => FROZEN.add(g));
      msg = `🧊 Serien-Schutz eingesetzt: deine Serie von ${before} Tagen bleibt bestehen`; changed = true;
    }
  }
  if (changed) saveProgress();
  if (msg) setTimeout(() => toast(msg, 4500), 600);
  return progress.freezes || 0;
}

/* ---------- Wochenliga ---------- */
async function rpc(name, args) { const O = await import('./online/client.js'); if (!O.loggedIn() || !O.access().ok) return null; const { data, error } = await (await O.client()).rpc(name, args); if (error) throw error; return data; }
export const leagueMe = (join = false) => rpc('league_me', { p_join: join });
export async function leagueAdd(xp) { try { if (progress.leagueOn) await rpc('league_add', { p_points: Math.round(xp) }); } catch (e) { } }
export const leagueLeave = () => rpc('league_leave', {});

// Karte für Fortschritt/Startseite
export async function leagueCard(box) {
  const O = await import('./online/client.js');
  if (!O.configured()) { box.remove(); return; }
  if (!O.loggedIn()) { box.innerHTML = `<h2>🏆 Wochenliga</h2><p class="small muted">Jede Woche 20 Fahrer auf deinem Niveau: die besten 5 steigen auf. Punkte sind deine Erfahrungspunkte. Dafür brauchst du ein <a href="#/account">IndooRado-Konto</a>.</p>`; return; }
  let m; try { m = await leagueMe(); } catch (e) { box.innerHTML = `<h2>🏆 Wochenliga</h2><p class="small muted">${/function|schema cache/i.test(e.message) ? 'Ligen fehlen in der Datenbank (Datenbankschema erneut ausführen).' : esc(e.message)}</p>`; return; }
  if (!m) { box.innerHTML = '<h2>🏆 Wochenliga</h2><p class="small muted">Für Ligen muss dein Konto freigeschaltet sein.</p>'; return; }
  if (!m.joined) {
    progress.leagueOn = false; saveProgress();
    box.innerHTML = `<h2>🏆 Wochenliga</h2><p class="small">Jede Woche fährst du in einer Gruppe mit bis zu 20 Leuten auf deiner Stufe. Punkte sind die Erfahrungspunkte deiner Fahrten. Die besten 5 steigen auf: ${TIERS.map(t => t[0]).join(' ')}. Ganz ohne Rennstress – jede Fahrt zählt.</p><p class="small muted">Sichtbar für deine Gruppe: Anzeigename und Wochenpunkte.</p><button class="btn pri" id="lgJoin">Liga beitreten</button>`;
    box.querySelector('#lgJoin').onclick = async () => { try { await leagueMe(true); progress.leagueOn = true; saveProgress(); leagueCard(box); } catch (e) { toast(e.message, 5000); } };
    return;
  }
  progress.leagueOn = true;
  const T = TIERS[m.tier] || TIERS[0], mem = m.members || [], left = Math.max(0, Math.ceil((new Date(m.ends) - Date.now()) / 864e5));
  const me = mem.findIndex(x => x.me), n = mem.length, upN = n >= 6 ? 5 : 0, downFrom = n >= 10 ? n - 5 : n;
  const res = { up: `🎉 Aufgestiegen in ${T[1]}!`, down: `Abgestiegen in ${T[1]} – diese Woche holst du es zurück`, stay: '', pause: '' }[m.result] || '';
  box.innerHTML = `<div class="row between"><h2>${T[0]} Liga ${T[1]}</h2><span class="small muted">noch ${left} ${left === 1 ? 'Tag' : 'Tage'}</span></div>
    ${res ? `<p class="small"><b>${res}</b></p>` : ''}
    <ol class="league">${mem.map((x, i) => `<li class="${x.me ? 'me' : ''} ${i < upN && x.points > 0 ? 'up' : ''} ${i >= downFrom && m.tier > 0 ? 'down' : ''}"><span class="num">${i + 1}</span><b>${esc(x.name)}${x.me ? ' (du)' : ''}</b><span class="num">${x.points} XP</span></li>`).join('')}</ol>
    <p class="small muted">${upN ? `Plätze 1–5 steigen auf${m.tier > 0 && n >= 10 ? ', die letzten 5 ab' : ''}.` : 'Ab 6 Fahrern in der Gruppe gibt es Aufstiege.'} Wer eine Woche gar nicht fährt, steigt ab.${me >= 0 && n > 1 && me > 0 ? ` Bis Platz ${me}: ${mem[me - 1].points - mem[me].points + 1} XP.` : ''}</p>
    <button class="linkbtn small" id="lgLeave">Liga verlassen</button>`;
  box.querySelector('#lgLeave').onclick = async () => { if (!(await dialog({ title: 'Liga verlassen?', html: '<p class="muted">Deine Punkte dieser Woche gehen verloren. Du kannst jederzeit wieder beitreten.</p>', buttons: [{ label: 'Abbrechen', value: false }, { label: 'Verlassen', value: true, cls: 'danger' }] }))) return; await leagueLeave().catch(() => { }); progress.leagueOn = false; saveProgress(); leagueCard(box); };
}
