// Konto: VeloVerse Online (Supabase). Anmelden per E-Mail/Passwort, Magic Link oder OAuth, 2FA mit Authenticator-App,
// Daten online sichern und laden, öffentliches Profil.
import { $, esc, toast, dialog, bus } from '../util.js';
import { profile, progress, levelOf } from '../state.js';
import { kv } from '../db.js';
import * as O from '../online/client.js';

const PROV = { google: 'Google', github: 'GitHub', apple: 'Apple', discord: 'Discord', azure: 'Microsoft' };
let off = null;
export async function render(el) {
  off?.(); off = null;
  await O.loadSiteConfig();
  if (!O.configured()) return renderSetup(el);
  try { if (!O.online.ready) await O.initOnline(); } catch (e) { el.innerHTML = `<section class="card"><h2>Verbindung fehlgeschlagen</h2><p class="muted">${esc(e.message)}</p></section>`; return; }
  off = bus.on('online', ev => { if (ev !== 'init' && document.body.contains(el)) render(el); });
  if (!O.loggedIn()) return renderLogin(el);
  if (O.needsMfa()) return renderMfaChallenge(el);
  return renderAccount(el);
}
export function leave() { off?.(); off = null; }

function renderSetup(el) {
  el.innerHTML = `
  <section class="pagehead"><h1>Konto</h1></section>
  <section class="card form"><h2>VeloVerse Online einrichten</h2>
    <p class="muted">Mit einem Konto liegen deine Daten zusätzlich online, du fährst live mit anderen und erscheinst in Bestenlisten. Ohne Konto funktioniert alles wie bisher, nur lokal.</p>
    <p class="small muted">Für den Betreiber: Supabase-Projekt anlegen, <code>supabase/schema.sql</code> ausführen, dann hier Projekt-URL und „anon public“-Schlüssel eintragen (oder fest in <code>js/online/config.js</code>). Anleitung: <code>docs/ONLINE.md</code>.</p>
    <label class="f">Projekt-URL<input class="inp" id="cfgUrl" placeholder="https://xxxx.supabase.co"></label>
    <label class="f">Anon-Schlüssel<input class="inp" id="cfgKey" placeholder="eyJ…"></label>
    <div class="row"><button class="btn pri" id="cfgSave">Speichern und verbinden</button></div>
  </section>`;
  $('#cfgSave', el).onclick = async () => {
    const u = $('#cfgUrl', el).value, k = $('#cfgKey', el).value;
    if (!/^https:\/\/.+/.test(u.trim()) || k.trim().length < 20) return toast('Bitte URL (https://…) und Schlüssel eintragen', 3000);
    O.setConfig(u, k); O.online.ready = false; render(el);
  };
}

function renderLogin(el) {
  const provs = O.config().providers.filter(p => PROV[p]);
  el.innerHTML = `
  <section class="pagehead"><h1>Konto</h1></section>
  <section class="authwrap">
    <div class="card form authcard">
      <div class="tabs2" id="aTabs"><button class="on" data-t="in">Anmelden</button><button data-t="up">Registrieren</button></div>
      ${provs.length ? `<div class="oauth">${provs.map(p => `<button class="btn" data-oauth="${p}">${PROV[p]}</button>`).join('')}</div><div class="orline"><span>oder mit E-Mail</span></div>` : ''}
      <label class="f" data-up hidden>Anzeigename<input class="inp" id="aName" maxlength="40" value="${esc(profile.name || '')}" autocomplete="nickname"></label>
      <label class="f">E-Mail<input class="inp" id="aMail" type="email" autocomplete="email"></label>
      <label class="f">Passwort<input class="inp" id="aPass" type="password" autocomplete="current-password" minlength="10"></label>
      <p class="small muted" data-up hidden>Mindestens 10 Zeichen. Nach der Registrierung bekommst du eine Bestätigungsmail.</p>
      <div class="row"><button class="btn pri" id="aGo">Anmelden</button><button class="btn ghost" id="aMagic" title="Link per E-Mail, ohne Passwort">Link per E-Mail</button><button class="btn ghost sm" id="aForgot">Passwort vergessen</button></div>
    </div>
    <div class="card authinfo"><h2>Warum ein Konto?</h2><ul class="tips small">
      <li>☁️ Fahrten, Einstellungen und Fortschritt online gesichert, auf jedem Gerät</li>
      <li>🌐 Live mit Freunden auf derselben Strecke fahren</li>
      <li>🏆 Bestenlisten je Strecke</li>
      <li>🔐 Optional Zwei-Faktor-Anmeldung mit einer Authenticator-App</li></ul>
      <p class="small muted">Ohne Konto bleibt alles wie bisher lokal in diesem Browser.</p></div>
  </section>`;
  let mode = 'in';
  $('#aTabs', el).onclick = e => { const b = e.target.closest('[data-t]'); if (!b) return; mode = b.dataset.t; for (const x of $('#aTabs', el).children) x.classList.toggle('on', x === b); el.querySelectorAll('[data-up]').forEach(x => x.hidden = mode !== 'up'); $('#aGo', el).textContent = mode === 'up' ? 'Konto anlegen' : 'Anmelden'; $('#aPass', el).autocomplete = mode === 'up' ? 'new-password' : 'current-password'; };
  el.querySelectorAll('[data-oauth]').forEach(b => b.onclick = () => O.oauth(b.dataset.oauth).catch(e => toast(e.message, 5000)));
  const mail = () => $('#aMail', el).value.trim();
  $('#aGo', el).onclick = async () => {
    const pass = $('#aPass', el).value; if (!mail() || !pass) return toast('E-Mail und Passwort eingeben', 2500);
    try {
      if (mode === 'up') { if (pass.length < 10) return toast('Passwort: mindestens 10 Zeichen', 3000); await O.signUp(mail(), pass, $('#aName', el).value.trim() || 'Fahrer'); toast('Fast fertig: bitte den Link in der E-Mail bestätigen', 6000); }
      else { await O.signIn(mail(), pass); render(el); }
    } catch (e) { toast(e.message === 'Invalid login credentials' ? 'E-Mail oder Passwort falsch' : e.message, 5000); }
  };
  $('#aMagic', el).onclick = async () => { if (!mail()) return toast('Erst die E-Mail eintragen', 2500); try { await O.magicLink(mail()); toast('Link ist unterwegs, bitte Postfach prüfen', 5000); } catch (e) { toast(e.message, 5000); } };
  $('#aForgot', el).onclick = async () => { if (!mail()) return toast('Erst die E-Mail eintragen', 2500); try { await O.resetPassword(mail()); toast('E-Mail zum Zurücksetzen verschickt', 5000); } catch (e) { toast(e.message, 5000); } };
}

async function renderMfaChallenge(el) {
  const f = (await O.mfaFactors()).find(x => x.status === 'verified');
  el.innerHTML = `<section class="pagehead"><h1>Konto</h1></section>
  <section class="card form authcard"><h2>Zweiter Faktor</h2><p class="muted">Gib den 6-stelligen Code aus deiner Authenticator-App ein.</p>
    <input class="inp otp" id="mCode" inputmode="numeric" autocomplete="one-time-code" maxlength="7" placeholder="123 456">
    <div class="row"><button class="btn pri" id="mGo">Bestätigen</button><button class="btn ghost" id="mOut">Abmelden</button></div></section>`;
  $('#mCode', el).focus();
  const go = async () => { try { await O.mfaVerify(f.id, $('#mCode', el).value); toast('Angemeldet ✅'); render(el); } catch (e) { toast('Code ungültig', 3000); } };
  $('#mGo', el).onclick = go; $('#mCode', el).onkeydown = e => { if (e.key === 'Enter') go(); };
  $('#mOut', el).onclick = async () => { await O.signOut(); render(el); };
}

async function renderAccount(el) {
  const u = O.online.user, p = O.online.profile || {}, factors = await O.mfaFactors().catch(() => []), mfa = factors.find(f => f.status === 'verified');
  const last = await kv.get('onlineLast', null), lv = levelOf(progress.xp).lv;
  el.innerHTML = `
  <section class="pagehead"><h1>Konto</h1><span class="row">${O.isAdmin() ? '<a class="btn sm" href="#/admin">Admin</a>' : ''}<button class="btn sm ghost" id="aOut">Abmelden</button></span></section>
  <section class="grid2">
    <div class="card form"><h2>Online-Profil</h2>
      <p class="small muted">Angemeldet als <b>${esc(u.email || u.phone || u.id)}</b>${p.role === 'admin' ? ' · <span class="prtag">Admin</span>' : ''}</p>
      <label class="f">Anzeigename (für andere sichtbar)<input class="inp" id="pName" maxlength="40" value="${esc(p.display_name || profile.name)}"></label>
      <label class="switch"><input type="checkbox" id="pPub" ${p.public_profile !== false ? 'checked' : ''}><span></span> <div class="swt">In Bestenlisten und bei Live-Fahrten sichtbar</div></label>
      <div class="row"><button class="btn sm" id="pSave">Speichern</button><button class="btn sm ghost" id="pAvatar" title="Avatar, Level und FTP ins Online-Profil übernehmen">Avatar übernehmen</button></div>
    </div>
    <div class="card form"><h2>Daten online</h2>
      <p class="small muted">Gleiches Format wie die Datei-Sicherung (Datenpaket mit Versionsnummer), Fotos bleiben lokal. Zuletzt: ${last ? new Date(last).toLocaleString('de-DE') : 'noch nie'}.</p>
      <div class="row"><button class="btn pri" id="sPush">⬆ Online sichern</button><button class="btn" id="sPull">⬇ Von online laden</button></div>
      <label class="switch"><input type="checkbox" id="sAuto" ${(await kv.get('onlineAuto', true)) ? 'checked' : ''}><span></span> <div class="swt">Nach jeder Fahrt automatisch sichern</div></label>
    </div>
  </section>
  <section class="card form"><h2>Sicherheit</h2>
    ${mfa ? `<p>🔐 Zwei-Faktor-Anmeldung ist <b>aktiv</b>${O.online.aal?.currentLevel === 'aal2' ? '' : ' (diese Sitzung ist noch nicht bestätigt)'}.</p><div class="row"><button class="btn sm ghost danger" id="mOff">2FA ausschalten</button></div>`
    : `<p class="muted">Schütze dein Konto mit einem zweiten Faktor (Authenticator-App wie Google Authenticator, Microsoft Authenticator, 1Password oder Aegis).${O.isAdmin() ? ' <b>Für Admin-Funktionen ist 2FA Pflicht.</b>' : ''}</p><div class="row"><button class="btn sm pri" id="mOn">2FA einrichten</button></div><div id="mBox"></div>`}
  </section>`;
  $('#aOut', el).onclick = async () => { await O.signOut(); render(el); };
  $('#pSave', el).onclick = async () => { try { await O.updateProfile({ display_name: $('#pName', el).value.trim() || 'Fahrer', public_profile: $('#pPub', el).checked }); toast('Gespeichert'); } catch (e) { toast(e.message, 4000); } };
  $('#pAvatar', el).onclick = async () => { try { await O.updateProfile({ avatar: { jersey: profile.jersey, helmet: profile.helmet, bikeColor: profile.bikeColor, skin: profile.skin, av: profile.av }, level: lv, ftp: profile.ftp, weight_kg: profile.kg }); toast('Übernommen'); } catch (e) { toast(e.message, 4000); } };
  const S = await import('../online/sync.js');
  $('#sPush', el).onclick = async e => { e.target.disabled = true; try { const n = await S.pushVault(); toast(`Online gesichert (${(n / 1024).toFixed(0)} KB)`); render(el); } catch (err) { toast(err.message, 5000); e.target.disabled = false; } };
  $('#sPull', el).onclick = async () => {
    if (!(await dialog({ title: 'Von online laden?', html: '<p class="muted">Der Online-Stand wird übernommen und mit diesem Gerät zusammengeführt (gleiche Einträge werden überschrieben).</p>', buttons: [{ label: 'Abbrechen', value: false }, { label: 'Laden', value: true, cls: 'pri' }] }))) return;
    try { const r = await S.pullVault(); if (!r) return toast('Online liegt noch nichts', 3000); toast(`Geladen: ${r.rides} Fahrten, App startet neu`); setTimeout(() => location.reload(), 1200); } catch (err) { toast(err.message, 5000); }
  };
  $('#sAuto', el).onchange = e => kv.set('onlineAuto', e.target.checked);
  if (mfa) $('#mOff', el).onclick = async () => { if (await dialog({ title: '2FA ausschalten?', html: '<p class="muted">Dein Konto ist danach nur noch mit dem Passwort geschützt.</p>', buttons: [{ label: 'Abbrechen', value: false }, { label: 'Ausschalten', value: true, cls: 'danger' }] })) { try { await O.mfaRemove(mfa.id); render(el); } catch (e) { toast(e.message, 5000); } } };
  else $('#mOn', el).onclick = async () => {
    try {
      for (const f of factors.filter(x => x.status !== 'verified')) await O.mfaRemove(f.id).catch(() => { });
      const d = await O.mfaEnroll();
      $('#mBox', el).innerHTML = `<div class="mfabox"><img src="${d.totp.qr_code}" alt="QR-Code für die Authenticator-App" width="180" height="180"><div class="form"><p class="small">1. QR-Code mit der Authenticator-App scannen.<br>Oder Schlüssel eintippen: <code>${esc(d.totp.secret)}</code></p><p class="small">2. Angezeigten Code eingeben:</p><input class="inp otp" id="mCode" inputmode="numeric" maxlength="7" placeholder="123 456"><div class="row"><button class="btn pri" id="mVer">Aktivieren</button></div></div></div>`;
      $('#mVer', el).onclick = async () => { try { await O.mfaVerify(d.id, $('#mCode', el).value); toast('2FA aktiv 🔐'); render(el); } catch (e) { toast('Code ungültig', 3000); } };
    } catch (e) { toast(e.message, 5000); }
  };
}
