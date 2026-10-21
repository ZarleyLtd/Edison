var CACHE = 'edison-shell-v3';
var SHELL = [
  './',
  './index.html',
  './ticket.html',
  './settings.html',
  './manifest.json',
  './apps.json',
  './agents.json',
  './assets/css/style.css',
  './assets/css/brief-message.css',
  './assets/icons/icon.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/js/config/app-config.js',
  './assets/js/utils/auth.js',
  './assets/js/utils/api.js',
  './assets/js/utils/labels.js',
  './assets/js/utils/query.js',
  './assets/js/utils/formatters.js',
  './assets/js/utils/image-compress.js',
  './assets/js/utils/brief-message.js',
  './assets/js/utils/apps.js',
  './assets/js/utils/agents.js',
  './assets/js/utils/setup.js',
  './assets/js/components/ticket-card.js',
  './assets/js/components/ticket-view.js',
  './assets/js/pages/list.js',
  './assets/js/pages/ticket.js',
  './assets/js/pages/settings.js',
  './assets/js/main.js'
];

self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(CACHE).then(function (cache) {
    return cache.addAll(SHELL);
  }));
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (key) { return key !== CACHE; }).map(function (key) {
      return caches.delete(key);
    }));
  }));
  self.clients.claim();
});

self.addEventListener('fetch', function (event) {
  var url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== 'GET') return;
  event.respondWith(fetch(event.request).then(function (response) {
    var copy = response.clone();
    caches.open(CACHE).then(function (cache) { cache.put(event.request, copy); });
    return response;
  }).catch(function () {
    return caches.match(event.request);
  }));
});
