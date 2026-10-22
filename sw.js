/* Rainbrew Magic Catch: service worker. Lets the game open with no connection.
   Network first (so updates always arrive), cached copy as the offline fallback.
   It never touches the leaderboard server, and never caches the staff page. */
const CACHE = 'rainbrew-sky-v3-1';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png', './favicon-64.png', './img/frost_unicorn.png', './img/solar_blaze.png', './img/void_shadow.png', './img/golden_sun.png', './img/emerald_nature.png'];
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {})))).catch(() => {}));   // one missing file must not stop the rest
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;           // the Apps Script server is cross-origin: leave it alone
  if (/verify\.html$/.test(url.pathname)) return;            // staff page is always live
  e.respondWith(
    fetch(req, { cache: 'no-cache' }).then(res => {   // always revalidate: never show a stale copy of the game
      if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {}); }
      return res;
    }).catch(() => caches.match(req).then(r => r || caches.match('./index.html')).then(r => r || caches.match('./')))
  );
});
