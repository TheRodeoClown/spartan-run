/*
 * sw.js: Service worker. Lets Spartan Run install as an app and play offline.
 * Pages and version.txt: network first (so updates arrive), the cached copy when offline.
 * Everything else (versioned scripts and styles, icons, the Three.js and PeerJS libraries): cache first.
 * Bump CACHE with each release (alongside BUILD in index.html and version.txt) so old files are cleared.
 */
const CACHE = 'spartan-run-27';
const CORE = ['./', 'index.html', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET')
    return;
  const url = new URL(req.url);
  // Multiplayer signalling (PeerJS) and anything that isn't http(s) goes straight to the network
  if (!url.protocol.startsWith('http') || url.hostname.endsWith('peerjs.com'))
    return;
  const isVersion = url.pathname.endsWith('version.txt');
  if (req.mode === 'navigate' || isVersion) {
    e.respondWith(fetch(req).then(r => {
      if (!isVersion && r.ok) {
        const copy = r.clone();
        caches.open(CACHE).then(c => c.put('index.html', copy));
      }
      return r;
    }).catch(() => caches.match(isVersion ? req : 'index.html')));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {
    if (r.ok || r.type === 'opaque') {
      const copy = r.clone();
      caches.open(CACHE).then(c => c.put(req, copy));
    }
    return r;
  })));
});