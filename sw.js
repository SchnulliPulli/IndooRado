// Offline-Cache für die App-Dateien (nur über https aktiv)
// Schnellstart: Dateien kommen sofort aus dem Cache und werden im Hintergrund aktualisiert (stale-while-revalidate).
// Eine neue App-Version bekommt einen neuen Cache-Namen; beim Wechsel lädt die Seite einmal neu (siehe app.js),
// damit nie Dateien aus zwei Versionen gemischt werden.
const CACHE = 'indoorado-v116';
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
