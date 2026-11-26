// Einstieg: Zustand laden, Router, Navigation
import { $, bus, toast, dialog, toggleFullscreen } from './util.js';
import { loadState, profile } from './state.js';
import { loadClickMap, setDemo, status, support, reconnectKnown } from './ble.js';
import { kv, persist } from './db.js';
import { ICON, avatarSvg } from './components.js';
import { loadPlan } from './plans.js';
import { loadSync, autoSync, sync, isConfigured, providerName, handleCloudRedirect } from './sync.js';
import { loadStrava, handleRedirect, strava, connected as stravaConnected } from './strava.js';
// Schutz gegen Clickjacking: VeloVerse läuft nie eingebettet in einer fremden Seite (GitHub Pages kann dafür keinen Header setzen)
if (window.top !== window.self) { const a = document.createElement('a'); a.href = location.href; a.target = '_top'; a.textContent = 'VeloVerse direkt öffnen'; document.body.replaceChildren(document.createTextNode('VeloVerse kann nicht eingebettet werden. '), a); throw new Error('eingebettet'); }

const PAGES = {
  '': () => import('./pages/start.js'), ride: () => import('./pages/ride.js'), summary: () => import('./pages/summary.js'),
  workouts: () => import('./pages/workouts.js'), plans: () => import('./pages/plans.js'), routes: () => import('./pages/routes.js'), history: () => import('./pages/history.js'),
  progress: () => import('./pages/progress.js'), profile: () => import('./pages/profile.js'), devices: () => import('./pages/devices.js'), help: () => import('./pages/help.js'), editor: () => import('./pages/editor.js'), planner: () => import('./pages/planner.js'), ridesettings: () => import('./pages/ridesettings.js'), companion: () => import('./pages/companion.js'),
  // Einstellungen: gleiche Module, anderer Ausschnitt
  avatar: () => import('./pages/avatar.js'),
  legal: () => import('./pages/legal.js'),
  live: () => import('./pages/live.js'),
  lobby: () => import('./pages/online.js'), players: () => import('./pages/online.js').then(m => ({ ...m, render: el => m.render(el, ['players']) })), account: () => import('./pages/account.js'), admin: () => import('./pages/admin.js'),
  sound: () => import('./pages/ridesettings.js').then(m => ({ ...m, render: el => m.render(el, ['sound']) })),
  appsettings: () => import('./pages/profile.js').then(m => ({ ...m, render: el => m.render(el, ['app']) })),
  connect: () => import('./pages/profile.js').then(m => ({ ...m, render: el => m.render(el, ['connect']) })),
};
// Hauptmenü: sechs Bereiche, Unterseiten als Reiter oben auf der Seite
const NAV = [
  { k: '', l: 'Start', i: 'home', also: ['companion', 'live'] },
  { k: 'workouts', l: 'Training', i: 'workout', tabs: [['workouts', 'Workouts'], ['plans', 'Trainingspläne']], also: ['editor', 'planner'] },
  { k: 'routes', l: 'Strecken', i: 'route' },
  { k: 'history', l: 'Aktivitäten', s: 'Fahrten', i: 'history', tabs: [['history', 'Verlauf'], ['progress', 'Fortschritt']], also: ['summary'] },
  { k: 'devices', l: 'Geräte', i: 'devices' },
  { k: 'lobby', l: 'Online', i: 'online', tabs: [['lobby', 'Lobby'], ['players', 'Wer ist online'], ['account', 'Konto'], ['admin', 'Admin']] },
  { k: 'profile', l: 'Einstellungen', s: 'Optionen', i: 'profile', tabs: [['profile', 'Profil'], ['avatar', 'Avatar'], ['ridesettings', 'Fahransicht'], ['sound', 'Ton'], ['appsettings', 'App'], ['connect', 'Verbindungen'], ['help', 'Anleitung'], ['legal', 'Rechtliches']] },
];
const groupOf = k => NAV.find(g => g.k === k || g.tabs?.some(t => t[0] === k) || g.also?.includes(k)) || null;
let current = null, currentKey = null;

function nav() {
  $('#nav').innerHTML = NAV.map(g => `<a href="#/${g.k}" data-k="${g.k}" title="${g.l}">${ICON[g.i]}<span class="nl">${g.l}</span>${g.s ? `<span class="ns">${g.s}</span>` : ''}</a>`).join('')
    + `<div class="navfoot"><a href="#/legal/impressum">Impressum</a> · <a href="#/legal/datenschutz">Datenschutz</a><div class="navver" id="navVer"></div></div>`;
  import('./version.js').then(async V => { const i = await V.buildInfo(), e = document.getElementById('navVer'); if (e) { e.textContent = V.buildText(i); e.title = i.message || ''; } }).catch(() => { });
  $('#chips').innerHTML = ['trainer', 'hr', 'cad', 'click'].map(k => `<a class="chip" href="#/devices" data-d="${k}" title="${k}">${ICON[k]}</a>`).join('');
  const upd = () => { for (const c of document.querySelectorAll('#chips .chip')) c.dataset.st = status[c.dataset.d]; };
  bus.on('dev', upd); upd();
  // Cloud-Anzeige: sichtbar, sobald Daten außerhalb des Browsers landen (NAS-Abgleich oder Strava)
  const cc = document.createElement('a'); cc.className = 'chip cloudchip'; cc.href = '#/connect'; cc.id = 'cloudChip';
  cc.innerHTML = '<svg viewBox="0 0 24 24"><path d="M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.1 9.2 4.5 4.5 0 0 0 7 18Z"/></svg><i></i>';
  $('#chips').after(cc);
  const cloudUpd = () => {
    const nas = !!(sync.cfg && (sync.cfg.host || sync.cfg.url || sync.cfg.clientId)), st = stravaConnected(); // nur echte Cloud-Speicher (NAS, OneDrive …), nicht das Online-Konto
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
    // Weitere angemeldete Konten auf diesem Gerät: Antippen wechselt (lädt neu, jedes Konto hat seine eigenen Daten)
    const others = O.accounts().filter(a => a.uid !== O.online.user?.id), e2 = t => String(t ?? '').replace(/</g, '&lt;');
    const accHtml = `<div class="umacc">${others.map(a => `<button class="umsw" data-sw="${e2(a.uid)}">${avatarSvg(a.look || {}, 30)}<span><b>${e2(a.name)}</b><small>${e2(a.email)}</small></span><i class="umx" data-forget="${e2(a.uid)}" title="Von diesem Gerät entfernen">✕</i></button>`).join('')}<button data-um-add>➕ Weiteres Konto hinzufügen</button></div>`;
    um.innerHTML = `<div class="umhead">${avatarSvg(profile, 44)}<div><b>${n}</b><small>${mail}</small></div></div>${accHtml}<a href="#/account">👤 Konto und Datenschutz</a><a href="#/avatar">🎨 Avatar gestalten</a>${O.isAdmin() ? '<a href="#/admin">🛠️ Admin-Konsole</a>' : ''}<button data-um-out>↩︎ Abmelden</button>`;
    const r = lb.getBoundingClientRect(); um.style.top = (r.bottom + 8) + 'px'; um.style.right = Math.max(8, innerWidth - r.right) + 'px'; um.hidden = false;
  });
  um.addEventListener('click', async e => {
    const fg = e.target.closest('[data-forget]');
    if (fg) { e.stopPropagation(); const O = await import('./online/client.js'); O.forgetAccount(fg.dataset.forget); fg.closest('.umsw').remove(); toast('Konto von diesem Gerät entfernt (die lokalen Daten bleiben erhalten)'); return; }
    const sw = e.target.closest('[data-sw]');
    if (sw) { if ((document.querySelector('#rw') && currentKey === 'ride') || document.querySelector('.resumebar:not([hidden])')) { toast('Bitte erst die Fahrt beenden, dann das Konto wechseln', 3500); um.hidden = true; return; } const O = await import('./online/client.js'); sw.innerHTML = '<span class="spinner sm"></span> Wechsle …'; O.switchAccount(sw.dataset.sw); return; }
    if (e.target.closest('[data-um-add]')) { const O = await import('./online/client.js'); O.addAccount(); return; }
    if (e.target.closest('[data-um-out]')) { const O = await import('./online/client.js'); await O.signOut(); toast('Abgemeldet'); loginUpd(); if (currentKey === 'account') route(); } um.hidden = true; });
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
    if (k === 'lobby') announce(el);
    if (k === '' || k === 'companion') newsBar(el);
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
// Startseite: Benachrichtigungsleiste zum Wischen (mit Punkten): Ankündigungen vom Admin, offene Lobbys, wer gerade fährt.
// Nur angemeldet (sonst kein Kontakt zum Server). Zeigt sofort den zuletzt bekannten Stand und frischt im Hintergrund auf.
// Wechselt alle 7 s von selbst, pausiert bei Berührung oder Maus darüber.
async function newsBar(el) {
  const O = await import('./online/client.js'); if (!O.configured()) return;
  const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const seen = () => { try { return JSON.parse(localStorage.getItem('vvAnnSeen') || '[]'); } catch (e) { return []; } };
  let anns = []; try { anns = JSON.parse(localStorage.getItem('vvAnnCache') || '[]'); } catch (e) { }
  let PR = null, live = false;
  const box = document.createElement('section'); box.className = 'newsbar'; box.hidden = true;
  box.innerHTML = '<div class="nbtrack"></div><button class="nbarr l" data-step="-1" aria-label="Zurück">‹</button><button class="nbarr r" data-step="1" aria-label="Weiter">›</button><div class="nbdots"></div>';
  el.querySelector('.pagehead, .comphead')?.after(box) ?? el.prepend(box);
  const track = box.querySelector('.nbtrack'), dots = box.querySelector('.nbdots');
  const min = ms => ms <= 0 ? 'startet jetzt' : ms < 60e3 ? `startet in ${Math.ceil(ms / 1000)} s` : `startet in ${Math.ceil(ms / 60e3)} min`;
  const LV = { info: ['📣', 'Ankündigung'], event: ['🎉', 'Event'], warn: ['⚠️', 'Hinweis'] };
  const slide = (kind, ico, kicker, title, sub, action = '') => ({ kind, html: `<div class="nbico">${ico}</div><div class="nbtxt"><small>${kicker}</small><b>${title}</b>${sub ? `<span>${sub}</span>` : ''}</div>${action}` });
  const items = () => {
    const S = seen(), out = [];
    for (const a of anns) if (!S.includes(a.id)) { const [ic, k] = LV[a.level] || LV.info; out.push({ key: 'a' + a.id, ...slide('nb-ann nb-lv-' + (LV[a.level] ? a.level : 'info'), ic, k, esc(a.title), esc(a.body), `<button class="nbx" data-hide="${a.id}" aria-label="Ausblenden">✕</button>`) }); }
    if (PR && live) {
      for (const l of PR.lobbies()) out.push({ key: 'l' + l.id, ...slide('nb-lobby', '👥', `${l.race ? 'Rennen' : 'Gruppenfahrt'} · ${min(l.startAt - Date.now())}`, esc(l.title) + (l.mine ? ' <em>(deine)</em>' : ''), `${esc(l.routeName)} · von ${esc(l.hostName)} · ${l.members.length} dabei`, '<a class="btn sm pri" href="#/lobby">Zur Lobby</a>') });
      for (const [k, p] of PR.P.peers) if (p.where === 'ride' && p.route) out.push({ key: 'r' + k, ...slide('nb-ride', avatarSvg(p.look || {}, 40), 'Fährt gerade', esc(p.name), esc(p.routeName || ''), `<button class="btn sm" data-sid="${esc(k)}" data-route="${esc(p.route)}" data-name="${esc(p.name)}">Mitfahren</button>`) });
      const ps = [...PR.P.peers.values()];
      if (ps.length && !out.some(x => x.kind === 'nb-ride')) out.push({ key: 'online', ...slide('nb-online', '🟢', 'Gerade online', ps.slice(0, 3).map(p => esc(p.name)).join(', ') + (ps.length > 3 ? ` und ${ps.length - 3} weitere` : ''), 'Leg eine Gruppenfahrt an, alle sehen sie sofort.', '<a class="btn sm" href="#/lobby">Lobby</a>') });
    }
    return out;
  };
  let keys = [], idx = 0, hold = 0, off = null, t = null;
  const mark = () => [...dots.children].forEach((d, i) => d.setAttribute('aria-current', String(i === idx)));
  const go = (i, smooth = true) => { if (!keys.length) return; idx = (i + keys.length) % keys.length; track.scrollTo({ left: idx * track.clientWidth, behavior: smooth ? 'smooth' : 'auto' }); mark(); };
  const draw = () => {
    if (!document.body.contains(box)) { off?.(); clearInterval(t); return; }
    const it = items(), nk = it.map(x => x.key);
    box.hidden = !it.length; if (!it.length) { keys = []; return; }
    if (nk.join() !== keys.join()) {
      const cur = keys[idx]; keys = nk;
      track.innerHTML = it.map(x => `<div class="nbslide ${x.kind}" data-k="${esc(x.key)}">${x.html}</div>`).join('');
      dots.innerHTML = it.length > 1 ? it.map((x, i) => `<button data-i="${i}" aria-label="Meldung ${i + 1}"></button>`).join('') : '';
      box.classList.toggle('multi', it.length > 1);
      go(Math.max(0, keys.indexOf(cur)), false);
    } else it.forEach((x, i) => { const sl = track.children[i]; if (sl && sl.innerHTML !== x.html) sl.innerHTML = x.html; });
  };
  track.addEventListener('scroll', () => { const i = Math.round(track.scrollLeft / (track.clientWidth || 1)); if (i !== idx) { idx = i; mark(); } }, { passive: true });
  box.addEventListener('pointerenter', () => hold = Date.now() + 1e9); box.addEventListener('pointerleave', () => hold = Date.now() + 4000);
  box.addEventListener('touchstart', () => hold = Date.now() + 10000, { passive: true });
  box.onclick = async e => {
    const st = e.target.closest('[data-step]'); if (st) { go(idx + +st.dataset.step); hold = Date.now() + 10000; return; }
    const d = e.target.closest('.nbdots [data-i]'); if (d) { go(+d.dataset.i); hold = Date.now() + 10000; return; }
    const h = e.target.closest('[data-hide]'); if (h) { const S = seen(); S.push(+h.dataset.hide); localStorage.setItem('vvAnnSeen', JSON.stringify(S.slice(-50))); draw(); return; }
    const b = e.target.closest('[data-sid]'); if (b) { const { sel, saveSel } = await import('./state.js'); sel.routeId = b.dataset.route; saveSel(); sessionStorage.setItem('joinRider', JSON.stringify({ sid: b.dataset.sid, name: b.dataset.name })); location.hash = '#/ride'; }
  };
  // Sofort: zuletzt bekannte Ankündigungen (nur wenn zuletzt angemeldet)
  if (localStorage.getItem('vv-auth') || sessionStorage.getItem('vv-auth')) draw();
  let tick = 0; t = setInterval(() => { draw(); if (++tick % 7 === 0 && keys.length > 1 && Date.now() > hold) go(idx + 1); }, 1000);
  // Danach: Anmeldung abwarten, Anwesenheit und frische Ankündigungen parallel holen
  if (!O.online.ready) await new Promise(r => { const o = bus.on('online', () => { o(); r(); }); setTimeout(() => { o(); r(); }, 15000); });
  if (!document.body.contains(box)) return;
  if (!O.loggedIn() || O.needsMfa()) { anns = []; draw(); return; }
  if (O.access().ok) { PR = await import('./online/presence.js'); live = true; off = bus.on('presence', draw); PR.joinPresence().catch(() => { }); draw(); }
  import('./online/sync.js').then(m => m.announcements()).then(a => { anns = a || []; try { localStorage.setItem('vvAnnCache', JSON.stringify(anns.map(x => ({ id: x.id, level: x.level, title: x.title, body: x.body })))); } catch (e) { } draw(); }).catch(() => { });
}
// Einladung eines anderen Spielers: Karte unten rechts auf jeder Seite, mit Beitreten bzw. Mitfahren
bus.on('invite', async inv => {
  const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const box = document.querySelector('.invstack') || document.body.appendChild(Object.assign(document.createElement('div'), { className: 'invstack' }));
  const c = document.createElement('div'); c.className = 'card invcard';
  const min = ms => ms <= 0 ? 'startet jetzt' : ms < 60e3 ? `startet in ${Math.ceil(ms / 1000)} s` : `startet in ${Math.ceil(ms / 60e3)} min`;
  c.innerHTML = `<div class="nbico">${avatarSvg(inv.look || {}, 40)}</div><div class="nbtxt"><small>📨 Einladung</small><b>${esc(inv.name)} ${inv.kind === 'lobby' ? 'lädt dich zur Gruppenfahrt ein' : 'möchte, dass du mitfährst'}</b><span>${inv.kind === 'lobby' ? `„${esc(inv.title)}“ · ${esc(inv.routeName)} · ${min(inv.startAt - Date.now())}` : esc(inv.routeName)}</span><div class="row"><button class="btn sm pri" data-ok>${inv.kind === 'lobby' ? 'Beitreten' : 'Mitfahren'}</button><button class="btn sm ghost" data-no>Später</button></div></div>`;
  box.appendChild(c);
  try { (await import('./sound.js')).sound?.pass?.(); } catch (e) { }
  const t = setTimeout(() => c.remove(), 90e3);
  c.onclick = async e => {
    if (e.target.closest('[data-no]')) { clearTimeout(t); c.remove(); return; }
    if (!e.target.closest('[data-ok]')) return;
    clearTimeout(t); c.remove();
    const PR = await import('./online/presence.js'), { sel, saveSel } = await import('./state.js');
    if (inv.kind === 'lobby') { PR.joinLobby(inv.lobby); toast('Beigetreten, die Fahrt startet automatisch'); location.hash = '#/lobby'; }
    else { sel.routeId = inv.route; saveSel(); sessionStorage.setItem('joinRider', JSON.stringify({ sid: inv.from, name: inv.name })); location.hash = '#/ride'; }
  };
});
async function announce(el) {
  const O = await import('./online/client.js'); if (!O.configured()) return;
  // Beim App-Start läuft die Anmeldung noch: einmal auf das Ergebnis warten statt die Ankündigungen zu verpassen
  if (!O.online.ready) await new Promise(r => { const off = bus.on('online', () => { off(); r(); }); setTimeout(() => { off(); r(); }, 15000); });
  if (!O.online.ready || !O.loggedIn() || O.needsMfa() || !document.body.contains(el) || el.querySelector('.annbox')) return; // nur angemeldet: sonst kein Kontakt zum Server
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
// Abgleichfehler höchstens alle 15 Minuten melden (der Abgleich läuft oft automatisch)
let lastSyncErr = 0;
function syncErrToast(msg) { if (Date.now() - lastSyncErr < 15 * 60e3) return; lastSyncErr = Date.now(); toast(msg, 6000); }
async function bindOnline(O) {
  const S = await import('./sync.js');
  const on = O.loggedIn() && !O.needsMfa() && O.access().ok; // ohne Zugang (Testphase abgelaufen, gesperrt) kein Online-Abgleich
  document.body.classList.toggle('is-admin', O.isAdmin() && !O.needsMfa());
  const PR = await import('./online/presence.js'); if (on) PR.joinPresence().catch(() => { }); else PR.leavePresence();
  await S.setOnlineBackend(on ? { sb: O.online.client, uid: O.online.user.id } : null);
  window.__cloudUpd?.();
  if (on) {
    const pulled = await autoSync().catch(e => { syncErrToast('Online-Abgleich: ' + (sync.error || e.message)); return null; });
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
// Ladeanzeige für Online-Anfragen: erscheint erst nach 400 ms, damit schnelle Antworten nicht flackern
function netIndicator() {
  const pill = document.createElement('div'); pill.className = 'netpill'; pill.hidden = true; pill.setAttribute('role', 'status');
  pill.innerHTML = '<span class="spinner sm"></span><span>Online-Infos werden geladen …</span>'; document.body.appendChild(pill);
  let t = null;
  bus.on('netbusy', n => { clearTimeout(t); if (n > 0) t = setTimeout(() => { pill.hidden = currentKey === 'ride'; }, 400); else pill.hidden = true; });
}
async function init() {
  netIndicator();
  await loadState(); await loadClickMap(); await loadPlan();
  const { applyAppTheme } = await import('./pages/profile.js'); applyAppTheme();
  matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', applyAppTheme);
  nav();
  bus.on('toast', m => toast(m));
  if (await kv.get('demo', !support().ok)) setDemo(true);
  persist();
  // VeloVerse Online läuft im Hintergrund an, die Startseite wartet nicht darauf.
  // Nur bei Rückkehr vom Login (?code=…) erst die Anmeldung abschließen, damit niemand sonst den Code nimmt.
  const O = await import('./online/client.js');
  const onlineP = O.loadSiteConfig().then(() => { window.__loginUpd?.(); if (O.configured()) return O.initOnline().then(() => window.__loginUpd?.()); }).catch(e => console.warn('Online:', e.message));
  if (new URLSearchParams(location.search).has('code') && O.expectingReturn()) await onlineP;
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
  // Barrierefreiheit: Sprunglink zum Inhalt (ohne den Hash-Router zu stören), Tastenkürzel-Übersicht mit ?
  const sk = document.getElementById('skipLink'); if (sk) sk.onclick = e => { e.preventDefault(); document.getElementById('view')?.focus(); };
  import('./shortcuts.js').then(m => m.initShortcuts());
  import('./sensors.js').then(m => m.reconnectSensors()).catch(() => { });
  // NAS-Abgleich: neuerer Stand vom NAS wird übernommen, danach Seite neu aufbauen
  // Erst den Online-Login abwarten: angemeldet läuft der Abgleich über das Konto (bindOnline), sonst wie bisher über NAS/Cloud
  onlineP.then(loadSync).then(async () => { if (O.configured()) { onlineHooks(O); if (O.loggedIn()) return null; } window.__cloudUpd?.(); return autoSync(); }).then(async pulled => {
    if (sync.needLogin && !sync.online) toast('NAS: Anmeldung abgelaufen, unter Einstellungen › Verbindungen neu anmelden', 5000);
    if (!pulled) return;
    await loadState(); await loadPlan(); await loadClickMap(); toast(sync.info || 'Neuerer Stand von ' + providerName() + ' übernommen', sync.info ? 6000 : 3000); sync.info = '';
    if (currentKey !== 'ride') route();
  }).catch(e => syncErrToast(providerName() + '-Abgleich: ' + (sync.error || e.message)));
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible' || currentKey === 'ride') return;
    try { const pulled = await autoSync(); if (pulled) { await loadState(); await loadPlan(); toast('Neuer Stand von ' + providerName() + ' übernommen'); route(); } } catch (e) { }
  });
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    const hadCtrl = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js').then(r => r.update()).catch(() => { });
    // Neue App-Version übernommen: einmal neu laden, damit alle Dateien zur selben Version gehören (während der Fahrt erst danach)
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadCtrl) return;
      const go = () => { toast('Neue Version geladen', 1500); setTimeout(() => location.reload(), 600); };
      if (currentKey !== 'ride') go(); else bus.on('rideEnded', go);
    });
  }
}
// Lesefelder mit Text (z. B. Strava-Titel): Antippen markiert alles (statt Inline-onclick, wegen Content Security Policy)
document.addEventListener('click', e => { const f = e.target.closest?.('[data-selectall]'); if (f) f.select(); });
init();
