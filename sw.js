// Offline-Cache für die App-Dateien (nur über https aktiv)
// Schnellstart: Dateien kommen sofort aus dem Cache und werden im Hintergrund aktualisiert (stale-while-revalidate).
// Eine neue App-Version bekommt einen neuen Cache-Namen; beim Wechsel lädt die Seite einmal neu (siehe app.js),
// damit nie Dateien aus zwei Versionen gemischt werden.
const CACHE = 'indoorado-v130';
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

// ---------- Push-Benachrichtigungen (neue Nachricht, Anruf) auch bei geschlossener App ----------
self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (x) { }
  const call = d.kind === 'call', safe = v => String(v || '').slice(0, 80);
  const url = call ? `./#/?pcall=${encodeURIComponent(safe(d.room))}&from=${encodeURIComponent(safe(d.from))}&name=${encodeURIComponent(safe(d.name))}` : `./#/friends?open=${encodeURIComponent(safe(d.from))}`;
  e.waitUntil(self.registration.showNotification(safe(d.title) || 'IndooRado', {
    body: safe(d.body), tag: call ? 'call-' + safe(d.room) : d.kind === 'test' ? 'test' : 'msg-' + safe(d.from), renotify: true, icon: 'icons/icon-192.png', badge: 'icons/badge-96.png', timestamp: Date.now(), silent: false,
    requireInteraction: call, vibrate: call ? [400, 200, 400, 200, 400] : [120], data: { url, call },
    actions: call ? [{ action: 'join', title: '📹 Annehmen' }, { action: 'no', title: 'Ablehnen' }] : d.kind === 'msg' ? [{ action: 'open', title: '💬 Antworten' }] : [],
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close(); if (e.action === 'no') return;
  const url = new URL(e.notification.data?.url || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const c = list.find(x => x.url.startsWith(self.registration.scope));
    if (c) { c.postMessage({ type: 'pushOpen', url }); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
