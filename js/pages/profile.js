// Profil, Avatar, Grafik, Ton, Datensicherung, NAS und Strava
import { $, esc, toast, dialog, download, fmtDate, bus } from '../util.js';
import { profile, saveProfile, progress, levelOf } from '../state.js';
import { UNLOCKS } from '../game.js';
import { backup, restore, wipeAll, usage, persist } from '../db.js';
import { autoQuality } from '../world.js';
import { sync, saveSyncCfg, testConnection, pushNow, pullNow, dsmLogin, dsmLogout, normalizeHost, renameDevice } from '../sync.js';
import { sound } from '../sound.js';
import { strava, connected as stravaConnected, setApp as setStravaApp, setAuto as setStravaAuto, authorize as stravaAuthorize, disconnect as stravaDisconnect } from '../strava.js';

const F = (id, label, type, extra = '', hint = '') => `<label class="f">${label}<input class="inp" id="${id}" type="${type}" ${extra} value="${esc(profile[id])}">${hint ? `<span class="small muted">${hint}</span>` : ''}</label>`;
const SW = (id, label) => `<label class="switch"><input type="checkbox" id="${id}" ${profile[id] ? 'checked' : ''}><span></span> ${label}</label>`;

// Strava: eigene API-App, Schlüssel bleiben nur in diesem Browser
function stravaCard(box) {
  const c = strava.cfg || {}, con = stravaConnected();
  box.innerHTML = `<h2>Strava</h2>
    ${con ? `<p>✅ Verbunden${c.athlete ? ' als <b>' + esc(c.athlete) + '</b>' : ''}. Fahrten werden mit passendem Titel und Beschreibung direkt hochgeladen.</p>
      <label class="switch"><input type="checkbox" id="sAuto" ${c.auto ? 'checked' : ''}><span></span> Jede gespeicherte Fahrt automatisch hochladen</label>
      <div class="row"><button class="btn sm ghost danger" id="sOff">Verbindung trennen</button></div>`
    : `<p class="small muted">Für den direkten Upload brauchst du eine eigene, kostenlose Strava-API-App. Client-ID und Client-Secret bleiben nur in diesem Browser, sie landen weder in der Sicherungsdatei noch auf dem NAS.</p>
      <ol class="tips small muted"><li>Auf <b>strava.com/settings/api</b> eine App anlegen (Name z. B. „VeloVerse“, Website beliebig).</li><li>Als <b>Authorization Callback Domain</b> eintragen: <code>${esc(location.hostname)}</code></li><li>Client-ID und Client-Secret hier eintragen und „Mit Strava verbinden“ tippen.</li></ol>
      <div class="grid2 tight"><label class="f">Client-ID<input class="inp" id="sId" inputmode="numeric" value="${esc(c.clientId || '')}"></label><label class="f">Client-Secret<input class="inp" id="sSec" type="password" autocomplete="off" value="${esc(c.clientSecret || '')}"></label></div>
      <label class="switch"><input type="checkbox" id="sAuto2" ${c.auto !== false ? 'checked' : ''}><span></span> Danach jede gespeicherte Fahrt automatisch hochladen</label>
      <div class="row"><button class="btn pri sm" id="sCon">Mit Strava verbinden</button></div>`}
    <p class="small muted">Fotos nimmt die Strava-Schnittstelle nicht an. Übersichtsbild und Fahrtfoto speichert die App beim Upload mit, du kannst sie in der Strava-App zur Aktivität hinzufügen.</p>`;
  box.querySelector('#sAuto')?.addEventListener('change', e => setStravaAuto(e.target.checked));
  box.querySelector('#sOff')?.addEventListener('click', async () => { await stravaDisconnect(); toast('Strava getrennt'); stravaCard(box); });
  box.querySelector('#sCon')?.addEventListener('click', async () => {
    const id = box.querySelector('#sId').value.trim(), sec = box.querySelector('#sSec').value.trim();
    if (!/^\d+$/.test(id) || sec.length < 20) { toast('Bitte Client-ID (Zahl) und Client-Secret aus den Strava-API-Einstellungen eintragen', 5000); return; }
    await setStravaApp(id, sec, box.querySelector('#sAuto2').checked); stravaAuthorize();
  });
}

// NAS-Speicher: Synology-Anmeldung (DSM-Konto mit 2FA) oder WebDAV
function nasCard(box) {
  const c = sync.cfg || { mode: 'dsm', auto: true };
  const mode = c.mode || (c.url ? 'webdav' : 'dsm'), on = mode === 'dsm' ? !!c.host : !!c.url;
  const status = () => sync.busy ? '⏳ Abgleich läuft …' : sync.needLogin ? '<span style="color:var(--warn)">🔑 Anmeldung abgelaufen, bitte neu anmelden</span>' : sync.error ? `<span style="color:#ff8b97">⚠ ${esc(sync.error)}</span>` : sync.last ? `✅ Zuletzt abgeglichen: ${fmtDate(sync.last)}` : on ? 'Noch nicht abgeglichen' : 'Nicht eingerichtet';
  box.innerHTML = `<h2>NAS-Speicher (Synology)</h2>
    <p class="small muted">Zusätzlich zum Browser landen alle Daten in einem Ordner auf deinem NAS: <code>state.json</code> mit Einstellungen und Fortschritt, jede Fahrt als eigene Datei, Fotos als JPG. Fotos der Fahrten werden mitgespeichert.</p>
    <p class="small muted">Ein neu verbundenes Gerät holt zuerst den Stand vom NAS und überschreibt dort nichts. Danach gewinnt bei jeder Einstellung die zuletzt geänderte Seite; Fahrten und Fotos werden nur ergänzt, gelöschte Fahrten verschwinden überall.</p>
    <div class="seg sm" id="nMode"><button data-m="dsm" aria-pressed="${mode === 'dsm'}">Synology-Anmeldung</button><button data-m="webdav" aria-pressed="${mode === 'webdav'}">WebDAV</button></div>
    ${mode === 'dsm' ? (c.host && (c.sid || c.pass) && !sync.needLogin ? `
      <p>Angemeldet als <b>${esc(c.user)}</b> auf <b>${esc(c.host)}</b><br><span class="small muted">Ordner: ${esc(c.folder)}${c.pass ? ' · bleibt angemeldet' : ''}${c.did ? ' · Gerät für 2FA gemerkt' : ''}</span></p>
      <label class="switch"><input type="checkbox" id="nAuto" ${c.auto ? 'checked' : ''}><span></span> Automatisch abgleichen (beim Start und nach jeder Änderung)</label>
      <div class="row"><button class="btn sm" id="nPush">Jetzt abgleichen</button><button class="btn sm" id="nPull">Alles vom NAS übernehmen</button><button class="btn sm ghost" id="nLogout">Abmelden</button></div>`
    : `<p class="small muted">Anmeldung wie in DSM, Synology Drive oder Photos, mit deinem DSM-Konto und, falls aktiviert, dem 2FA-Code aus der Authenticator-App.</p>
      <div class="row"><button class="btn pri sm" id="nLogin">${c.host ? 'Neu anmelden' : 'Beim NAS anmelden'}</button>${c.host ? '<button class="btn sm ghost danger" id="nOff">Trennen</button>' : ''}</div>`)
    : `<label class="f">WebDAV-Adresse des Ordners<input class="inp" id="nUrl" type="url" placeholder="https://dav.deine-domain.de/home/veloverse" value="${esc(c.url || '')}"></label>
      <div class="grid2 tight"><label class="f">Benutzer<input class="inp" id="nUser" autocomplete="username" value="${esc(c.user || '')}"></label><label class="f">Passwort<input class="inp" id="nPass" type="password" autocomplete="current-password" value="${esc(c.pass || '')}"></label></div>
      <label class="switch"><input type="checkbox" id="nAuto" ${c.auto !== false ? 'checked' : ''}><span></span> Automatisch abgleichen</label>
      <p class="small muted">WebDAV kennt keine 2FA, das Passwort bleibt dafür in diesem Browser. Besser die Synology-Anmeldung nutzen.</p>
      <div class="row"><button class="btn sm" id="nSave">Speichern und testen</button><button class="btn sm" id="nPush">Jetzt abgleichen</button><button class="btn sm" id="nPull">Alles vom NAS übernehmen</button>${c.url ? '<button class="btn sm ghost danger" id="nOff">Trennen</button>' : ''}</div>`}
    <div class="small" id="nStat">${status()}</div>
    ${on && sync.device ? `<div class="devlist small"><label class="f">Name dieses Geräts<input class="inp" id="nDev" value="${esc(sync.device.name)}" maxlength="40"></label>
      ${Object.keys(sync.devices || {}).length ? `<div class="muted">Mit diesem NAS-Ordner verbunden:</div><ul class="tips">${Object.entries(sync.devices).sort((a, b) => b[1].last.localeCompare(a[1].last)).map(([id, d]) => `<li><b>${esc(d.name)}</b>${id === sync.device.id ? ' (dieses Gerät)' : ''} · zuletzt ${fmtDate(d.last)}</li>`).join('')}</ul><div class="muted">Stand Nr. ${sync.rev ?? '–'}</div>` : ''}</div>` : ''}
    <details class="small muted"><summary>Einrichtung auf der Synology</summary>
      <p>Der Browser darf das NAS von <b>${esc(location.origin)}</b> aus nur ansprechen, wenn das NAS das erlaubt. Die DSM-Anmeldeseite selbst lässt sich aus Sicherheitsgründen nicht in fremde Seiten einbetten, darum meldet sich die App direkt über die DSM-Schnittstelle an, mit denselben Zugangsdaten und 2FA.</p>
      <ol class="tips">
        <li>Das NAS braucht HTTPS mit gültigem Zertifikat (Systemsteuerung → Sicherheit → Zertifikat, z. B. Let’s Encrypt für deine Domain).</li>
        <li>Systemsteuerung → Anmeldeportal → Erweitert → <b>Reverse Proxy</b> → Erstellen. Quelle: HTTPS, z. B. <code>nas-api.deine-domain.de</code>, Port 443. Ziel: HTTPS, <code>localhost</code>, Port <b>5001</b> (für WebDAV: 5006).</li>
        <li>Im selben Eintrag unter „Benutzerdefinierte Kopfzeile“ hinzufügen:<br><code>Access-Control-Allow-Origin</code> = <code>${esc(location.origin)}</code>${mode === 'webdav' ? '<br><code>Access-Control-Allow-Methods</code> = <code>GET, PUT, DELETE, MKCOL, PROPFIND, OPTIONS</code><br><code>Access-Control-Allow-Headers</code> = <code>Authorization, Content-Type, Depth</code>' : ''}</li>
        <li>${mode === 'dsm' ? 'Als NAS-Adresse dann <code>https://nas-api.deine-domain.de</code> eintragen. Als Ordner z. B. <code>/home/Drive/VeloVerse</code> (erscheint in Synology Drive unter „Meine Dateien“) oder einen freigegebenen Ordner wie <code>/Sport/VeloVerse</code>.' : 'Das Paket „WebDAV Server“ installieren und die Ordner-Adresse über den Reverse Proxy eintragen.'}</li>
        <li>Am besten ein eigenes DSM-Konto nur mit Zugriff auf diesen Ordner und auf File Station verwenden.</li>
        <li><b>NAS hinter einem eigenen Server (VPS, Tunnel)</b>: Die Kopfzeile dann im Proxy auf dem VPS setzen statt in DSM, die NAS-Adresse ist die öffentliche Subdomain (Port 443).<br>nginx: <code>add_header Access-Control-Allow-Origin "${esc(location.origin)}" always;</code>${mode === 'webdav' ? ' <code>add_header Access-Control-Allow-Methods "GET, PUT, DELETE, MKCOL, PROPFIND, OPTIONS" always; add_header Access-Control-Allow-Headers "Authorization, Content-Type, Depth" always;</code>' : ''}<br>Caddy: <code>header Access-Control-Allow-Origin "${esc(location.origin)}"</code><br>Weiterleiten muss der Proxy dabei mindestens den Pfad <code>/webapi/</code> an DSM (Port 5001).</li>
      </ol>
    </details>`;
  const stat = () => { const s = box.querySelector('#nStat'); if (s) s.innerHTML = status(); };
  const off = bus.on('sync', stat); const mo = new MutationObserver(() => { if (!box.isConnected) { off(); mo.disconnect(); } }); mo.observe(document.body, { childList: true, subtree: true });
  box.querySelector('#nMode').onclick = async e => { const b = e.target.closest('[data-m]'); if (!b || b.dataset.m === mode) return; if (on && !(await dialog({ title: 'Verfahren wechseln?', html: '<p class="muted">Die aktuelle NAS-Verbindung wird getrennt. Die Daten im Browser und auf dem NAS bleiben.</p>', buttons: [{ label: 'Abbrechen', value: false }, { label: 'Wechseln', value: true, cls: 'pri' }] }))) return; await dsmLogout(); await saveSyncCfg({ mode: b.dataset.m, auto: true }); nasCard(box); };
  box.querySelector('#nAuto')?.addEventListener('change', async e => { sync.cfg.auto = e.target.checked; await saveSyncCfg(sync.cfg); });
  box.querySelector('#nPush')?.addEventListener('click', () => connectSync(box));
  box.querySelector('#nPull')?.addEventListener('click', async () => {
    if (!(await dialog({ title: 'Alles vom NAS übernehmen?', html: '<p class="muted">Einstellungen, Profil, Fortschritt und Pläne werden durch den Stand auf dem NAS ersetzt. Fahrten und Fotos auf diesem Gerät bleiben und werden ergänzt.</p>', buttons: [{ label: 'Abbrechen', value: false }, { label: 'Übernehmen', value: true, cls: 'pri' }] }))) return;
    try { const r = await pullNow(); if (r) { toast(`Vom NAS übernommen (${r.rides} neue Fahrten), App wird neu geladen`); setTimeout(() => location.reload(), 1200); } } catch (e) { }
  });
  box.querySelector('#nDev')?.addEventListener('change', e => renameDevice(e.target.value));
  box.querySelector('#nOff')?.addEventListener('click', async () => { await dsmLogout(); await saveSyncCfg(null); sync.last = null; sync.error = null; sync.needLogin = false; nasCard(box); toast('NAS getrennt, die Daten im Browser bleiben'); });
  box.querySelector('#nLogout')?.addEventListener('click', async () => { await dsmLogout(); nasCard(box); toast('Abgemeldet'); });
  box.querySelector('#nLogin')?.addEventListener('click', async () => { if (await loginDialog()) { toast('Angemeldet, Verbindung klappt'); nasCard(box); connectSync(box); } });
  box.querySelector('#nSave')?.addEventListener('click', async () => {
    const cfg = { mode: 'webdav', url: normalizeHost(box.querySelector('#nUrl').value), user: box.querySelector('#nUser').value.trim(), pass: box.querySelector('#nPass').value, auto: box.querySelector('#nAuto').checked };
    if (!/^https?:\/\//.test(cfg.url)) { toast('Bitte eine vollständige Adresse mit https:// eingeben'); return; }
    if (location.protocol === 'https:' && cfg.url.startsWith('http:')) { toast('Die App läuft über https, das NAS muss auch über https erreichbar sein', 5000); return; }
    await saveSyncCfg(cfg); sync.error = null;
    try { await testConnection(); toast('Verbindung klappt'); nasCard(box); connectSync(box); }
    catch (e) { sync.error = e.message === 'Failed to fetch' ? 'NAS nicht erreichbar oder Zugriff nicht freigegeben (siehe Einrichtung)' : e.message; stat(); }
  });
}

// Abgleichen; hat sich dabei lokal etwas geändert (z. B. beim ersten Verbinden), die App neu laden
async function connectSync(box) {
  try {
    const r = await pushNow(); if (!r) return;
    if (r.pulled) { toast(sync.info || `Neuerer Stand vom NAS übernommen (${r.rides} Fahrten), App wird neu geladen`, 5000); sync.info = ''; setTimeout(() => location.reload(), 2500); }
    else { toast(`Abgeglichen${r.up.rides || r.up.shots ? ` (${r.up.rides} Fahrten, ${r.up.shots} Fotos hochgeladen)` : ''}`); nasCard(box); }
  } catch (e) { }
}

// Anmeldedialog wie bei den Synology-Apps: Adresse, Konto, Passwort, bei Bedarf 2FA-Code
function loginDialog() {
  const c = sync.cfg || {};
  return new Promise(res => {
    const w = document.createElement('div'); w.className = 'modal on';
    w.innerHTML = `<form class="card dlg form syno" autocomplete="on">
      <div class="syno-head"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="7" rx="1.5"/><rect x="3" y="13" width="18" height="7" rx="1.5"/><circle cx="7" cy="7.5" r="1"/><circle cx="7" cy="16.5" r="1"/></svg><div><h2 style="margin:0">Beim NAS anmelden</h2><div class="small muted">Synology DSM-Konto</div></div></div>
      <label class="f">NAS-Adresse (HTTPS, Port 443)<input class="inp" name="host" type="text" inputmode="url" required placeholder="nas.deine-domain.de" value="${esc(c.host || '')}"></label>
      <label class="f">Ordner für VeloVerse<input class="inp" name="folder" required placeholder="/home/Drive/VeloVerse" value="${esc(c.folder || '/home/Drive/VeloVerse')}"></label>
      <label class="f">Benutzername<input class="inp" name="user" required autocomplete="username" value="${esc(c.user || '')}"></label>
      <label class="f">Passwort<input class="inp" name="pass" type="password" required autocomplete="current-password"></label>
      <label class="f" id="otpBox" hidden>Bestätigungscode (2FA)<input class="inp" name="otp" inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="6-stelliger Code aus der Authenticator-App"></label>
      <label class="switch"><input type="checkbox" name="remember" ${c.pass ? 'checked' : ''}><span></span> Angemeldet bleiben (Passwort in diesem Browser speichern)</label>
      <label class="switch"><input type="checkbox" name="auto" ${c.auto !== false ? 'checked' : ''}><span></span> Automatisch abgleichen</label>
      <div class="small" id="lgMsg"></div>
      <div class="row end"><button type="button" class="btn ghost" data-x>Abbrechen</button><button class="btn pri" type="submit">Anmelden</button></div>
    </form>`;
    document.body.appendChild(w);
    const f = w.querySelector('form'), msg = w.querySelector('#lgMsg');
    const close = v => { w.remove(); res(v); };
    w.querySelector('[data-x]').onclick = () => close(false);
    (c.host ? f.pass : f.host).focus();
    f.onsubmit = async e => {
      e.preventDefault();
      const v = Object.fromEntries(new FormData(f)); v.remember = !!f.remember.checked; v.auto = !!f.auto.checked;
      if (location.protocol === 'https:') v.host = normalizeHost(v.host); f.host.value = v.host;

      msg.textContent = 'Anmelden …'; f.querySelector('[type=submit]').disabled = true;
      try { await dsmLogin(v); msg.textContent = 'Verbindung wird geprüft …'; await testConnection(); close(true); }
      catch (err) {
        f.querySelector('[type=submit]').disabled = false;
        if (err.code === 403) { w.querySelector('#otpBox').hidden = false; f.otp.focus(); msg.textContent = 'Dein Konto nutzt 2FA: bitte den Code aus der Authenticator-App eingeben.'; return; }
        if (err.code === 404) { f.otp.value = ''; f.otp.focus(); }
        msg.innerHTML = `<span style="color:#ff8b97">${esc(err.message === 'Failed to fetch' ? 'NAS nicht erreichbar oder Zugriff von dieser Adresse nicht freigegeben (siehe Einrichtung).' : err.message)}</span>`;
      }
    };
  });
}

export async function render(el) {
  const u = await usage(), pers = await persist(), lv = levelOf(progress.xp).lv;
  el.innerHTML = `
  <section class="pagehead"><h1>Profil</h1><span class="row"><a class="btn sm" href="#/ridesettings">Fahransicht</a><button class="btn sm" id="onbAgain">Einrichtung starten</button><a class="btn sm" href="#/help">Anleitung</a></span></section>
  <section class="grid2">
    <div class="card form"><h2>Fahrer</h2>
      ${F('name', 'Name', 'text', 'maxlength="30"')}
      <div class="grid2 tight">${F('ftp', 'FTP (Watt)', 'number', 'min="50" max="600" inputmode="numeric"')}${F('kg', 'Gewicht (kg)', 'number', 'min="30" max="200" step="0.5" inputmode="decimal"')}</div>
      <div class="grid2 tight">${F('hrMax', 'Max. Puls', 'number', 'min="120" max="230" inputmode="numeric"')}${F('bike', 'Radgewicht (kg)', 'number', 'min="5" max="25" step="0.5" inputmode="decimal"')}</div>
      <div class="grid2 tight">${F('age', 'Alter', 'number', 'min="10" max="99" inputmode="numeric"')}<label class="f">Geschlecht (für Kalorien aus dem Puls)<select class="inp" id="sex"><option value="m" ${profile.sex !== 'f' ? 'selected' : ''}>männlich</option><option value="f" ${profile.sex === 'f' ? 'selected' : ''}>weiblich</option></select></label></div>
      <div class="grid2 tight">${F('hrRest', 'Ruhepuls', 'number', 'min="30" max="100" inputmode="numeric"')}<span></span></div>
      <label class="f">Sitzposition<select class="inp" id="cda">${[['0.40', 'Aufrecht (CdA 0,40)'], ['0.32', 'Oberlenker (CdA 0,32)'], ['0.28', 'Unterlenker (CdA 0,28)'], ['0.24', 'Zeitfahren (CdA 0,24)']].map(([v, l]) => `<option value="${v}" ${+v === +profile.cda ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <p class="small muted">Leistungszonen: ${[['Z2', .56, .75], ['Z3', .76, .9], ['Z4', .91, 1.05], ['Z5', 1.06, 1.2]].map(([z, a, b]) => `${z} ${Math.round(a * profile.ftp)}–${Math.round(b * profile.ftp)} W`).join(' · ')}</p>
    </div>
    <div class="card form"><h2>Trainer und Fahrgefühl</h2>
      <div class="grid2 tight">${F('circ', 'Radumfang (mm)', 'number', 'min="1800" max="2400" inputmode="numeric"', '700×25c: 2105, 700×28c: 2136')}${F('maxW', 'Max. Trainerleistung (W)', 'number', 'min="200" max="2500" inputmode="numeric"', 'D100: 600 W')}</div>
      <label class="f">Steigungsgefühl bei virtuellen Gängen: <b id="gdV">${profile.gearDiff} %</b><input type="range" id="gearDiff" min="25" max="100" step="5" value="${profile.gearDiff}"></label>
      <label class="f">Steigungsgefühl im Steigungsmodus: <b id="sdV">${profile.simDiff} %</b><input type="range" id="simDiff" min="10" max="100" step="5" value="${profile.simDiff}"></label>
      ${SW('autoPause', 'Automatische Pause, wenn du aufhörst zu treten')}
      ${SW('autoShots', 'Automatische Fotos während der Fahrt')}
      <label class="f">Foto-Abstand (Minuten)<input class="inp" id="shotEvery" type="number" min="3" max="60" value="${profile.shotEvery}"></label>
    </div>
  </section>
  <section class="grid2">
    <div class="card form"><h2>Avatar</h2>
      <p class="small muted">Weitere Farben schaltest du mit höheren Leveln frei (aktuell Level ${lv}).</p>
      ${['jersey', 'helmet', 'bikeColor'].map(k => `<div class="f">${{ jersey: 'Trikot', helmet: 'Helm', bikeColor: 'Rahmen' }[k]}<div class="swatches" data-k="${k}">${UNLOCKS.map(u => u.lv <= lv ? `<button style="background:${u.c}" data-c="${u.c}" aria-pressed="${profile[k] === u.c}" aria-label="${u.name || u.c}" title="${u.name || ''}"></button>` : `<button class="locked" style="background:${u.c}" disabled title="Ab Level ${u.lv}" aria-label="Gesperrt bis Level ${u.lv}"><small>${u.lv}</small></button>`).join('')}${lv >= 10 ? `<input type="color" value="${profile[k]}" data-k="${k}" title="Freie Farbe">` : '<span class="small muted">Freie Farbwahl ab Level 10</span>'}</div></div>`).join('')}
      <div class="f">Hautton<div class="swatches" data-k="skin">${['#f1c7a5', '#e3b18c', '#c99272', '#9a6a4b', '#6b4532'].map(c => `<button style="background:${c}" data-c="${c}" aria-pressed="${profile.skin === c}"></button>`).join('')}</div></div>
    </div>
    <div class="card form"><h2>Grafik</h2>
      <label class="f">Qualität der 3D-Welt<select class="inp" id="quality">${[['auto', 'Automatisch (' + ({ high: 'hoch', medium: 'mittel' }[autoQuality()]) + ')'], ['high', 'Hoch: Schatten, weite Sicht'], ['medium', 'Mittel: für Tablets'], ['low', 'Niedrig: für ältere Geräte']].map(([v, l]) => `<option value="${v}" ${profile.quality === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <p class="small muted">Ruckelt die Fahrt, senkt die App die Auflösung automatisch. Auf schwachen Geräten hilft zusätzlich „Mittel“ oder „Niedrig“.</p>
      <h2 style="margin-top:18px">Daten</h2>
      <p class="small muted">Gespeichert werden Profil, Einstellungen, gekoppelte Geräte und Tastenbelegung, Fahrten mit Fotos, Level, Abzeichen, Missionen, Bestzeiten, Trainingsplan-Fortschritt sowie eigene Strecken, Pläne und Workouts. Die Sicherung enthält alles davon in einer Datei, aber keine Passwörter oder Schlüssel.</p>
      <p class="small muted">Alles wird in diesem Browser unter <b>${esc(location.origin)}</b> gespeichert. Unter einer anderen Adresse siehst du andere Daten. Sichere regelmäßig oder richte unten den NAS-Speicher ein.</p>
      <p class="small muted">Belegt: ${u ? (u.usage / 1048576).toFixed(1).replace('.', ',') + ' MB' : 'unbekannt'} · Dauerhafter Speicher: ${pers ? 'ja' : 'nicht bestätigt'}</p>
      <div class="row"><button class="btn" id="bk">Sicherung herunterladen</button><label class="btn">Sicherung einspielen<input type="file" id="rs" accept=".json" hidden></label></div>
      <div class="row"><button class="btn ghost danger" id="wp">Alle lokalen Daten löschen</button></div>
    </div>
  </section>
  <section class="grid2">
    <div class="card form"><h2>Ton</h2>
      ${SW('soundOn', 'Ton an (in der Fahrt auch mit Taste M)')}
      ${[['volMaster', 'Gesamtlautstärke'], ['volAmb', 'Umgebung (Wind, Reifen, Natur)'], ['volFx', 'Effekte (Countdown, Tore, Erfolge)']].map(([k, l]) => `<label class="f">${l}: <b id="${k}V">${Math.round(profile[k] * 100)} %</b><input type="range" id="${k}" min="0" max="1" step="0.05" value="${profile[k]}"></label>`).join('')}
      <div class="row"><button class="btn sm" id="sndTest">Probehören</button></div>
      <h2 style="margin-top:14px">Trainer-Hinweise</h2>
      ${SW('tips', 'Tipps zu Kadenz und Fahrweise in Workouts anzeigen')}
      ${SW('drinkTips', 'Ans Trinken erinnern (alle 15 Minuten)')}
      ${SW('tripleSkip', 'Zwift Click: dreimal schnell Plus springt zum nächsten Intervall, dreimal Minus wiederholt es (am Anfang: eins zurück)')}
      ${SW('ergSoft', 'Sanfter ERG-Einstieg: große Wattsprünge über 5 Sekunden hochfahren')}
    </div>
    <div class="card form" id="nasCard"></div>
  </section>
  <section class="card form" id="stravaCard"></section>`;
  nasCard($('#nasCard', el)); stravaCard($('#stravaCard', el));
  $('#onbAgain', el).onclick = () => import('../onboard.js').then(m => m.onboarding(true));
  for (const k of ['soundOn', 'tips', 'drinkTips', 'tripleSkip', 'ergSoft']) $('#' + k, el).onchange = e => { profile[k] = e.target.checked; saveProfile(); sound.apply(); };
  for (const k of ['volMaster', 'volAmb', 'volFx']) $('#' + k, el).oninput = e => { profile[k] = +e.target.value; $('#' + k + 'V', el).textContent = Math.round(profile[k] * 100) + ' %'; saveProfile(); sound.apply(); };
  $('#sndTest', el).onclick = () => { sound.unlock(); sound.fanfare(); };
  const num = ['ftp', 'kg', 'hrMax', 'bike', 'circ', 'maxW', 'shotEvery', 'age', 'hrRest'];
  $('#sex', el).onchange = e => { profile.sex = e.target.value; saveProfile(); toast('Gespeichert', 1200); };
  for (const k of ['name', ...num]) $('#' + k, el).onchange = e => { const v = num.includes(k) ? parseFloat(e.target.value) : e.target.value.trim(); if (num.includes(k) && isNaN(v)) return; if (k === 'ftp' && v !== profile.ftp) profile.ftpHistory = [...(profile.ftpHistory || []), { date: new Date().toISOString(), ftp: v, source: 'manuell' }]; profile[k] = v; saveProfile(); toast('Gespeichert', 1200); };
  $('#cda', el).onchange = e => { profile.cda = +e.target.value; saveProfile(); };
  $('#quality', el).onchange = e => { profile.quality = e.target.value; saveProfile(); };
  for (const k of ['autoPause', 'autoShots']) $('#' + k, el).onchange = e => { profile[k] = e.target.checked; saveProfile(); };
  $('#gearDiff', el).oninput = e => { profile.gearDiff = +e.target.value; $('#gdV', el).textContent = profile.gearDiff + ' %'; saveProfile(); };
  $('#simDiff', el).oninput = e => { profile.simDiff = +e.target.value; $('#sdV', el).textContent = profile.simDiff + ' %'; saveProfile(); };
  el.querySelectorAll('.swatches').forEach(sw => {
    sw.onclick = e => { const b = e.target.closest('[data-c]'); if (!b) return; profile[sw.dataset.k] = b.dataset.c; saveProfile(); for (const x of sw.querySelectorAll('[data-c]')) x.setAttribute('aria-pressed', String(x === b)); };
    sw.oninput = e => { if (e.target.type === 'color') { profile[sw.dataset.k] = e.target.value; saveProfile(); } };
  });
  $('#bk', el).onclick = async () => { download('veloverse-sicherung-' + new Date().toISOString().slice(0, 10) + '.json', await backup(), 'application/json'); };
  $('#rs', el).onchange = async e => { try { await restore(await e.target.files[0].text()); toast('Sicherung eingespielt, App wird neu geladen'); setTimeout(() => location.reload(), 1200); } catch (err) { toast('Fehler: ' + err.message, 5000); } };
  $('#wp', el).onclick = async () => {
    const nas = sync.cfg?.url;
    if (!(await dialog({ title: 'Alle lokalen Daten löschen?', html: `<p>In diesem Browser werden unwiderruflich gelöscht: Fahrten, Fotos, Fortschritt, Pläne, eigene Strecken und Workouts, Einstellungen, Geräte, NAS- und Strava-Zugang sowie der App-Cache.</p><p class="muted small">${nas ? 'Die Daten auf dem NAS bleiben erhalten und lassen sich danach mit „Vom NAS laden“ zurückholen.' : 'Ohne Sicherungsdatei oder NAS sind die Daten danach weg.'}</p>`, buttons: [{ label: 'Abbrechen', value: false }, { label: 'Endgültig löschen', value: true, cls: 'danger' }] }))) return;
    await wipeAll(); location.replace(location.pathname + '#/');
    setTimeout(() => location.reload(), 50);
  };
}
