// Einstieg: Zustand laden, Router, Navigation
import { $, bus, toast, dialog, toggleFullscreen } from './util.js';
import { loadState } from './state.js';
import { loadClickMap, setDemo, status, support, reconnectKnown } from './ble.js';
import { kv, persist } from './db.js';
import { ICON } from './components.js';
import { loadPlan } from './plans.js';
import { loadSync, autoSync, sync } from './sync.js';
import { loadStrava, handleRedirect, strava, connected as stravaConnected } from './strava.js';

const PAGES = {
  '': () => import('./pages/start.js'), ride: () => import('./pages/ride.js'), summary: () => import('./pages/summary.js'),
  workouts: () => import('./pages/workouts.js'), plans: () => import('./pages/plans.js'), routes: () => import('./pages/routes.js'), history: () => import('./pages/history.js'),
  progress: () => import('./pages/progress.js'), profile: () => import('./pages/profile.js'), devices: () => import('./pages/devices.js'), help: () => import('./pages/help.js'), editor: () => import('./pages/editor.js'), planner: () => import('./pages/planner.js'), ridesettings: () => import('./pages/ridesettings.js'),
};
const NAV = [['', 'Start', 'home'], ['plans', 'Pläne', 'plan'], ['workouts', 'Workouts', 'workout'],['routes', 'Strecken', 'route'], ['history', 'Verlauf', 'history'], ['progress', 'Fortschritt', 'progress'], ['devices', 'Geräte', 'devices'], ['ridesettings', 'Fahransicht', 'view'], ['profile', 'Profil', 'profile'], ['help', 'Anleitung', 'help']];
let current = null, currentKey = null;

function nav() {
  $('#nav').innerHTML = NAV.map(([k, l, i]) => `<a href="#/${k}" data-k="${k}">${ICON[i]}<span>${l}</span></a>`).join('');
  $('#chips').innerHTML = ['trainer', 'hr', 'cad', 'click'].map(k => `<a class="chip" href="#/devices" data-d="${k}" title="${k}">${ICON[k]}</a>`).join('');
  const upd = () => { for (const c of document.querySelectorAll('#chips .chip')) c.dataset.st = status[c.dataset.d]; };
  bus.on('dev', upd); upd();
  // Cloud-Anzeige: sichtbar, sobald Daten außerhalb des Browsers landen (NAS-Abgleich oder Strava)
  const cc = document.createElement('a'); cc.className = 'chip cloudchip'; cc.href = '#/profile'; cc.id = 'cloudChip';
  cc.innerHTML = '<svg viewBox="0 0 24 24"><path d="M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.1 9.2 4.5 4.5 0 0 0 7 18Z"/></svg><i></i>';
  $('#chips').after(cc);
  const cloudUpd = () => {
    const nas = sync.cfg && (sync.cfg.mode === 'dsm' ? sync.cfg.host : sync.cfg.url), st = stravaConnected();
    cc.hidden = !nas && !st;
    const state = !nas ? 'strava' : sync.busy ? 'busy' : sync.needLogin ? 'login' : sync.error ? 'error' : sync.last ? 'on' : 'off';
    cc.dataset.st = state;
    const when = sync.last ? new Date(sync.last).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : 'noch nie';
    cc.title = [nas ? `NAS-Speicher (${sync.cfg.mode === 'dsm' ? 'Synology' : 'WebDAV'}): ${{ busy: 'Abgleich läuft', login: 'Anmeldung abgelaufen', error: 'Fehler: ' + sync.error, on: 'zuletzt abgeglichen ' + when, off: 'noch nicht abgeglichen' }[state]}` : '', st ? `Strava verbunden${strava.cfg?.auto ? ', Fahrten werden automatisch hochgeladen' : ''}` : ''].filter(Boolean).join(' · ');
  };
  bus.on('sync', cloudUpd); bus.on('strava', cloudUpd); setInterval(cloudUpd, 30000); cloudUpd(); window.__cloudUpd = cloudUpd;
  // Vollbild-Knopf in der Kopfleiste
  const fs = $('#fsBtn'), fsUpd = () => { const on = !!(document.fullscreenElement || document.webkitFullscreenElement); fs.innerHTML = on ? '<svg viewBox="0 0 24 24"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>' : ICON.full; fs.title = on ? 'Vollbild beenden' : 'Vollbild'; fs.dataset.st = on ? 'on' : 'off'; };
  fs.onclick = toggleFullscreen; document.addEventListener('fullscreenchange', fsUpd); document.addEventListener('webkitfullscreenchange', fsUpd); fsUpd();
  if (!document.documentElement.requestFullscreen && !document.documentElement.webkitRequestFullscreen) fs.hidden = true;
}
async function route() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, query] = raw.split('?');
  const [key, ...params] = path.split('/');
  const k = key in PAGES ? key : '';
  // Laufende Fahrt beim Verlassen nicht verwerfen, sondern pausiert im Hintergrund parken
  let parked = false;
  if (currentKey === 'ride' && k !== 'ride') { const ride = await import('./pages/ride.js'); if (ride.isRiding()) { ride.park(); parked = true; } }
  if (!parked) { try { current?.leave?.(); } catch (e) { console.error(e); } }
  resumeBar(k);
  document.body.dataset.page = k || 'start';
  for (const a of document.querySelectorAll('#nav a')) a.classList.toggle('on', a.dataset.k === k);
  const el = $('#view'); el.innerHTML = '<div class="pageload"><div class="spinner"></div></div>';
  el.onclick = el.onchange = el.oninput = el.ondragover = el.ondrop = null;
  window.scrollTo(0, 0);
  try {
    const mod = await PAGES[k]();
    current = mod; currentKey = k;
    el.innerHTML = '';
    await mod.render(el, params.map(decodeURIComponent), query);
  } catch (e) {
    console.error(e);
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

async function init() {
  await loadState(); await loadClickMap(); await loadPlan();
  nav();
  bus.on('toast', m => toast(m));
  if (await kv.get('demo', !support().ok)) setDemo(true);
  persist();
  await loadStrava(); window.__cloudUpd?.();
  try { const who = await handleRedirect(); if (who) toast('Mit Strava verbunden' + (typeof who === 'string' && who ? ': ' + who : '')); }
  catch (e) { toast(e.message, 6000); }
  window.addEventListener('hashchange', route);
  await route();
  import('./onboard.js').then(m => m.onboarding()).catch(e => console.error(e));
  reconnectKnown().catch(() => { });
  // NAS-Abgleich: neuerer Stand vom NAS wird übernommen, danach Seite neu aufbauen
  loadSync().then(() => window.__cloudUpd?.()).then(autoSync).then(async pulled => {
    if (sync.needLogin) toast('NAS: Anmeldung abgelaufen, unter Profil neu anmelden', 5000);
    if (!pulled) return;
    await loadState(); await loadPlan(); await loadClickMap(); toast('Daten vom NAS übernommen');
    if (currentKey !== 'ride') route();
  }).catch(e => toast('NAS-Abgleich: ' + (sync.error || e.message), 5000));
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { });
}
init();
