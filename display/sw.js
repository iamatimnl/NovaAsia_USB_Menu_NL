/* Offline support for the menu screen.
   - Page files: cached at install, refreshed in the background.
   - display.json / menu.json: network first, last good copy when offline.
   - Dish photos and fonts (other hosts): cache first, so after one full round the
     screen keeps showing everything without internet. */
var VERSION = 'nova-display-20261031-9';
var SHELL = ['./', 'index.html', 'display.css?v=20261031-9', 'display.js?v=20261031-9', 'display.json', 'menu.json',
  'manifest.webmanifest', 'assets/nova-asia-logo-white.png', 'assets/fonts/archivo-variable-latin.woff2'];

self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(VERSION).then(function (cache) { return cache.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (key) { return key !== VERSION; }).map(function (key) { return caches.delete(key); }));
  }).then(function () { return self.clients.claim(); }));
});

function networkFirst(request) {
  return fetch(request).then(function (response) {
    if (response.ok) {
      var copy = response.clone();
      caches.open(VERSION).then(function (cache) { cache.put(request.url.split('?')[0], copy); });
    }
    return response;
  }).catch(function () {
    return caches.match(request.url.split('?')[0], { ignoreSearch: true });
  });
}

function cacheFirst(request) {
  return caches.match(request).then(function (hit) {
    return hit || fetch(request).then(function (response) {
      if (response.ok || response.type === 'opaque') {
        var copy = response.clone();
        caches.open(VERSION + '-media').then(function (cache) { cache.put(request, copy); });
      }
      return response;
    });
  });
}

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;
  var url = new URL(request.url);
  if (url.origin === self.location.origin) {
    if (/\/(display|menu)\.json$/.test(url.pathname)) return event.respondWith(networkFirst(request));
    return event.respondWith(caches.match(request).then(function (hit) { return hit || networkFirst(request); }));
  }
  if (request.destination === 'image' || request.destination === 'font' || /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    event.respondWith(cacheFirst(request));
  }
});
