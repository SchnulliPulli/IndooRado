// VeloVerse Online: Abgleich läuft über js/sync.js (gleiches Verfahren wie NAS/Cloud, Speicherort = privater Supabase-Ordner).
// Hier: Fahrt-Zusammenfassungen für Bestenlisten, Ankündigungen, Online-Daten und Konto löschen.
import { db, kv } from '../db.js';
import { online, client, access } from './client.js';
import { PREF_DEFAULT } from '../sync.js';

export const prefs = async () => ({ ...PREF_DEFAULT, ...(await kv.get('onlinePrefs', {})) });
export async function setPrefs(p) { await kv.set('onlinePrefs', { ...(await prefs()), ...p }); }

// Zusammenfassungen für Bestenliste und Statistik. Ohne Freigabe werden vorhandene Zeilen entfernt.
export async function pushRides() {
  const sb = await client(); if (!online.user || !access().ok) return 0;
  const P = await prefs();
  // gelöschte Fahrten auch aus der Bestenliste entfernen
  const gone = await kv.get('deletedRides', []); if (gone.length) await sb.from('rides').delete().eq('user_id', online.user.id).in('id', gone.slice(-500));
  if (!P.leaderboard) { await sb.from('rides').delete().eq('user_id', online.user.id); return 0; }
  const rides = await db.all('rides');
  const rows = rides.filter(r => !r.imported).map(r => ({
    id: r.id, user_id: online.user.id, started_at: r.start || r.date, route_id: r.routeId, route_name: r.routeName, title: r.title,
    distance_m: Math.round(r.sum?.dist || 0), duration_s: r.routePr?.time != null ? Math.round(r.routePr.time) : null, // nur ganze Strecken zählen für die Bestenliste
    ascent_m: Math.round(r.sum?.asc || 0), avg_w: P.power ? Math.round(r.sum?.avgP || 0) : null, np_w: P.power ? Math.round(r.sum?.np || 0) : null, tss: r.sum?.tss ?? null, xp: r.xp || 0,
    summary: { dur: Math.round(r.sum?.dur || 0), avgHr: P.hr ? r.sum?.avgHr ?? null : null, workout: r.workoutName, loop: r.loop, finished: !!r.routePr },
  }));
  for (let i = 0; i < rows.length; i += 200) { const { error } = await sb.from('rides').upsert(rows.slice(i, i + 200)); if (error) throw error; }
  return rows.length;
}
export async function leaderboard(routeId) { const { data, error } = await (await client()).rpc('route_leaderboard', { p_route: routeId, p_limit: 20 }); if (error) throw error; return data; }
export async function announcements() { const { data } = await (await client()).from('announcements').select('*').order('created_at', { ascending: false }).limit(3); return data || []; }

// Alles Online-Gespeicherte entfernen (lokale Daten bleiben)
export async function deleteOnlineData() {
  const sb = await client(), uid = online.user.id, st = sb.storage.from('vault');
  const walk = async dir => { const { data } = await st.list(dir, { limit: 1000 }); let files = []; for (const f of data || []) { if (f.id) files.push(dir + '/' + f.name); else files = files.concat(await walk(dir + '/' + f.name)); } return files; };
  const files = await walk(uid);
  for (let i = 0; i < files.length; i += 100) { const { error } = await st.remove(files.slice(i, i + 100)); if (error) throw error; }
  await sb.from('rides').delete().eq('user_id', uid);
  await kv.set('syncMetaOnline', {});
  return files.length;
}
// Konto komplett löschen: Online-Daten, Profil, Login
export async function deleteAccount() {
  await deleteOnlineData();
  const { error } = await (await client()).rpc('delete_my_account'); if (error) throw error;
  await (await client()).auth.signOut({ scope: 'local' }).catch(() => { });
}
