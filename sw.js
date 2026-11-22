const VERSION = 'fisheye-v4.1.4';
const APP_SHELL = ['./', './index.html', './styles.css?v=414', './app.js?v=414', './layout-4-1-4.css?v=414', './manifest.webmanifest', './assets/icon-192.png', './assets/icon-512.png', './assets/favicon.png', './assets/demo.jpg'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== VERSION).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  // Network first keeps GitHub edits fresh; cached app is used when offline.
  event.respondWith(fetch(request).then(response => {
    if (response.ok && response.type === 'basic') {
      const copy = response.clone();
      caches.open(VERSION).then(cache => cache.put(request, copy));
    }
    return response;
  }).catch(() => caches.match(request, {ignoreSearch:true}).then(hit => hit || caches.match('./index.html'))));
});
