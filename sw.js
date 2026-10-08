/* Speedy List AI service worker: precache app shell (works offline), cache-first for static, network-first for pages. */
const VER = 'speedy-list-ai-v10';
const SHELL = [
  './', 'index.html', 'privacy.html', 'manifest.webmanifest',
  'css/app.css', 'js/config.js', 'js/data.js', 'js/app.js',
  'assets/brand/roadrunner-tile.png', 'assets/brand/roadrunner-tile-64.png', 'assets/brand/roadrunner-icon-192.png',
  'assets/brand/roadrunner-icon-512.png', 'assets/brand/roadrunner-maskable-512.png', 'assets/brand/roadrunner-apple-touch-180.png',
  'assets/brand/roadrunner-favicon-32.png',
  'assets/fonts/Barlow-SemiBold.woff2', 'assets/fonts/Barlow-Bold.woff2', 'assets/fonts/Barlow-ExtraBold.woff2', 'assets/fonts/OpenSans-var.woff2',
  'img/speedy-list-folder-512.png', 'img/sample-reach-in.jpg',
  'downloads/Speedy-List-Folder.zip'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VER).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VER).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request; const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(r => { const cp = r.clone(); caches.open(VER).then(c => c.put(req, cp)); return r; })
      .catch(() => caches.match(req, { ignoreSearch: true }).then(h => h || caches.match('index.html'))));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(r => {
    if (r.ok) { const cp = r.clone(); caches.open(VER).then(c => c.put(req, cp)); }
    return r;
  })));
});
