// Push-Benachrichtigungen bei geschlossener App (Web-Push): neue Nachricht und eingehender Anruf.
// Pro Gerät einschaltbar (localStorage „vvPush“). Das Gerät meldet seine Push-Adresse bei IndooRado Online an
// (push_subscribe); der Absender löst nach dem Senden über die Edge Function „push“ eine kurze Meldung aus.
// Der öffentliche VAPID-Schlüssel steht in online.json („vapid“), der private nur als Secret in Supabase.
// iPhone/iPad: nur wenn IndooRado als App auf dem Home-Bildschirm installiert ist (ab iOS 16.4).
import * as O from './online/client.js';
import { profile } from './state.js';

const b64u = s => { const p = '='.repeat((4 - s.length % 4) % 4), b = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(b, c => c.charCodeAt(0)); };
const enc = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const vapid = () => String(O.config?.()?.vapid || '').trim();
export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && typeof Notification !== 'undefined' && (location.protocol === 'https:' || location.hostname === 'localhost');
export const pushWanted = () => { try { return localStorage.getItem('vvPush') === '1'; } catch (e) { return false; } };
const prefs = () => ({ msg: profile.notif?.msg !== false, call: profile.notif?.call !== false });
const rpc = async (n, a) => { const { data, error } = await (await O.client()).rpc(n, a); if (error) throw error; return data; };

async function reg() { const r = await navigator.serviceWorker.getRegistration(); if (r) return r; return navigator.serviceWorker.ready; }
// Einschalten: Erlaubnis, Push-Adresse holen, beim Konto anmelden
export async function enablePush() {
  if (!pushSupported()) throw new Error(/iPhone|iPad/.test(navigator.userAgent) ? 'Auf dem iPhone erst IndooRado zum Home-Bildschirm hinzufügen und von dort öffnen' : 'Dieser Browser kann keine Push-Benachrichtigungen');
  if (!O.loggedIn() || !O.access().ok) throw new Error('Push braucht ein angemeldetes IndooRado-Konto');
  if (!vapid()) throw new Error('Push ist noch nicht eingerichtet (öffentlicher Schlüssel fehlt in online.json)');
  const p = await Notification.requestPermission(); if (p !== 'granted') throw new Error('Benachrichtigungen wurden nicht erlaubt (Browser- bzw. Geräte-Einstellungen)');
  const r = await reg();
  let sub = await r.pushManager.getSubscription();
  const key = b64u(vapid());
  if (sub && sub.options?.applicationServerKey && enc(sub.options.applicationServerKey) !== enc(key)) { await sub.unsubscribe().catch(() => { }); sub = null; } // Schlüssel gewechselt
  if (!sub) sub = await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  const j = sub.toJSON();
  await rpc('push_subscribe', { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_prefs: prefs() });
  try { localStorage.setItem('vvPush', '1'); } catch (e) { }
  return true;
}
export async function disablePush() {
  try { localStorage.setItem('vvPush', '0'); } catch (e) { }
  try { const r = await navigator.serviceWorker.getRegistration(), sub = await r?.pushManager.getSubscription(); if (sub) { if (O.loggedIn()) await rpc('push_unsubscribe', { p_endpoint: sub.endpoint }).catch(() => { }); await sub.unsubscribe(); } } catch (e) { }
}
// Nach der Anmeldung bzw. bei geänderten Einstellungen erneut melden (Push-Adressen können sich ändern)
export async function refreshPush() { if (pushWanted() && pushSupported() && O.loggedIn() && vapid() && Notification.permission === 'granted') try { await enablePush(); } catch (e) { } }
// Absender: nach dem Senden einer Nachricht bzw. beim Anrufen den Empfänger benachrichtigen (Fehler sind egal)
export async function pushTo(to, kind, room) {
  try { if (!O.loggedIn()) return; await (await O.client()).functions.invoke('push', { body: { to, kind, room } }); } catch (e) { }
}

// Admin: VAPID-Schlüsselpaar im Browser erzeugen (verlässt das Gerät nicht)
export async function makeVapid() {
  const k = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pub = await crypto.subtle.exportKey('raw', k.publicKey), jwk = await crypto.subtle.exportKey('jwk', k.privateKey);
  return { publicKey: enc(pub), privateKey: jwk.d };
}

// Selbsttest: Push an die eigenen Geräte (kommt über den Push-Dienst, also genau wie bei geschlossener App)
export async function selfTest() {
  if (!O.loggedIn()) throw new Error('Nicht angemeldet');
  if (!pushWanted()) throw new Error('Erst „Auch bei geschlossener App (Push)“ einschalten');
  await enablePush(); // Anmeldung des Geräts auffrischen
  const { data, error } = await (await O.client()).functions.invoke('push', { body: { to: O.online.user.id, kind: 'test' } });
  if (error) { const st = error.context?.status; throw new Error(st === 404 ? 'Edge Function „push“ nicht gefunden' : st === 401 ? 'Edge Function lehnt die Anmeldung ab (401)' : 'Edge Function: ' + (st || error.message)); }
  if (data?.why === 'not-configured') throw new Error('In Supabase fehlen die Secrets VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY');
  if (data?.why === 'not-allowed') throw new Error('Zu viele Tests (höchstens 5 pro Stunde) oder Schema veraltet (schema.sql ausführen)');
  if (data?.why === 'no-device') throw new Error('Kein Gerät angemeldet – Schema ausgeführt?');
  if (!data?.sent) throw new Error('Push-Dienst lehnt ab: ' + (data?.errors || []).join(', ') + ' – passt VAPID_PUBLIC_KEY zum Schlüssel in online.json?');
  return data;
}
