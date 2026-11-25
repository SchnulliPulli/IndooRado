// Einstieg: Zustand laden, Router, Navigation
import { $, bus, toast, dialog, toggleFullscreen } from './util.js';
import { loadState, profile } from './state.js';
import { loadClickMap, setDemo, status, support, reconnectKnown } from './ble.js';
import { kv, persist } from './db.js';
import { ICON, avatarSvg } from './components.js';
import { loadPlan } from './plans.js';
import { loadSync, autoSync, sync, isConfigured, providerName, handleCloudRedirect } from './sync.js';
import { loadStrava, handleRedirect, strava, connected as stravaConnected } from './strava.js';

const PAGES = {
  '': () => import('./pages/start.js'), ride: () => import('./pages/ride.js'), summary: () => import('./pages/summary.js'),
  workouts: () => import('./pages/workouts.js'), plans: () => import('./pages/plans.js'), routes: () => import('./pages/routes.js'), history: () => import('./pages/history.js'),
  progress: () => import('./pages/progress.js'), profile: () => import('./pages/profile.js'), devices: () => import('./pages/devices.js'), help: () => import('./pages/help.js'), editor: () => import('./pages/editor.js'), planner: () => import('./pages/planner.js'), ridesettings: () => import('./pages/ridesettings.js'), companion: () => import('./pages/companion.js'),
  // Einstellungen: gleiche Module, anderer Ausschnitt
  avatar: () => import('./pages/avatar.js'),
  lobby: () => import('./pages/online.js'), players: () => import('./pages/online.js').then(m => ({ ...m, render: el => m.render(el, ['players']) })), account: () => import('./pages/account.js'), admin: () => import('./pages/admin.js'),
  sound: () => import('./pages/ridesettings.js').then(m => ({ ...m, render: el => m.render(el, ['sound']) })),
  appsettings: () => import('./pages/profile.js').then(m => ({ ...m, render: el => m.render(el, ['app']) })),
  connect: () => import('./pages/profile.js').then(m => ({ ...m, render: el => m.render(el, ['connect']) })),
};
// Hauptmenü: sechs Bereiche, Unterseiten als Reiter oben auf der Seite
const NAV = [
  { k: '', l: 'Start', i: 'home', also: ['companion'] },
  { k: 'workouts', l: 'Training', i: 'workout', tabs: [['workouts', 'Workouts'], ['plans', 'Trainingspläne']], also: ['editor', 'planner'] },
  { k: 'routes', l: 'Strecken', i: 'route' },
  { k: 'history', l: 'Aktivitäten', i: 'history', tabs: [['history', 'Verlauf'], ['progress', 'Fortschritt']], also: ['summary'] },
  { k: 'devices', l: 'Geräte', i: 'devices' },
  { k: 'lobby', l: 'Online', i: 'online', tabs: [['lobby', 'Lobby'], ['players', 'Wer ist online'], ['account', 'Konto'], ['admin', 'Admin']] },
  { k: 'profile', l: 'Einstellungen', i: 'profile', tabs: [['profile', 'Profil'], ['avatar', 'Avatar'], ['ridesettings', 'Fahransicht'], ['sound', 'Ton'], ['appsettings', 'App'], ['connect', 'Verbindungen'], ['help', 'Anleitung']] },
];
const groupOf = k => NAV.find(g => g.k === k || g.tabs?.some(t => t[0] === k) || g.also?.includes(k)) || null;
let current = null, currentKey = null;

function nav() {
  $('#nav').innerHTML = NAV.map(g => `<a href="#/${g.k}" data-k="${g.k}">${ICON[g.i]}<span>${g.l}</span></a>`).join('');
  $('#chips').innerHTML = ['trainer', 'hr', 'cad', 'click'].map(k => `<a class="chip" href="#/devices" data-d="${k}" title="${k}">${ICON[k]}</a>`).join('');
  const upd = () => { for (const c of document.querySelectorAll('#chips .chip')) c.dataset.st = status[c.dataset.d]; };
  bus.on('dev', upd); upd();
  // Cloud-Anzeige: sichtbar, sobald Daten außerhalb des Browsers landen (NAS-Abgleich oder Strava)
  const cc = document.createElement('a'); cc.className = 'chip cloudchip'; cc.href = '#/connect'; cc.id = 'cloudChip';
  cc.innerHTML = '<svg viewBox="0 0 24 24"><path d="M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.1 9.2 4.5 4.5 0 0 0 7 18Z"/></svg><i></i>';
  $('#chips').after(cc);
  const cloudUpd = () => {
    const nas = isConfigured() || !!(sync.cfg && (sync.cfg.host || sync.cfg.url || sync.cfg.clientId)), st = stravaConnected();
    cc.hidden = !nas && !st;
    const state = !nas ? 'strava' : sync.busy ? 'busy' : sync.needLogin ? 'login' : sync.error ? 'error' : sync.last ? 'on' : 'off';
    cc.dataset.st = state;
    const when = sync.last ? new Date(sync.last).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : 'noch nie';
    cc.title = [nas ? `Cloud-Speicher (${providerName()}): ${{ busy: 'Abgleich läuft', login: 'Anmeldung abgelaufen', error: 'Fehler: ' + sync.error, on: 'zuletzt abgeglichen ' + when, off: 'noch nicht abgeglichen' }[state]}` : '', st ? `Strava verbunden${strava.cfg?.auto ? ', Fahrten werden automatisch hochgeladen' : ''}` : ''].filter(Boolean).join(' · ');
  };
  bus.on('sync', cloudUpd); bus.on('strava', cloudUpd); setInterval(cloudUpd, 30000); cloudUpd(); window.__cloudUpd = cloudUpd;
  // Vollbild-Knopf in der Kopfleiste
  const fs = $('#fsBtn'), fsUpd = () => { const on = !!(document.fullscreenElement || document.webkitFullscreenElement); fs.innerHTML = on ? '<svg viewBox="0 0 24 24"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>' : ICON.full; fs.title = on ? 'Vollbild beenden' : 'Vollbild'; fs.dataset.st = on ? 'on' : 'off'; };
  fs.onclick = toggleFullscreen; document.addEventListener('fullscreenchange', fsUpd); document.addEventListener('webkitfullscreenchange', fsUpd); fsUpd();
  if (!document.documentElement.requestFullscreen && !document.documentElement.webkitRequestFullscreen) fs.hidden = true;
  // Anmelden-Knopf (nur wenn VeloVerse Online eingerichtet ist); angemeldet zeigt er Initiale und Namen
  const lb = document.createElement('a'); lb.className = 'btn sm loginbtn'; lb.href = '#/account'; lb.hidden = true;
  document.querySelector('.ridebtn').before(lb);
  const loginUpd = async () => {
    const O = await import('./online/client.js'); lb.__O = O;
    if (!O.configured()) { lb.hidden = true; return; }
    lb.hidden = false;
    if (O.loggedIn()) {
      const n = O.online.profile?.display_name || 'Konto', mfa = O.needsMfa();
      lb.className = 'loginbtn in'; lb.title = 'Angemeldet als ' + n + (mfa ? ' (2FA-Code fehlt noch)' : ''); lb.removeAttribute('href'); lb.setAttribute('role', 'button'); lb.tabIndex = 0;
      lb.innerHTML = `${avatarSvg(profile, 34)}${mfa ? '<i class="lbdot" title="2FA-Code fehlt"></i>' : ''}`;
    } else { lb.className = 'btn sm loginbtn'; lb.title = 'Anmelden oder registrieren'; lb.href = '#/account'; lb.removeAttribute('role'); lb.innerHTML = ICON.profile + '<span>Anmelden</span>'; }
  };
  bus.on('online', loginUpd); bus.on('profile', loginUpd); window.__loginUpd = loginUpd;
  // Wie viele andere sind online? (nur angemeldet)
  const oc = document.createElement('a'); oc.className = 'chip onlinechip'; oc.href = '#/players'; oc.hidden = true; lb.before(oc);
  bus.on('presence', async () => { const PR = await import('./online/presence.js'); const n = PR.P.peers.size; oc.hidden = !PR.P.ready; oc.innerHTML = `<i class="odot"></i><b>${n}</b>`; oc.title = n === 1 ? '1 anderer Spieler online' : n + ' andere Spieler online'; });
  // Angemeldet: Klick auf den Avatar öffnet ein kleines Menü
  const um = document.createElement('div'); um.className = 'usermenu'; um.hidden = true; document.body.appendChild(um);
  lb.addEventListener('click', e => {
    const O = lb.__O; if (!O?.loggedIn()) return; // abgemeldet: normaler Link zum Konto
    e.preventDefault(); if (!um.hidden) { um.hidden = true; return; }
    const n = (O.online.profile?.display_name || 'Fahrer').replace(/</g, '&lt;'), mail = (O.online.user?.email || '').replace(/</g, '&lt;');
    um.innerHTML = `<div class="umhead">${avatarSvg(profile, 44)}<div><b>${n}</b><small>${mail}</small></div></div><a href="#/account">👤 Konto und Datenschutz</a><a href="#/avatar">🎨 Avatar gestalten</a>${O.isAdmin() ? '<a href="#/admin">🛠️ Admin-Konsole</a>' : ''}<button data-um-out>↩︎ Abmelden</button>`;
    const r = lb.getBoundingClientRect(); um.style.top = (r.bottom + 8) + 'px'; um.style.right = Math.max(8, innerWidth - r.right) + 'px'; um.hidden = false;
  });
  um.addEventListener('click', async e => { if (e.target.closest('[data-um-out]')) { const O = await import('./online/client.js'); await O.signOut(); toast('Abgemeldet'); loginUpd(); if (currentKey === 'account') route(); } um.hidden = true; });
  document.addEventListener('click', e => { if (!e.target.closest('.usermenu,.loginbtn')) um.hidden = true; });
  addEventListener('hashchange', () => um.hidden = true);
  lb.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && lb.__O?.loggedIn()) { e.preventDefault(); lb.click(); } });
  // Handy: Sensoren, Cloud und Vollbild in einem Status-Knopf mit Ausklappmenü bündeln
  const box = document.createElement('div'); box.className = 'tbx'; box.id = 'tbx';
  $('#chips').before(box); box.append($('#chips'), cc, fs);
  const more = document.createElement('button'); more.className = 'chip tbmore'; more.id = 'tbMore'; more.setAttribute('aria-label', 'Geräte und Status'); more.setAttribute('aria-expanded', 'false');
  box.before(more);
  const sum = () => {
    const keys = ['trainer', 'hr', 'cad', 'click'], on = keys.filter(k => status[k] === 'on' || status[k] === 'demo').length, err = keys.some(k => status[k] === 'error');
    more.dataset.st = err ? 'error' : keys.some(k => status[k] === 'busy') ? 'busy' : on ? (status.trainer === 'demo' ? 'demo' : 'on') : 'off';
    more.innerHTML = ICON.devices + `<i class="tbn">${on}</i>`; more.title = on + ' von 4 Geräten verbunden';
  };
  bus.on('dev', sum); sum();
  const close = () => { box.classList.remove('open'); more.setAttribute('aria-expanded', 'false'); };
  more.onclick = e => { e.stopPropagation(); const o = box.classList.toggle('open'); more.setAttribute('aria-expanded', String(o)); };
  document.addEventListener('click', e => { if (!e.target.closest('#tbx')) close(); });
  addEventListener('hashchange', close);
}
async function route() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, query] = raw.split('?');
  const [key, ...params] = path.split('/');
  let k = key in PAGES ? key : '';
  // Handy-Ansicht: die Startseite ist dann die kompakte Ansicht (umschalten unter Einstellungen › App)
  if (k === '' && wantsPhoneView()) k = 'companion';
  // Laufende Fahrt beim Verlassen nicht verwerfen, sondern pausiert im Hintergrund parken
  let parked = false;
  if (currentKey === 'ride' && k !== 'ride') { const ride = await import('./pages/ride.js'); if (ride.isRiding()) { ride.park(); parked = true; } }
  if (!parked) { try { current?.leave?.(); } catch (e) { console.error(e); } }
  resumeBar(k);
  document.body.dataset.page = k || 'start';
  const grp = groupOf(k);
  for (const a of document.querySelectorAll('#nav a')) a.classList.toggle('on', a.dataset.k === grp?.k);
  const sub = $('#subnav');
  sub.hidden = !grp?.tabs || k === 'ride';
  sub.innerHTML = grp?.tabs ? grp.tabs.map(([t, l]) => `<a href="#/${t}" class="${t === k ? 'on' : ''}${t === 'admin' ? ' admintab' : ''}">${l}</a>`).join('') : '';
  window.__routeTok = (window.__routeTok || 0) + 1; // langsame Seiten prüfen damit, ob sie noch angezeigt werden sollen
  const el = $('#view'); el.innerHTML = '<div class="pageload"><div class="spinner"></div></div>';
  el.onclick = el.onchange = el.oninput = el.ondragover = el.ondrop = null;
  window.scrollTo(0, 0);
  try {
    const mod = await PAGES[k]();
    current = mod; currentKey = k;
    el.innerHTML = '';
    await mod.render(el, params.map(decodeURIComponent), query);
    sessionStorage.removeItem('vvReloaded');
    if (k === '' || k === 'companion') announce(el);
  } catch (e) {
    console.error(e);
    // Nach einem Update können kurz alte und neue Dateien gemischt im Browser liegen: einmal frisch laden
    if (/is not a function|does not provide an export|Failed to fetch dynamically imported module|Importing a module script failed/.test(String(e)) && !sessionStorage.getItem('vvReloaded')) {
      sessionStorage.setItem('vvReloaded', '1'); el.innerHTML = '<div class="pageload"><div class="spinner"></div></div>';
      try { for (const k of await caches.keys()) await caches.delete(k); } catch (_) { }
      location.reload(); return;
    }
    el.innerHTML = `<div class="card"><h2>Fehler beim Laden</h2><pre class="log">${String(e.stack || e).replace(/</g, '&lt;')}</pre></div>`;
  }
}

// Balken "Zurück zur Fahrt", solange eine pausierte Fahrt geparkt ist
async function resumeBar(k) {
  let bar = $('#resumeBar');
  const ride = await import('./pages/ride.js'), info = k !== 'ride' && ride.parkedInfo();
  if (!info) { bar?.remove(); return; }
  if (!bar) { bar = document.createElement('div'); bar.id = 'resumeBar'; bar.className = 'resumebar'; document.body.appendChild(bar); }
  bar.innerHTML = `<span>⏸ Fahrt pausiert · <b>${info}</b></span><span class="row"><button class="btn sm ghost" data-end>Beenden</button><a class="btn sm pri" href="#/ride">▶ Zurück zur Fahrt</a></span>`;
  bar.querySelector('[data-end]').onclick = () => { sessionStorage.setItem('endAfterResume', '1'); location.hash = '#/ride'; };
}

// Handy: Touch als Hauptbedienung und kleiner Bildschirm (kürzere Seite unter 520 px) oder schmales Hochformat
export function isPhone() {
  const coarse = matchMedia('(pointer: coarse)').matches, short = Math.min(screen.width, screen.height), ar = innerWidth / innerHeight;
  return coarse && (short < 520 || (ar < .7 && innerWidth < 600)) || /iPhone|Android.+Mobile/.test(navigator.userAgent);
}
export function wantsPhoneView() { const m = profile.phoneView || 'auto'; return m === 'always' || (m === 'auto' && isPhone()); }
async function announce(el) {
  const O = await import('./online/client.js'); if (!O.configured() || !O.online.ready || !O.loggedIn()) return; // nur angemeldet: sonst kein Kontakt zum Server
  try {
    const list = await (await import('./online/sync.js')).announcements(), seen = JSON.parse(localStorage.getItem('vvAnnSeen') || '[]');
    const box = document.createElement('div'); box.className = 'annbox';
    box.innerHTML = list.filter(a => !seen.includes(a.id)).map(a => `<div class="card ann ${a.level}" data-id="${a.id}"><div><b>${a.level === 'event' ? '🎉 ' : a.level === 'warn' ? '⚠️ ' : '📣 '}${a.title.replace(/</g, '&lt;')}</b>${a.body ? `<p class="small">${a.body.replace(/</g, '&lt;')}</p>` : ''}</div><button class="btn xs ghost" aria-label="Ausblenden">✕</button></div>`).join('');
    if (!box.children.length || !document.body.contains(el)) return;
    box.onclick = e => { const c = e.target.closest('button') && e.target.closest('.ann'); if (!c) return; seen.push(+c.dataset.id); localStorage.setItem('vvAnnSeen', JSON.stringify(seen.slice(-50))); c.remove(); };
    el.querySelector('.pagehead, .comphead')?.after(box) ?? el.prepend(box);
  } catch (e) { }
}
// Online angemeldet: Abgleich läuft über das Konto, NAS und andere Cloud-Speicher pausieren. Abgemeldet: zurück zum bisherigen Speicher.
async function bindOnline(O) {
  const S = await import('./sync.js');
  const on = O.loggedIn() && !O.needsMfa() && O.access().ok; // ohne Zugang (Testphase abgelaufen, gesperrt) kein Online-Abgleich
  document.body.classList.toggle('is-admin', O.isAdmin() && !O.needsMfa());
  const PR = await import('./online/presence.js'); if (on) PR.joinPresence().catch(() => { }); else PR.leavePresence();
  await S.setOnlineBackend(on ? { sb: O.online.client, uid: O.online.user.id } : null);
  window.__cloudUpd?.();
  if (on) {
    const pulled = await autoSync().catch(e => { toast('Online-Abgleich: ' + (sync.error || e.message), 5000); return null; });
    if (pulled) { await loadState(); await loadPlan(); toast(sync.info || 'Neuerer Stand aus dem Konto übernommen', sync.info ? 6000 : 3000); sync.info = ''; if (currentKey !== 'ride') route(); }
    (await import('./online/sync.js')).pushRides().catch(() => { });
  }
}
let bound = false;
function onlineHooks(O) {
  bindOnline(O);
  if (bound) return; bound = true;
  bus.on('online', ev => { if (['SIGNED_IN', 'SIGNED_OUT', 'MFA_CHALLENGE_VERIFIED', 'mfa', 'out'].includes(ev)) bindOnline(O); });
  bus.on('rideSaved', async () => { if (sync.online) (await import('./online/sync.js')).pushRides().catch(() => { }); });
}
async function init() {
  await loadState(); await loadClickMap(); await loadPlan();
  const { applyAppTheme } = await import('./pages/profile.js'); applyAppTheme();
  matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', applyAppTheme);
  nav();
  bus.on('toast', m => toast(m));
  if (await kv.get('demo', !support().ok)) setDemo(true);
  persist();
  // VeloVerse Online (nur wenn online.json oder ein Zugang eingetragen ist). Bei Rückkehr vom Login zuerst, damit niemand sonst den ?code= nimmt
  const O = await import('./online/client.js');
  await O.loadSiteConfig();
  window.__loginUpd?.();
  let onlineP = Promise.resolve();
  if (O.configured()) { onlineP = O.initOnline().then(() => { window.__loginUpd?.(); }).catch(e => console.warn('Online:', e.message)); if (O.expectingReturn()) await onlineP; }
  // Rückkehr von OneDrive/Google/Dropbox-Anmeldung zuerst auswerten (sonst hält Strava den Code für seinen)
  await loadSync();
  try { const who = await handleCloudRedirect(); if (who) toast('Verbunden mit ' + who, 4000); } catch (e) { toast(e.message, 7000); }
  await loadStrava(); window.__cloudUpd?.();
  try { const who = await handleRedirect(); if (who) toast('Mit Strava verbunden' + (typeof who === 'string' && who ? ': ' + who : '')); }
  catch (e) { toast(e.message, 6000); }
  // Handy erkannt: beim App-Start gleich die Handy-Ansicht öffnen (Einstellung unter App)
  window.addEventListener('hashchange', route);
  await route();
  import('./onboard.js').then(m => m.onboarding()).catch(e => console.error(e));
  import('./eggs.js').then(m => m.initEggs()).catch(e => console.error(e));
  reconnectKnown().catch(() => { });
  import('./sensors.js').then(m => m.reconnectSensors()).catch(() => { });
  // NAS-Abgleich: neuerer Stand vom NAS wird übernommen, danach Seite neu aufbauen
  // Erst den Online-Login abwarten: angemeldet läuft der Abgleich über das Konto (bindOnline), sonst wie bisher über NAS/Cloud
  onlineP.then(loadSync).then(async () => { if (O.configured()) { onlineHooks(O); if (O.loggedIn()) return null; } window.__cloudUpd?.(); return autoSync(); }).then(async pulled => {
    if (sync.needLogin && !sync.online) toast('NAS: Anmeldung abgelaufen, unter Einstellungen › Verbindungen neu anmelden', 5000);
    if (!pulled) return;
    await loadState(); await loadPlan(); await loadClickMap(); toast(sync.info || 'Neuerer Stand von ' + providerName() + ' übernommen', sync.info ? 6000 : 3000); sync.info = '';
    if (currentKey !== 'ride') route();
  }).catch(e => toast(providerName() + '-Abgleich: ' + (sync.error || e.message), 5000));
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible' || currentKey === 'ride') return;
    try { const pulled = await autoSync(); if (pulled) { await loadState(); await loadPlan(); toast('Neuer Stand von ' + providerName() + ' übernommen'); route(); } } catch (e) { }
  });
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { });
}
// Lesefelder mit Text (z. B. Strava-Titel): Antippen markiert alles (statt Inline-onclick, wegen Content Security Policy)
document.addEventListener('click', e => { const f = e.target.closest?.('[data-selectall]'); if (f) f.select(); });
init();
