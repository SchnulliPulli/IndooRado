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
  if (!W.token) return; const t = W.token; W.token = null; stopCast();
  try { await (await O.client()).rpc('watch_stop', { p_token: t }); toast('Zuschauer-Link beendet'); } catch (e) { }
}
// Stand senden; liefert neue Anfeuerungen zurück
export async function pushWatch(state) {
  if (!W.token || Date.now() - W.lastPush < 1800) return []; // alle 2 s (Fernseher-Anzeige)
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

/* ---------- Auf den Fernseher streamen ----------
   Android/PC (Chrome): Chromecast & Google TV über die Presentation API – der Fernseher lädt selbst die große Fahrtanzeige.
   Fernseher mit Browser (Fire TV, Android TV, Smart-TV): indoorado.de/tv öffnen und den Kurzcode eingeben.
   iPhone/iPad: Webseiten lassen sich dort nicht an den Fernseher senden; AirPlay geht über die Bildschirmsynchronisierung.
   In allen Fällen schickt das Handy nur die Werte (über den Zuschauer-Link), kein Video. */
const tvUrl = t => location.origin + location.pathname + '#/watch/' + t + '/tv';
export const tvCode = t => t.slice(0, 8).toUpperCase().replace(/(.{4})(.{4})/, '$1 $2');
async function ensureToken(name) {
  if (W.token) return W.token;
  const { data, error } = await (await O.client()).rpc('watch_start', { p_name: name }); if (error) throw error;
  W.token = data; W.hr = false; W.seen.clear(); return data;
}
export async function castToTv(name) {
  const apple0 = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!O.loggedIn() || !O.access().ok) {
    // Ohne Konto: Bildschirm spiegeln (zeigt die komplette Fahrt mit 3D-Welt)
    await dialog({ title: '📺 Auf dem Fernseher anzeigen', cls: 'castdlg', html: apple0
      ? '<p><b>Apple TV / AirPlay</b><br><span class="small muted">Kontrollzentrum öffnen › <b>Bildschirmsynchronisierung</b> › Apple TV wählen.</span></p>'
      : '<p><b>Chromecast / Google TV</b><br><span class="small muted">Chrome-Menü <b>⋮</b> › <b>Streamen …</b> (am Handy: Teilen › Streamen bzw. Schnelleinstellungen › <b>Bildschirm übertragen</b>) und den Fernseher wählen.</span></p>' +
        (/Windows/.test(navigator.userAgent) ? '<p><b>Windows: Drahtlose Anzeige (Miracast)</b><br><span class="small muted"><b>Windows-Taste + K</b> drücken und den Fernseher wählen (Samsung, LG, Fire TV und viele andere mit „Screen Mirroring“). Spiegelt den ganzen Bildschirm mit 3D-Welt.</span></p>' : '') +
        '<p class="small muted">Mit IndooRado-Konto gibt es zusätzlich die große Fahrtanzeige direkt auf dem Fernseher (Chromecast oder indoorado.de/tv mit Code) – das spart Akku, weil nur die Werte übertragen werden.</p>',
      buttons: [{ label: 'OK', value: null, cls: 'pri' }] });
    return;
  }
  let t; try { t = await ensureToken(name); } catch (e) { toast(/function|schema cache/i.test(e.message) ? 'Fehlt in der Datenbank: schema.sql erneut ausführen' : e.message, 6000); return; }
  const apple = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const canCast = typeof window.PresentationRequest === 'function' && !apple;
  const host = location.host + (location.pathname.replace(/\/index\.html$/, '/').replace(/\/$/, '')) + '/tv';
  const v = await dialog({ title: '📺 Auf dem Fernseher anzeigen', cls: 'castdlg', html: `
    ${canCast ? '<p><b>Chromecast / Google TV</b><br><span class="small muted">Fernseher im selben WLAN auswählen – er zeigt dann die große Fahrtanzeige.</span></p>' : ''}
    <p><b>Fernseher mit Browser</b> <span class="small muted">(Fire TV, Android TV, Smart-TV, Spielkonsole)</span><br>Dort <code>${esc(host)}</code> öffnen und diesen Code eingeben:</p>
    <div class="castcode num">${tvCode(t)}</div>
    ${/Windows/.test(navigator.userAgent) ? '<p><b>Windows: Drahtlose Anzeige (Miracast)</b><br><span class="small muted"><b>Windows-Taste + K</b> drücken und den Fernseher wählen (Samsung, LG, Fire TV und viele andere mit „Screen Mirroring“). Spiegelt den ganzen Bildschirm mit 3D-Welt.</span></p>' : ''}
    ${apple ? '<p><b>Apple TV / AirPlay</b><br><span class="small muted">iPhone und iPad können Webseiten nicht direkt an den Fernseher senden. Öffne das Kontrollzentrum › <b>Bildschirmsynchronisierung</b> und wähle dein Apple TV – dann siehst du die komplette Fahrt mit 3D-Welt auf dem Fernseher.</span></p>' : ''}
    <p class="small muted">Gezeigt werden Name, Strecke, Tempo, Leistung, Distanz, Höhenmeter, Zeit und das Workout – kein Puls. Der Fernseher braucht kein Konto. Beenden über ⋯ › Zuschauer.</p>`,
    buttons: [{ label: 'Schließen', value: null }, ...(canCast ? [{ label: '📺 Fernseher wählen', value: 'cast', cls: 'pri' }] : [])] });
  if (v !== 'cast') return;
  try {
    const req = new PresentationRequest([tvUrl(t)]);
    const conn = await req.start();
    W.cast = conn; toast('📺 Läuft auf dem Fernseher', 2500);
    conn.addEventListener?.('terminate', () => { W.cast = null; });
  } catch (e) {
    if (e.name === 'NotAllowedError' || e.name === 'AbortError') return; // abgebrochen
    toast(e.name === 'NotFoundError' ? 'Kein Chromecast im WLAN gefunden – nutze den Code auf einem Fernseher mit Browser' : 'Streamen nicht möglich: ' + e.message, 6000);
  }
}
export function stopCast() { try { W.cast?.terminate?.(); } catch (e) { } W.cast = null; }
