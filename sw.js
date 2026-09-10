/* sw.js — تخزين مؤقّت بسيط ليعمل التطبيق بلا إنترنت بعد أول فتح.
   يُسجَّل فقط عند التشغيل عبر https (مثل GitHub Pages)، ويُتجاهَل عند الفتح من القرص. */

var CACHE = 'mawhiba-v9';
var ASSETS = [
  './', 'index.html', 'parent.html', 'revise.html', 'styles.css',
  'data.js', 'icons.js', 'shapes.js', 'diagrams.js', 'engine.js', 'app.js', 'parent.js',
  'sync.js', 'sync-config.js', 'revise.js',
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
  }).then(function () { return self.clients.claim(); })
    .then(function () { return self.clients.matchAll({ type: 'window' }); })
    .then(function (clients) {
      /* الصفحات المفتوحة تكون قد حمّلت النسخة القديمة بالفعل؛ نُعلمها لتقرّر
         بنفسها متى تُحدِّث — ولا تُحدِّث أبداً أثناء قسم مؤقّت جارٍ. */
      clients.forEach(function (c) { c.postMessage({ type: 'sw-updated' }); });
    }));
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;

  /* لا نتدخّل في نداءات المزامنة إطلاقاً */
  var url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;

  /* الصفحات: من الشبكة أولاً حتى يصل أيّ تحديث فوراً، ومن الذاكرة عند انقطاعها */
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
        return res;
      }).catch(function () {
        return caches.match(e.request).then(function (hit) {
          return hit || caches.match('index.html');
        });
      })
    );
    return;
  }

  /* الملفات: من الذاكرة أولاً حتى يعمل بلا شبكة، مع تحديث النسخة في الخلفية */
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
