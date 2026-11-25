// Online-Speicher: das VeloVerse-Datenpaket (store.js) liegt im privaten Storage-Ordner des Nutzers,
// dazu je Fahrt eine Zeile für Bestenlisten und Statistik. Gleiches Format wie die Datei-Sicherung.
import { exportData, importData, registerAdapter } from '../store.js';
import { db, kv } from '../db.js';
import { online, client } from './client.js';

const path = f => `${online.user.id}/${f}`;
export async function pushVault() {
  const sb = await client(); if (!online.user) throw new Error('Nicht angemeldet');
  const txt = await exportData({ shots: false });
  const { error } = await sb.storage.from('vault').upload(path('veloverse-data.json'), new Blob([txt], { type: 'application/json' }), { upsert: true, contentType: 'application/json' });
  if (error) throw error;
  await pushRides();
  await kv.set('onlineLast', new Date().toISOString());
  return txt.length;
}
export async function pullVault() {
  const sb = await client(); if (!online.user) throw new Error('Nicht angemeldet');
  const { data, error } = await sb.storage.from('vault').download(path('veloverse-data.json'));
  if (error) { if (/not.?found|404/i.test(error.message || '')) return null; throw error; }
  const res = await importData(await data.text());
  await kv.set('onlineLast', new Date().toISOString());
  return res;
}
// Fahrten-Zusammenfassungen hochladen (für Bestenlisten, Statistik, Admin)
export async function pushRides() {
  const sb = await client(), rides = await db.all('rides');
  const rows = rides.filter(r => !r.imported).map(r => ({
    id: r.id, user_id: online.user.id, started_at: r.start || r.date, route_id: r.routeId, route_name: r.routeName, title: r.title,
    distance_m: Math.round(r.sum?.dist || 0), duration_s: r.routePr?.time != null ? Math.round(r.routePr.time) : null, // nur ganze Strecken zählen für die Bestenliste ascent_m: Math.round(r.sum?.asc || 0),
    avg_w: Math.round(r.sum?.avgP || 0), np_w: Math.round(r.sum?.np || 0), tss: r.sum?.tss ?? null, xp: r.xp || 0,
    summary: { dur: Math.round(r.sum?.dur || 0), avgHr: r.sum?.avgHr, maxP: r.sum?.maxP, workout: r.workoutName, loop: r.loop, finished: !!r.routePr },
  }));
  for (let i = 0; i < rows.length; i += 200) { const { error } = await sb.from('rides').upsert(rows.slice(i, i + 200)); if (error) throw error; }
  return rows.length;
}
export async function leaderboard(routeId) { const { data, error } = await (await client()).rpc('route_leaderboard', { p_route: routeId, p_limit: 20 }); if (error) throw error; return data; }
export async function announcements() { const { data } = await (await client()).from('announcements').select('*').order('created_at', { ascending: false }).limit(3); return data || []; }

registerAdapter({ id: 'online', name: 'VeloVerse Online', save: pushVault, load: pullVault });
