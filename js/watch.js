// Zuschauer-Link (Fahrer-Seite): Link erzeugen, alle 5 s den Stand senden, Anfeuerungen empfangen.
// Geteilt werden nur Name, Strecke, Tempo, Leistung, Distanz, Höhenmeter, Zeit und (nur wenn gewählt) Puls.
import * as O from './online/client.js';
import { esc, toast, dialog } from './util.js';

export const W = { token: null, hr: false, seen: new Set(), lastPush: 0, profile: null };
export const watchUrl = t => location.origin + location.pathname + '#/watch/' + t;

export async function startWatch(name) {
  if (!O.loggedIn() || !O.access().ok) { toast('Der Zuschauer-Link braucht ein angemeldetes IndooRado-Konto'); return null; }
  if (W.token) return shareDialog();
  const v = await dialog({ title: '📺 Zuschauer-Link', html: `<p class="muted">Freunde und Familie sehen deine Fahrt live im Browser – auch ohne Konto – und können dich mit Emojis anfeuern. Befreundete, angemeldete Zuschauer können dich auch anrufen.</p>
    <p class="small muted">Geteilt werden: dein Anzeigename, Strecke, Tempo, Leistung, Distanz, Höhenmeter und Zeit. Wer den Link hat, kann zusehen. Der Link endet, wenn du ihn beendest, spätestens nach 8 Stunden.</p>
    <label class="switch"><input type="checkbox" id="wHr"><span></span> <div class="swt">Puls auch zeigen<small class="muted">Gesundheitsdatum – nur wenn du das möchtest</small></div></label>`,
    buttons: [{ label: 'Abbrechen', value: null }, { label: 'Link erzeugen', value: 'ok', cls: 'pri' }] });
  if (v !== 'ok') return null;
  W.hr = !!W.hrPending; W.hrPending = null; // Haken wurde beim Ändern gemerkt (der Dialog ist schon zu)
  try { const { data, error } = await (await O.client()).rpc('watch_start', { p_name: name }); if (error) throw error; W.token = data; W.seen.clear(); }
  catch (e) { toast(/function|schema cache/i.test(e.message) ? 'Zuschauer-Link fehlt in der Datenbank (Datenbankschema erneut ausführen)' : e.message, 6000); return null; }
  await shareDialog(); return W.token;
}
// Haken „Puls“ beim Schließen merken (dialog() entfernt den Inhalt sofort)
document.addEventListener('change', e => { if (e.target.id === 'wHr') W.hrPending = e.target.checked; });

async function shareDialog() {
  const url = watchUrl(W.token);
  const v = await dialog({ title: '📺 Zuschauer-Link', html: `<p class="muted">Schick diesen Link an deine Zuschauer:</p><input class="inp" readonly value="${esc(url)}" data-selectall><p class="small muted">Beenden über ⋯ › Zuschauer-Link.</p>`,
    buttons: [{ label: 'Link beenden', value: 'stop', cls: 'danger' }, { label: 'Kopieren', value: 'copy' }, ...(navigator.share ? [{ label: 'Teilen …', value: 'share', cls: 'pri' }] : [])] });
  if (v === 'copy') { try { await navigator.clipboard.writeText(url); toast('Link kopiert'); } catch (e) { toast('Kopieren nicht möglich, bitte markieren und kopieren'); } }
  if (v === 'share') navigator.share({ title: 'Schau mir beim Radfahren zu', text: 'Ich fahre gerade auf IndooRado – feuer mich an!', url }).catch(() => { });
  if (v === 'stop') await stopWatch();
}
export async function stopWatch() {
  if (!W.token) return; const t = W.token; W.token = null;
  try { await (await O.client()).rpc('watch_stop', { p_token: t }); toast('Zuschauer-Link beendet'); } catch (e) { }
}
// Stand senden; liefert neue Anfeuerungen zurück
export async function pushWatch(state) {
  if (!W.token || Date.now() - W.lastPush < 4500) return [];
  W.lastPush = Date.now();
  if (W.hrPending != null) { W.hr = W.hrPending; W.hrPending = null; }
  if (!W.hr) delete state.hr;
  try {
    const { data, error } = await (await O.client()).rpc('watch_push', { p_token: W.token, p_state: state });
    if (error) return [];
    if (data == null) { W.token = null; toast('Zuschauer-Link ist abgelaufen'); return []; }
    const neu = (data || []).filter(c => !W.seen.has(c.id)); neu.forEach(c => W.seen.add(c.id)); return neu;
  } catch (e) { return []; }
}
