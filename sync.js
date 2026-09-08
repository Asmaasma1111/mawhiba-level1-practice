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

  function cfg() {
    var c = global.MW_SYNC_CONFIG || {};
    return (c.url && c.anonKey) ? c : null;
  }

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

  MW.Sync = {
    configured: function () { return !!cfg(); },
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
