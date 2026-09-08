/* data.js — تحميل بيانات الاختبارات + التخزين المحلي
   exams.json هو المصدر الوحيد للأسئلة. لا يُعدَّل ولا تُكرَّر أسئلته هنا. */

(function (global) {
  'use strict';

  var DATA_KEY   = 'mawhiba.exams.v1';
  var SESSION_KEY= 'mawhiba.session.v1';
  var ATTEMPTS_KEY='mawhiba.attempts.v1';

  /* ---------- أرقام عربية ---------- */
  var AR = ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'];
  function arDigits(v) {
    return String(v).replace(/[0-9]/g, function (d) { return AR[+d]; });
  }
  function arLetter(i) { return ['أ','ب','ج','د','هـ','و'][i] || String(i + 1); }

  function mmss(ms) {
    if (ms < 0) ms = 0;
    var t = Math.ceil(ms / 1000);
    var m = Math.floor(t / 60), s = t % 60;
    return arDigits((m < 10 ? '0' : '') + m) + ':' + arDigits((s < 10 ? '0' : '') + s);
  }
  function minutesText(ms) {
    var t = Math.round(ms / 1000), m = Math.floor(t / 60), s = t % 60;
    if (m === 0) return arDigits(s) + ' ث';
    return arDigits(m) + ' د ' + arDigits((s < 10 ? '0' : '') + s) + ' ث';
  }
  function dateText(iso) {
    try {
      return new Intl.DateTimeFormat('ar-u-ca-gregory-nu-arab', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
      }).format(new Date(iso));
    } catch (e) { return iso; }
  }

  /* ---------- تخزين ---------- */
  function readJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { return false; }
  }

  var Store = {
    getAttempts: function () { return readJSON(ATTEMPTS_KEY, []); },
    addAttempt: function (a) {
      var list = Store.getAttempts();
      list.push(a);
      writeJSON(ATTEMPTS_KEY, list);
      return list;
    },
    /* دمج محاولات واردة من جهاز آخر. المحاولة لا تتغيّر بعد انتهائها،
       فالدمج بالمعرّف كافٍ ولا ينشأ عنه تعارض. */
    mergeAttempts: function (incoming) {
      var list = Store.getAttempts();
      var seen = {};
      list.forEach(function (a) { seen[a.id] = true; });
      var added = 0;
      (incoming || []).forEach(function (a) {
        if (a && a.id && !seen[a.id]) { list.push(a); seen[a.id] = true; added++; }
      });
      if (added) {
        list.sort(function (x, y) { return new Date(x.finishedAt) - new Date(y.finishedAt); });
        writeJSON(ATTEMPTS_KEY, list);
      }
      return added;
    },
    getSession: function () { return readJSON(SESSION_KEY, null); },
    setSession: function (s) { writeJSON(SESSION_KEY, s); },
    clearSession: function () { try { localStorage.removeItem(SESSION_KEY); } catch (e) {} },
    resetAll: function () {
      try {
        localStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(ATTEMPTS_KEY);
      } catch (e) {}
    },
    forgetDataFile: function () { try { localStorage.removeItem(DATA_KEY); } catch (e) {} }
  };

  /* ---------- تحميل ملف الأسئلة ----------
     المتصفحات تمنع fetch من file:// لأسباب أمنية، لذلك:
     1) نحاول fetch (ينجح لو شُغّل عبر خادم محلي)
     2) ثم النسخة المحفوظة في localStorage
     3) وإلا نطلب من المستخدمة اختيار exams.json مرة واحدة  */

  function validate(obj) {
    if (!obj || !obj.meta || !Array.isArray(obj.exams) || !obj.exams.length) {
      throw new Error('ملف غير صالح: يجب أن يحتوي على meta و exams.');
    }
    obj.exams.forEach(function (ex) {
      if (!Array.isArray(ex.blocks) || !ex.blocks.length) {
        throw new Error('النموذج ' + (ex.id || '?') + ' بلا أقسام.');
      }
      ex.blocks.forEach(function (b) {
        if (!Array.isArray(b.questions) || typeof b.seconds !== 'number') {
          throw new Error('قسم ناقص في ' + (ex.id || '?'));
        }
      });
    });
    return obj;
  }

  function cacheText(text) { try { localStorage.setItem(DATA_KEY, text); } catch (e) {} }

  function tryFetch() {
    return new Promise(function (resolve) {
      if (location.protocol === 'file:' || typeof fetch !== 'function') return resolve(null);
      fetch('exams.json', { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.text() : null; })
        .then(resolve)
        .catch(function () { resolve(null); });
    });
  }

  var Data = {
    meta: null,
    exams: [],
    ready: false,

    adopt: function (text) {
      var obj = validate(JSON.parse(text));
      Data.meta = obj.meta;
      Data.exams = obj.exams;
      Data.ready = true;
      cacheText(text);
      return obj;
    },

    /* يرجع true إذا نجح التحميل، false إذا احتجنا لاختيار الملف يدوياً */
    load: function () {
      return tryFetch().then(function (text) {
        if (text) { try { Data.adopt(text); return true; } catch (e) {} }
        var cached = null;
        try { cached = localStorage.getItem(DATA_KEY); } catch (e) {}
        if (cached) { try { Data.adopt(cached); return true; } catch (e) {} }
        return false;
      });
    },

    readFile: function (file) {
      return new Promise(function (resolve, reject) {
        var fr = new FileReader();
        fr.onerror = function () { reject(new Error('تعذّرت قراءة الملف.')); };
        fr.onload = function () {
          try { Data.adopt(String(fr.result)); resolve(true); }
          catch (e) { reject(e); }
        };
        fr.readAsText(file, 'utf-8');
      });
    },

    exam: function (id) {
      for (var i = 0; i < Data.exams.length; i++) {
        if (Data.exams[i].id === id) return Data.exams[i];
      }
      return null;
    },

    /* إجمالي أسئلة النموذج ومدته — محسوبان من الملف، لا ثوابت */
    examStats: function (ex) {
      var q = 0, s = 0;
      ex.blocks.forEach(function (b) { q += b.questions.length; s += b.seconds; });
      return { questions: q, seconds: s, blocks: ex.blocks.length };
    },

    domainName: function (key) {
      return (Data.meta && Data.meta.domains && Data.meta.domains[key]) || key;
    },
    domainKeys: function () {
      return Data.meta && Data.meta.domains ? Object.keys(Data.meta.domains) : [];
    }
  };

  /* ---------- تهيئة الواجهة (ليست من أسئلة الاختبار) ----------
     غرضها الوحيد أن تتعرّف الطفلة على شكل الشاشة قبل أن يبدأ العدّ.
     صُمّمت لتكون بدهية، ولا تُحتسب في الدرجة. */
  var WARMUP = [
    {
      id: 'warm1',
      type: 'text',
      prompt: 'ما لون السماء في نهارٍ صافٍ؟',
      options: ['أخضر', 'أزرق', 'أسود', 'بنّي'],
      answer: 1,
      explain: 'هذا سؤال تهيئة فقط، لنجرّب اختيار الإجابة.'
    },
    {
      id: 'warm2',
      type: 'figural',
      prompt: 'أكملي المتتابعة.',
      stimulus: {
        kind: 'row',
        items: [
          { shape: 'circle', fill: 'solid' },
          { shape: 'circle', fill: 'empty' },
          { shape: 'circle', fill: 'solid' },
          { blank: true }
        ]
      },
      optionShapes: [
        { shape: 'circle', fill: 'empty' },
        { shape: 'circle', fill: 'solid' },
        { shape: 'square', fill: 'empty' },
        { shape: 'circle', fill: 'half' }
      ],
      answer: 0,
      explain: 'هذا سؤال تهيئة فقط، لنجرّب اختيار شكل.'
    }
  ];

  global.MW = {
    Data: Data,
    Store: Store,
    WARMUP: WARMUP,
    arDigits: arDigits,
    arLetter: arLetter,
    mmss: mmss,
    minutesText: minutesText,
    dateText: dateText
  };
})(window);
