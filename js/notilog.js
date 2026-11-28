// Hinweise fürs Nachrichtencenter (nur auf diesem Gerät): Einladungen, verpasste Anrufe, Erinnerungen, Systemhinweise.
// Höchstens 40 Einträge, älter als 14 Tage fällt weg. „Alle löschen“ im Nachrichtencenter leert die Liste.
import { kv } from './db.js';
import { bus } from './util.js';
const KEY = 'notiLog';
export async function notes() { const a = (await kv.get(KEY, [])) || []; return a.filter(n => Date.now() - n.t < 14 * 864e5); }
export async function addNote(n) {
  const a = await notes(); a.unshift({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), t: Date.now(), ...n });
  await kv.set(KEY, a.slice(0, 40)); bus.emit('inbox'); bus.emit('chatnew', {});
}
export async function clearNotes() { await kv.set(KEY, []); }
export async function removeNote(id) { await kv.set(KEY, (await notes()).filter(n => n.id !== id)); }
