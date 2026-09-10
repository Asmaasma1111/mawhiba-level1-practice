/* sync.js — مزامنة المحاولات المكتملة بين الأجهزة عبر Supabase.
   لا حساب ولا كلمة مرور: رمز مزامنة سرّي واحد يربط أجهزة العائلة.
   لا تُزامَن الجلسة الجارية إطلاقاً — القسم المؤقّت يبقى شأن الجهاز الذي يجري عليه. */

(function (global) {
  'use strict';

  var MW = global.MW, Store = MW.Store;
  var CODE_KEY = 'mawhiba.synccode.v1';
  var PUSHED_KEY = 'mawhiba.synced.v1';
  var LAST_KEY = 'mawhiba.synclast.v1';

  /* حروف بلا التباس: بلا 0 O 1 I L */
  var ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

  var BACKEND_KEY = 'mawhiba.supabase.v1';

  /* الإعداد يأتي من المتصفّح أولاً ثم من الملف.
     هكذا لا يحتاج تفعيل المزامنة إلى تعديل الشيفرة، ولا يدخل المفتاح
     إلى مستودع عامّ إطلاقاً. */
  function getBackend() {
    try {
      var raw = localStorage.getItem(BACKEND_KEY);
      if (raw) {
        var o = JSON.parse(raw);
        if (o && o.url && o.anonKey) return o;
      }
    } catch (e) {}
    var c = global.MW_SYNC_CONFIG || {};
    return (c.url && c.anonKey) ? { url: c.url, anonKey: c.anonKey } : null;
  }

  function setBackend(url, anonKey) {
    url = String(url || '').trim().replace(/\/+$/, '');
    anonKey = String(anonKey || '').trim();
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/i.test(url)) {
      throw new Error('العنوان يجب أن يكون بالشكل https://xxxx.supabase.co');
    }
    if (/^https?:/i.test(anonKey) || /\.supabase\.(co|in)/i.test(anonKey)) {
      throw new Error('هذا هو العنوان وليس المفتاح — يبدو أنّ الحقلين تبادلا. ' +
                      'المفتاح يبدأ بـ sb_publishable_ أو eyJ');
    }
    if (/service_role/i.test(anonKey) || /^sb_secret_/i.test(anonKey)) {
      throw new Error('هذا مفتاح سرّي (service_role / secret) — لا تستعمليه هنا. ' +
                      'المطلوب المفتاح العلني publishable.');
    }
    if (!/^sb_publishable_/.test(anonKey) && !/^eyJ/.test(anonKey)) {
      throw new Error('المفتاح يجب أن يبدأ بـ sb_publishable_ (المشاريع الجديدة) ' +
                      'أو eyJ (المشاريع الأقدم).');
    }
    if (anonKey.length < 30) throw new Error('المفتاح يبدو ناقصاً.');
    try { localStorage.setItem(BACKEND_KEY, JSON.stringify({ url: url, anonKey: anonKey })); }
    catch (e) { throw new Error('تعذّر الحفظ في هذا المتصفّح.'); }
    return true;
  }

  function clearBackend() { try { localStorage.removeItem(BACKEND_KEY); } catch (e) {} }

  function cfg() { return getBackend(); }

  function generateCode() {
    var out = '';
    var buf = new Uint32Array(12);
    (global.crypto || global.msCrypto).getRandomValues(buf);
    for (var i = 0; i < 12; i++) out += ALPHABET[buf[i] % ALPHABET.length];
    return out;
  }

  function normalise(code) {
    return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }
  function pretty(code) {
    return normalise(code).replace(/(.{4})(?=.)/g, '$1-');
  }

  function getCode() {
    try { return localStorage.getItem(CODE_KEY) || ''; } catch (e) { return ''; }
  }
  function setCode(code) {
    var c = normalise(code);
    if (c.length !== 12) throw new Error('رمز المزامنة يجب أن يكون ١٢ حرفاً.');
    try {
      localStorage.setItem(CODE_KEY, c);
      /* رمز جديد يعني مكتبة محاولات جديدة، فنعيد ضبط ما أُرسل */
      localStorage.removeItem(PUSHED_KEY);
    } catch (e) {}
    return c;
  }
  function clearCode() {
    try {
      localStorage.removeItem(CODE_KEY);
      localStorage.removeItem(PUSHED_KEY);
      localStorage.removeItem(LAST_KEY);
    } catch (e) {}
  }

  function pushedIds() {
    try { return JSON.parse(localStorage.getItem(PUSHED_KEY) || '[]'); } catch (e) { return []; }
  }
  function rememberPushed(ids) {
    var all = pushedIds().concat(ids);
    var seen = {}, out = [];
    all.forEach(function (i) { if (!seen[i]) { seen[i] = 1; out.push(i); } });
    try { localStorage.setItem(PUSHED_KEY, JSON.stringify(out)); } catch (e) {}
  }

  function lastSync() {
    try { return localStorage.getItem(LAST_KEY) || ''; } catch (e) { return ''; }
  }
  function stampSync() {
    try { localStorage.setItem(LAST_KEY, new Date().toISOString()); } catch (e) {}
  }

  function rpc(name, body) {
    var c = cfg();
    if (!c) return Promise.reject(new Error('المزامنة غير مُعدّة.'));
    return fetch(c.url.replace(/\/+$/, '') + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: {
        'apikey': c.anonKey,
        'Authorization': 'Bearer ' + c.anonKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    }).then(function (r) {
      if (!r.ok) {
        return r.text().then(function (t) {
          throw new Error('الخادم ردّ ' + r.status + (t ? ': ' + t.slice(0, 160) : ''));
        });
      }
      return r.json();
    });
  }

  /* دمج ودفع. المحاولات لا تُعدَّل بعد انتهائها، فالدمج بالمعرّف كافٍ ولا تعارض فيه. */
  function run() {
    var code = getCode();
    if (!cfg()) return Promise.resolve({ skipped: 'unconfigured' });
    if (!code) return Promise.resolve({ skipped: 'nocode' });

    var local = Store.getAttempts();
    var localIds = {};
    local.forEach(function (a) { localIds[a.id] = true; });

    var already = {};
    pushedIds().forEach(function (i) { already[i] = true; });
    var toPush = local.filter(function (a) { return !already[a.id]; });

    return rpc('mawhiba_pull', { p_code: code }).then(function (rows) {
      var incoming = (rows || []).filter(function (a) { return a && a.id && !localIds[a.id]; });
      if (incoming.length) Store.mergeAttempts(incoming);
      /* أيّ محاولة رجعت من الخادم فهي مرفوعة أصلاً */
      rememberPushed((rows || []).map(function (a) { return a && a.id; }).filter(Boolean));

      if (!toPush.length) { stampSync(); return { pulled: incoming.length, pushed: 0 }; }

      /* على دفعات، حتى لا تتجاوز أيّ نداءة حدّ الخادم */
      var chunks = [];
      for (var i = 0; i < toPush.length; i += 50) chunks.push(toPush.slice(i, i + 50));
      return chunks.reduce(function (chain, part) {
        return chain.then(function () {
          return rpc('mawhiba_push', { p_code: code, p_rows: part }).then(function () {
            rememberPushed(part.map(function (a) { return a.id; }));
          });
        });
      }, Promise.resolve()).then(function () {
        stampSync();
        return { pulled: incoming.length, pushed: toPush.length };
      });
    });
  }

  /* مزامنة صامتة في الخلفية: لا تعطّل شيئاً ولا تُظهر خطأً للطفلة */
  function quietRun() {
    try {
      return run().catch(function () { return { failed: true }; });
    } catch (e) { return Promise.resolve({ failed: true }); }
  }

  /* رابط إعداد لجهاز ثانٍ. المعلومات في جزء التجزئة (#) فلا تُرسل إلى أيّ خادم. */
  function makeSetupLink() {
    var b = getBackend();
    if (!b) throw new Error('لا يوجد إعداد لنسخه.');
    var payload = { u: b.url, k: b.anonKey, c: getCode() || '' };
    var json = JSON.stringify(payload);
    /* base64 آمن داخل الروابط: بلا + و / و = */
    var b64 = btoa(unescape(encodeURIComponent(json)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    var base = location.href.split('#')[0].replace(/parent\.html$/, 'parent.html');
    return base + '#setup=' + b64;
  }

  /* يقرأ رابط الإعداد عند فتح الصفحة ويطبّقه مرّة واحدة */
  function consumeSetupLink() {
    var m = /[#&]setup=([A-Za-z0-9_-]+)/.exec(location.hash || '');
    if (!m) return null;
    try {
      var b = m[1].replace(/-/g, '+').replace(/_/g, '/');
      while (b.length % 4) b += '=';                 /* إعادة الحشو قبل فكّ الترميز */
      var json = decodeURIComponent(escape(atob(b)));
      var o = JSON.parse(json);
      setBackend(o.u, o.k);
      if (o.c) setCode(o.c);
      history.replaceState(null, '', location.pathname + location.search);
      return { url: o.u, code: o.c || '' };
    } catch (e) {
      history.replaceState(null, '', location.pathname + location.search);
      /* نُبقي السبب الحقيقي: «مفتاح service_role» يختلف عن «رابط تالف» */
      throw new Error('رابط الإعداد لم يُقبل — ' + (e && e.message ? e.message : 'رابط تالف.'));
    }
  }

  /* اختبار اتصال حقيقي برمز غير مستعمل: يثبت أنّ المفتاح صالح وأنّ الدالتين مثبّتتان،
     دون لمس أيّ بيانات. */
  function testConnection() {
    return rpc('mawhiba_pull', { p_code: generateCode() }).then(function () { return true; });
  }

  MW.Sync = {
    configured: function () { return !!cfg(); },
    testConnection: testConnection,
    getBackend: getBackend,
    setBackend: setBackend,
    clearBackend: clearBackend,
    makeSetupLink: makeSetupLink,
    consumeSetupLink: consumeSetupLink,
    generateCode: generateCode,
    getCode: getCode,
    setCode: setCode,
    clearCode: clearCode,
    normalise: normalise,
    pretty: pretty,
    lastSync: lastSync,
    run: run,
    quietRun: quietRun
  };
})(window);
