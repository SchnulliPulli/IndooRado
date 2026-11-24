// Einstieg: Zustand laden, Router, Navigation
import { $, bus, toast, dialog, toggleFullscreen } from './util.js';
import { loadState } from './state.js';
import { loadClickMap, setDemo, status, support, reconnectKnown } from './ble.js';
import { kv, persist } from './db.js';
import { ICON } from './components.js';
import { loadPlan } from './plans.js';
import { loadSync, autoSync, sync } from './sync.js';
import { loadStrava, handleRedirect } from './strava.js';

const PAGES = {
  '': () => import('./pages/start.js'), ride: () => import('./pages/ride.js'), summary: () => import('./pages/summary.js'),
  workouts: () => import('./pages/workouts.js'), plans: () => import('./pages/plans.js'), routes: () => import('./pages/routes.js'), history: () => import('./pages/history.js'),
  progress: () => import('./pages/progress.js'), profile: () => import('./pages/profile.js'), devices: () => import('./pages/devices.js'),
};
const NAV = [['', 'Start', 'home'], ['plans', 'Pläne', 'plan'], ['workouts', 'Workouts', 'workout'],['routes', 'Strecken', 'route'], ['history', 'Verlauf', 'history'], ['progress', 'Fortschritt', 'progress'], ['devices', 'Geräte', 'devices'], ['profile', 'Profil', 'profile']];
let current = null, currentKey = null;

function nav() {
  $('#nav').innerHTML = NAV.map(([k, l, i]) => `<a href="#/${k}" data-k="${k}">${ICON[i]}<span>${l}</span></a>`).join('');
  $('#chips').innerHTML = ['trainer', 'hr', 'cad', 'click'].map(k => `<a class="chip" href="#/devices" data-d="${k}" title="${k}">${ICON[k]}</a>`).join('');
  const upd = () => { for (const c of document.querySelectorAll('#chips .chip')) c.dataset.st = status[c.dataset.d]; };
  bus.on('dev', upd); upd();
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
  if (currentKey === 'ride' && k !== 'ride') {
    const ride = await import('./pages/ride.js');
    if (ride.isRiding() && !route.leaving) {
      const ok = await dialog({ title: 'Fahrt verlassen?', html: '<p class="muted">Die laufende Fahrt wird nicht gespeichert. Zum Speichern „Beenden“ in der Fahransicht nutzen.</p>', buttons: [{ label: 'Weiterfahren', value: false }, { label: 'Verlassen', value: true, cls: 'danger' }] });
      if (!ok) { route.leaving = true; location.hash = '#/ride'; setTimeout(() => route.leaving = false, 50); return; }
    }
  }
  if (route.leaving && k === 'ride' && currentKey === 'ride') return;
  try { current?.leave?.(); } catch (e) { console.error(e); }
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

async function init() {
  await loadState(); await loadClickMap(); await loadPlan();
  nav();
  bus.on('toast', m => toast(m));
  if (await kv.get('demo', !support().ok)) setDemo(true);
  persist();
  await loadStrava();
  try { const who = await handleRedirect(); if (who) toast('Mit Strava verbunden' + (typeof who === 'string' && who ? ': ' + who : '')); }
  catch (e) { toast(e.message, 6000); }
  window.addEventListener('hashchange', route);
  await route();
  reconnectKnown().catch(() => { });
  // NAS-Abgleich: neuerer Stand vom NAS wird übernommen, danach Seite neu aufbauen
  loadSync().then(autoSync).then(async pulled => {
    if (!pulled) return;
    await loadState(); await loadPlan(); await loadClickMap(); toast('Daten vom NAS übernommen');
    if (currentKey !== 'ride') route();
  }).catch(e => toast('NAS-Abgleich: ' + (sync.error || e.message), 5000));
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { });
}
init();
