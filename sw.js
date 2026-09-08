/* sw.js — تخزين مؤقّت بسيط ليعمل التطبيق بلا إنترنت بعد أول فتح.
   يُسجَّل فقط عند التشغيل عبر https (مثل GitHub Pages)، ويُتجاهَل عند الفتح من القرص. */

var CACHE = 'mawhiba-v1';
var ASSETS = [
  './', 'index.html', 'parent.html', 'styles.css',
  'data.js', 'shapes.js', 'engine.js', 'app.js', 'parent.js',
  'exams.json',
  'fonts/Tajawal-Regular-arabic.woff2', 'fonts/Tajawal-Regular-latin.woff2',
  'fonts/Tajawal-Bold-arabic.woff2', 'fonts/Tajawal-Bold-latin.woff2'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return c.addAll(ASSETS);
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.map(function (k) {
      return k === CACHE ? null : caches.delete(k);
    }));
  }).then(function () { return self.clients.claim(); }));
});

/* من الذاكرة أولاً حتى يعمل بلا شبكة، مع تحديث النسخة في الخلفية */
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(function (hit) {
      var net = fetch(e.request).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
        }
        return res;
      }).catch(function () { return hit; });
      return hit || net;
    })
  );
});
