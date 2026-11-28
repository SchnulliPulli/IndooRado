// Offline-Cache für die App-Dateien (nur über https aktiv)
// Schnellstart: Dateien kommen sofort aus dem Cache und werden im Hintergrund aktualisiert (stale-while-revalidate).
// Eine neue App-Version bekommt einen neuen Cache-Namen; beim Wechsel lädt die Seite einmal neu (siehe app.js),
// damit nie Dateien aus zwei Versionen gemischt werden.
const CACHE = 'indoorado-v142';
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // nur eigene Dateien
  const put = r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(cc => cc.put(e.request, c)); } return r; };
  // Seite selbst und Online-Konfiguration: Netz zuerst (schnell aktuell), ohne Netz aus dem Cache
  if (e.request.mode === 'navigate' || url.pathname.endsWith('/online.json') || url.pathname.endsWith('/build.json') || url.pathname.endsWith('/sw.js')) {
    e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(put).catch(() => caches.match(e.request)));
    return;
  }
  // Alles andere: sofort aus dem Cache, parallel aktualisieren
  e.respondWith(caches.open(CACHE).then(cc => cc.match(e.request).then(hit => {
    const net = fetch(e.request, { cache: 'no-cache' }).then(put).catch(() => hit);
    if (hit) { e.waitUntil(net); return hit; }
    return net;
  })));
});

// ---------- Push-Benachrichtigungen (Nachrichten, Anrufe, Anfragen, Einladungen) auch bei geschlossener App ----------
// Ist die App wirklich aktiv (sichtbar, im Fokus und das Display an)? Antwort nur, wenn die Seite ein Bild zeichnen kann –
// bei gesperrtem Handy kommt keine Antwort, dann gibt es die Gerätemeldung.
function appActive(list) {
  return Promise.all(list.filter(c => c.visibilityState === 'visible').map(c => new Promise(res => {
    const ch = new MessageChannel(), t = setTimeout(() => res(null), 900);
    ch.port1.onmessage = ev => { clearTimeout(t); res(ev.data?.active ? c : null); };
    try { c.postMessage({ type: 'ping' }, [ch.port2]); } catch (e) { clearTimeout(t); res(null); }
  }))).then(r => r.find(Boolean) || null);
}
self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (x) { }
  const safe = v => String(v || '').slice(0, 80), k = d.kind, call = k === 'call', missed = k === 'missed', from = encodeURIComponent(safe(d.from)), inf = d.info || {};
  const url = call ? `./#/?pcall=${encodeURIComponent(safe(d.room))}&from=${from}&name=${encodeURIComponent(safe(d.name))}`
    : k === 'friendreq' ? './#/friends'
    : k === 'invite' ? './#/lobby'
    : `./#/friends?open=${from}`;
  const acts = {
    join: call ? url : k === 'invite' ? `./#/?pinv=1&from=${from}&k=${encodeURIComponent(safe(inf.k))}&lobby=${encodeURIComponent(safe(inf.lobby))}&route=${encodeURIComponent(safe(inf.route))}&name=${encodeURIComponent(safe(d.name))}` : null,
    acc: k === 'friendreq' ? `./#/?pfreq=${from}` : null,
    no: call ? `./#/?pdecline=${encodeURIComponent(safe(d.room))}&from=${from}` : null,
  };
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async list => {
    if (k === 'test') await new Promise(r => setTimeout(r, 6000)); // Zeit, zum Startbildschirm zu wechseln (Samsung zeigt für die App im Vordergrund kein Pop-up)
    const fg = k !== 'test' && await appActive(list);
    if (fg) { fg.postMessage({ type: 'pushIn', d: { kind: safe(k), from: safe(d.from), name: safe(d.name), room: safe(d.room), info: { k: safe(inf.k), lobby: safe(inf.lobby), title: safe(inf.title), route: safe(inf.route), routeName: safe(inf.routeName) } } }); return; }
    // Android zeigt eine ersetzte Meldung (gleiche Kennung) nicht erneut als Pop-up: ältere desselben Absenders schließen
    // und die neue mit eigener Kennung anlegen. Nur das wiederholte Klingeln ersetzt bewusst (kein Pop-up-Gewitter).
    const base = call || missed ? 'call-' + safe(d.room) : k === 'test' ? 'test' : k + '-' + safe(d.from);
    if (!(call && d.ring)) for (const n of await self.registration.getNotifications()) if (String(n.tag).startsWith(base)) n.close();
    return self.registration.showNotification(safe(d.title) || 'IndooRado', {
      body: safe(d.body), tag: call && d.ring ? base : base + (call ? '' : '#' + Date.now()), renotify: true, icon: 'icons/icon-192.png', badge: 'icons/badge-96.png', timestamp: Date.now(), silent: false,
      requireInteraction: call || k === 'invite', vibrate: call ? [600, 250, 600, 250, 600, 250, 600] : [120], data: { url, call, acts },
      actions: call ? [{ action: 'join', title: 'Annehmen' }, { action: 'no', title: 'Ablehnen' }]
        : k === 'msg' ? [{ action: 'open', title: 'Antworten' }]
        : missed ? [{ action: 'open', title: 'Chat öffnen' }]
        : k === 'friendreq' ? [{ action: 'acc', title: 'Annehmen' }, { action: 'open', title: 'Ansehen' }]
        : k === 'invite' ? [{ action: 'join', title: 'Beitreten' }, { action: 'open', title: 'Ansehen' }] : [],
    });
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const D = e.notification.data || {}, rel = (e.action && D.acts?.[e.action]) || (e.action === 'no' ? null : D.url) || './';
  if (e.action === 'no' && !D.acts?.no) return;
  const url = new URL(rel, self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const c = list.find(x => x.url.startsWith(self.registration.scope));
    if (c) { c.postMessage({ type: 'pushOpen', url }); return e.action === 'no' ? null : c.focus(); } // Ablehnen: App muss nicht nach vorn
    return self.clients.openWindow(url);
  }));
});
