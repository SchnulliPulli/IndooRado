// VeloVerse Online: Verbindung zu Supabase (Login, Profil, 2FA). Ohne Konfiguration bleibt alles aus und die App läuft rein lokal.
// Die Supabase-Bibliothek wird erst geladen, wenn Online wirklich genutzt wird.
import { bus } from '../util.js';
import { CONFIG } from './config.js';

const LS = 'vvOnline';
export const online = { client: null, session: null, user: null, profile: null, aal: null, ready: false };

// Reihenfolge: online.json neben der App (Server-Version) > Eintrag im Browser > config.js
// So bleibt eine Codebasis: ohne online.json (z. B. GitHub Pages) ist die App rein lokal, mit online.json auf dem Webserver online.
let site = null;
export async function loadSiteConfig() {
  if (site) return site;
  try { const r = await fetch('online.json', { cache: 'no-cache' }); site = r.ok ? await r.json() : {}; } catch (e) { site = {}; }
  return site;
}
export function config() {
  let o = {}; try { o = JSON.parse(localStorage.getItem(LS) || '{}'); } catch (e) { }
  const s = site || {};
  return { url: s.url || o.url || CONFIG.url, anonKey: s.anonKey || o.anonKey || CONFIG.anonKey, providers: s.providers || CONFIG.providers, site: !!s.url };
}
export function setConfig(url, anonKey) { localStorage.setItem(LS, JSON.stringify({ url: url.trim().replace(/\/$/, ''), anonKey: anonKey.trim() })); online.client = null; }
export const configured = () => { const c = config(); return !!(c.url && c.anonKey); };

export async function client() {
  if (online.client) return online.client;
  if (!configured()) throw new Error('VeloVerse Online ist nicht eingerichtet');
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm');
  const c = config();
  online.client = createClient(c.url, c.anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce', storageKey: 'vv-auth' } });
  online.client.auth.onAuthStateChange((ev, session) => { online.session = session; online.user = session?.user || null; refresh().catch(() => { }); bus.emit('online', ev); });
  return online.client;
}
// Beim App-Start: Sitzung wiederherstellen (auch nach OAuth-Rückkehr mit ?code=...)
export async function initOnline() {
  await loadSiteConfig();
  if (!configured()) { online.ready = true; return null; }
  const sb = await client();
  const { data } = await sb.auth.getSession();
  if (expectingReturn() && new URLSearchParams(location.search).has('code')) { localStorage.removeItem('vvOnlineReturn'); history.replaceState(null, '', location.pathname + (location.hash || '#/account')); }
  online.session = data.session; online.user = data.session?.user || null;
  await refresh(); online.ready = true; bus.emit('online', 'init');
  return online.user;
}
async function refresh() {
  const sb = online.client; if (!sb || !online.user) { online.profile = null; online.aal = null; return; }
  const { data: a } = await sb.auth.mfa.getAuthenticatorAssuranceLevel(); online.aal = a;
  const { data: p } = await sb.from('profiles').select('*').eq('id', online.user.id).maybeSingle(); online.profile = p;
  sb.from('profiles').update({ last_seen: new Date().toISOString() }).eq('id', online.user.id).then(() => { });
}
export const loggedIn = () => !!online.user;
export const isAdmin = () => online.profile?.role === 'admin';
export const needsMfa = () => online.aal && online.aal.nextLevel === 'aal2' && online.aal.currentLevel !== 'aal2';

/* ---------- Anmeldung ---------- */
const back = () => location.origin + location.pathname + '#/account';
// Merker, damit der App-Start den ?code= aus der Rückleitung Supabase zuordnet (Strava und Cloud nutzen denselben Parameter)
const mark = () => localStorage.setItem('vvOnlineReturn', String(Date.now()));
export const expectingReturn = () => Date.now() - (+localStorage.getItem('vvOnlineReturn') || 0) < 30 * 60e3;
export async function signUp(email, password, name) { mark(); const { error } = await (await client()).auth.signUp({ email, password, options: { data: { name }, emailRedirectTo: back() } }); if (error) throw error; }
export async function signIn(email, password) { const { data, error } = await (await client()).auth.signInWithPassword({ email, password }); if (error) throw error; online.session = data.session; online.user = data.user || data.session?.user || null; await refresh(); }
export async function magicLink(email) { mark(); const { error } = await (await client()).auth.signInWithOtp({ email, options: { emailRedirectTo: back() } }); if (error) throw error; }
export async function oauth(provider) { mark(); const { error } = await (await client()).auth.signInWithOAuth({ provider, options: { redirectTo: back() } }); if (error) throw error; }
export async function resetPassword(email) { mark(); const { error } = await (await client()).auth.resetPasswordForEmail(email, { redirectTo: back() }); if (error) throw error; }
export async function signOut() { await (await client()).auth.signOut(); online.profile = null; bus.emit('online', 'out'); }

/* ---------- Zwei-Faktor (TOTP, z. B. Google Authenticator, 1Password, Aegis) ---------- */
export async function mfaFactors() { const { data, error } = await (await client()).auth.mfa.listFactors(); if (error) throw error; return data.totp || []; }
export async function mfaEnroll() { const { data, error } = await (await client()).auth.mfa.enroll({ factorType: 'totp', friendlyName: 'VeloVerse ' + new Date().toLocaleDateString('de-DE') }); if (error) throw error; return data; } // { id, totp: { qr_code, secret, uri } }
export async function mfaVerify(factorId, code) {
  const sb = await client();
  const { data: ch, error: e1 } = await sb.auth.mfa.challenge({ factorId }); if (e1) throw e1;
  const { error: e2 } = await sb.auth.mfa.verify({ factorId, challengeId: ch.id, code: code.replace(/\s/g, '') }); if (e2) throw e2;
  await refresh(); bus.emit('online', 'mfa');
}
export async function mfaRemove(factorId) { const { error } = await (await client()).auth.mfa.unenroll({ factorId }); if (error) throw error; await refresh(); }

export async function updateProfile(patch) {
  const { data, error } = await (await client()).from('profiles').update(patch).eq('id', online.user.id).select().single(); if (error) throw error; online.profile = data; return data;
}
