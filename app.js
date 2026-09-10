/* app.js — الشاشات وربطها بالمحرّك */

(function (global) {
  'use strict';

  var MW = global.MW;
  var Data = MW.Data, Store = MW.Store, Shapes = MW.Shapes;
  var arD = MW.arDigits, arL = MW.arLetter, mmss = MW.mmss;

  var engine = new MW.Engine();
  var warmIndex = 0, warmAnswers = {};
  var lastResult = null;
  var speed = 1;

  /* وضع الفحص: ?dev=1&speed=20 يسرّع المؤقّت لتجربة سلوك انتهاء الوقت */
  (function () {
    var p = new URLSearchParams(location.search);
    if (p.get('dev') === '1') {
      var sp = parseFloat(p.get('speed'));
      if (sp > 0) speed = sp;
    }
  })();

  function $(sel) { return document.querySelector(sel); }
  function esc(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function show(id) {
    Array.prototype.forEach.call(document.querySelectorAll('.view'), function (v) {
      v.hidden = (v.id !== id);
    });
    window.scrollTo(0, 0);
  }

  /* ---------- نافذة تأكيد ---------- */
  function confirmBox(title, body, okLabel, cancelLabel) {
    return new Promise(function (resolve) {
      var wrap = document.createElement('div');
      wrap.className = 'modal-wrap';
      wrap.innerHTML =
        '<div class="modal" role="dialog" aria-modal="true">' +
        '<h2>' + esc(title) + '</h2>' +
        '<p>' + esc(body) + '</p>' +
        '<div class="modal-actions">' +
        '<button class="btn ghost" data-no>' + esc(cancelLabel || 'رجوع') + '</button>' +
        '<button class="btn primary" data-yes>' + esc(okLabel || 'نعم') + '</button>' +
        '</div></div>';
      document.body.appendChild(wrap);
      function done(v) { wrap.remove(); resolve(v); }
      wrap.querySelector('[data-yes]').onclick = function () { done(true); };
      wrap.querySelector('[data-no]').onclick = function () { done(false); };
      wrap.querySelector('[data-no]').focus();
    });
  }

  var toastTimer = null;
  function toast(text, ms) {
    var t = $('#toast');
    t.textContent = text;
    t.hidden = false;
    t.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      t.classList.remove('on');
      setTimeout(function () { t.hidden = true; }, 400);
    }, ms || 6000);
  }

  /* ================= التحميل ================= */
  function boot() {
    Data.load().then(function (ok) {
      if (ok) { renderHome(); show('view-home'); autoSync(); }
      else { show('view-loader'); }
    });
  }

  /* مزامنة صامتة: لا تعطّل شيئاً، ولا تعمل أثناء الاختبار حتى لا يتأثّر المؤقّت */
  function autoSync() {
    var Sync = MW.Sync;
    if (!Sync || !Sync.configured() || !Sync.getCode()) { renderSyncStatus(null); return; }
    renderSyncStatus('working');
    Sync.quietRun().then(function (r) {
      renderSyncStatus(r && !r.failed && !r.skipped ? r : 'failed');
      if (r && r.pulled) renderHome();
    });
  }

  function renderSyncStatus(state) {
    var line = $('#sync-status');
    if (!line) return;
    var Sync = MW.Sync;
    if (!Sync || !Sync.configured() || !Sync.getCode()) { line.hidden = true; return; }
    line.hidden = false;
    if (state === 'working') { line.textContent = 'جاري المزامنة…'; return; }
    if (state === 'failed') {
      line.textContent = 'تعذّرت المزامنة الآن — التقدّم محفوظ على الجهاز وسنحاول لاحقاً.';
      return;
    }
    var last = Sync.lastSync();
    line.textContent = last
      ? 'آخر مزامنة: ' + MW.dateText(last)
      : 'المزامنة مفعّلة على هذا الجهاز.';
  }

  function wireLoader() {
    var input = $('#file-input');
    var drop = $('#drop');
    function take(file) {
      if (!file) return;
      Data.readFile(file).then(function () {
        $('#load-error').hidden = true;
        renderHome(); show('view-home');
      }).catch(function (e) {
        var box = $('#load-error');
        box.textContent = 'تعذّر قراءة الملف: ' + e.message;
        box.hidden = false;
      });
    }
    input.onchange = function () { take(input.files[0]); };
    ['dragenter', 'dragover'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); });
    });
    drop.addEventListener('drop', function (e) {
      take(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]);
    });
  }

  /* ================= الرئيسية ================= */
  function renderHome() {
    var host = $('#exam-list');
    host.innerHTML = Data.exams.map(function (ex) {
      var st = Data.examStats(ex);
      var done = Store.getAttempts().filter(function (a) { return a.examId === ex.id; });
      var best = done.reduce(function (m, a) { return Math.max(m, a.score); }, -1);
      return '<article class="card exam">' +
        '<h3>' + esc(ex.title) + '</h3>' +
        '<p class="meta">' + arD(st.questions) + ' سؤالاً · ' + arD(st.blocks) + ' أقسام · ' +
          arD(Math.round(st.seconds / 60)) + ' دقيقة</p>' +
        (done.length
          ? '<p class="meta">جُرّب ' + arD(done.length) + ' مرة · أفضل نتيجة ' +
            arD(best) + ' من ' + arD(st.questions) + '</p>'
          : '<p class="meta subtle">لم يُجرَّب بعد</p>') +
        '<button class="btn primary" data-exam="' + esc(ex.id) + '">ابدئي هذا النموذج</button>' +
        '</article>';
    }).join('');

    Array.prototype.forEach.call(host.querySelectorAll('[data-exam]'), function (b) {
      b.onclick = function () { beginExam(b.getAttribute('data-exam')); };
    });

    /* استئناف جلسة */
    var s = Store.getSession();
    var banner = $('#resume-banner');
    if (s && !s.finished && Data.exam(s.examId)) {
      var ex = Data.exam(s.examId);
      banner.hidden = false;
      banner.querySelector('.txt').textContent =
        'لديكِ محاولة لم تكتمل في «' + ex.title + '» — القسم ' +
        arD((s.bi || 0) + 1) + ' من ' + arD(ex.blocks.length) + '.';
      banner.querySelector('[data-resume]').onclick = function () {
        if (engine.resume(s)) { wireTest(); renderBlock(); show('view-test'); }
      };
      banner.querySelector('[data-discard]').onclick = function () {
        confirmBox('حذف المحاولة غير المكتملة؟',
          'ستُحذف الإجابات المسجّلة في هذه المحاولة ولن يمكن استرجاعها.',
          'احذفيها', 'رجوع').then(function (yes) {
          if (yes) { Store.clearSession(); renderHome(); }
        });
      };
    } else {
      banner.hidden = true;
    }

    /* المحاولات السابقة */
    var att = Store.getAttempts().slice().reverse();
    var hist = $('#history');
    if (!att.length) {
      hist.innerHTML = '<p class="subtle">لا توجد محاولات سابقة بعد.</p>';
    } else {
      hist.innerHTML = '<table class="tbl"><thead><tr>' +
        '<th>التاريخ</th><th>النموذج</th><th>الدرجة</th><th>بلا إجابة</th>' +
        '</tr></thead><tbody>' +
        att.slice(0, 8).map(function (a) {
          return '<tr><td>' + esc(MW.dateText(a.finishedAt)) + '</td>' +
            '<td>' + esc(a.examTitle) + '</td>' +
            '<td>' + arD(a.score) + ' / ' + arD(a.total) + '</td>' +
            '<td>' + arD(a.totalUnanswered) + '</td></tr>';
        }).join('') + '</tbody></table>';
    }
  }

  /* ================= التعليمات والتهيئة ================= */
  var pendingExamId = null;

  function beginExam(examId) {
    pendingExamId = examId;
    var ex = Data.exam(examId);
    var st = Data.examStats(ex);
    $('#instr-title').textContent = ex.title;
    $('#instr-facts').innerHTML =
      '<li>عدد الأسئلة: <b>' + arD(st.questions) + '</b></li>' +
      '<li>عدد الأقسام: <b>' + arD(st.blocks) + '</b></li>' +
      '<li>الزمن الكامل: <b>' + arD(Math.round(st.seconds / 60)) + ' دقيقة</b></li>';
    warmIndex = 0; warmAnswers = {};
    show('view-instructions');
  }

  function wireInstructions() {
    $('#to-warmup').onclick = function () { warmIndex = 0; renderWarm(); show('view-warmup'); };
    $('#instr-back').onclick = function () { renderHome(); show('view-home'); };
    $('#warm-back').onclick = function () { show('view-instructions'); };
    $('#warm-start').onclick = function () {
      engine.start(pendingExamId, speed);
      wireTest();
      renderBlock();
      show('view-test');
    };
  }

  function renderWarm() {
    var q = MW.WARMUP[warmIndex];
    var host = $('#warm-body');
    host.innerHTML =
      '<p class="qcount">تهيئة ' + arD(warmIndex + 1) + ' من ' + arD(MW.WARMUP.length) + '</p>' +
      '<p class="prompt">' + esc(q.prompt) + '</p>' +
      (q.stimulus ? Shapes.stimulus(q.stimulus) : '') +
      optionsHTML(q, warmAnswers[q.id]) +
      '<p class="warm-feedback" id="warm-feedback"></p>';

    Array.prototype.forEach.call(host.querySelectorAll('.opt'), function (btn) {
      btn.onclick = function () {
        var i = +btn.getAttribute('data-i');
        warmAnswers[q.id] = i;
        renderWarm();
        var fb = $('#warm-feedback');
        fb.textContent = (i === q.answer)
          ? 'أحسنتِ. هكذا تُختار الإجابة.'
          : 'الإجابة الصحيحة هي «' + optionLabel(q, q.answer) + '». لا بأس، هذه تهيئة فقط.';
        fb.className = 'warm-feedback ' + (i === q.answer ? 'good' : 'note');
      };
    });

    $('#warm-next').hidden = (warmIndex >= MW.WARMUP.length - 1);
    $('#warm-start').hidden = (warmIndex < MW.WARMUP.length - 1);
    $('#warm-next').onclick = function () { warmIndex++; renderWarm(); };
  }

  function optionLabel(q, i) {
    if (q.options && q.options[i] !== undefined) return q.options[i];
    return 'الخيار ' + arL(i);
  }

  /* ================= شاشة الاختبار ================= */
  function optionsHTML(q, chosen) {
    var shapes = q.optionShapes;
    var isShapes = Array.isArray(shapes) && shapes.length;
    var n = isShapes ? shapes.length : (q.options || []).length;
    var out = '<div class="options ' + (isShapes ? 'shapes' : 'texts') + '" role="radiogroup">';
    for (var i = 0; i < n; i++) {
      var sel = (chosen === i) ? ' selected' : '';
      out += '<button type="button" class="opt' + sel + '" data-i="' + i + '"' +
        ' role="radio" aria-checked="' + (chosen === i) + '">' +
        '<span class="tick" aria-hidden="true"></span>' +
        '<span class="lbl">' + arL(i) + '</span>' +
        '<span class="body">' +
        (isShapes ? Shapes.svg(shapes[i], 'shape opt-shape') : esc(q.options[i])) +
        '</span></button>';
    }
    return out + '</div>';
  }

  function renderBlock() {
    var b = engine.block();
    var ex = engine.exam;
    $('#block-title').textContent = b.title;
    $('#block-count').textContent =
      'القسم ' + arD(engine.s.bi + 1) + ' من ' + arD(ex.blocks.length);
    $('#block-instructions').textContent = b.instructions || '';
    updateTimer(engine.remaining());
    renderQuestion();
  }

  function renderQuestion() {
    var b = engine.block();
    var q = engine.question();
    var a = engine.answerOf(q);

    $('#q-count').textContent =
      'السؤال ' + arD(engine.s.qi + 1) + ' من ' + arD(b.questions.length);

    var passage = b.passage
      ? '<section class="passage"><h3>' + esc(b.passage.title) + '</h3><p>' +
        esc(b.passage.text) + '</p></section>'
      : '';

    $('#q-body').innerHTML =
      passage +
      '<p class="prompt">' + esc(q.prompt) + '</p>' +
      (q.stimulus ? Shapes.stimulus(q.stimulus) : '') +
      optionsHTML(q, a.c);

    Array.prototype.forEach.call($('#q-body').querySelectorAll('.opt'), function (btn) {
      btn.onclick = function () {
        engine.choose(+btn.getAttribute('data-i'));
        renderQuestion();
      };
    });

    var flagBtn = $('#flag-btn');
    flagBtn.classList.toggle('on', !!a.f);
    flagBtn.setAttribute('aria-pressed', String(!!a.f));
    flagBtn.querySelector('.t').textContent = a.f ? 'مُعلَّم للمراجعة' : 'علّمي للمراجعة';

    $('#prev-btn').disabled = (engine.s.qi === 0);
    $('#next-btn').disabled = (engine.s.qi === b.questions.length - 1);

    renderStrip();
  }

  function renderStrip() {
    var b = engine.block();
    var strip = $('#strip');
    strip.innerHTML = b.questions.map(function (q, i) {
      var a = engine.answerOf(q);
      var cls = 'pip';
      if (a.c !== null && a.c !== undefined) cls += ' answered';
      if (a.f) cls += ' flagged';
      if (i === engine.s.qi) cls += ' current';
      return '<button type="button" class="' + cls + '" data-i="' + i + '"' +
        ' title="السؤال ' + arD(i + 1) + '">' + arD(i + 1) + '</button>';
    }).join('');
    Array.prototype.forEach.call(strip.querySelectorAll('.pip'), function (p) {
      p.onclick = function () { engine.goTo(+p.getAttribute('data-i')); renderQuestion(); };
    });

    var left = engine.unansweredInBlock(engine.s.bi);
    $('#strip-summary').textContent = left
      ? 'بقي بلا إجابة في هذا القسم: ' + arD(left)
      : 'أجبتِ عن كل أسئلة هذا القسم.';
  }

  function updateTimer(rem) {
    var t = $('#timer');
    t.textContent = mmss(rem);
    var b = engine.block();
    var frac = Math.max(0, Math.min(1, rem / (b.seconds * 1000)));
    $('#timer-bar').style.transform = 'scaleX(' + frac.toFixed(4) + ')';
    t.parentNode.classList.toggle('ending', rem <= 60000);
  }

  function wireTest() {
    engine.onTick = updateTimer;
    engine.onAdvance = function (bi, reason) {
      renderBlock();
      if (reason === 'timeout') {
        toast('انتهى وقت القسم السابق وأُغلق. أنتِ الآن في القسم ' + arD(bi + 1) + '.');
      }
    };
    engine.onFinish = function () { finishAndShowResults(); };
  }

  function wireTestControls() {
    $('#prev-btn').onclick = function () { engine.prev(); renderQuestion(); };
    $('#next-btn').onclick = function () { engine.next(); renderQuestion(); };
    $('#flag-btn').onclick = function () { engine.toggleFlag(); renderQuestion(); };

    $('#end-block-btn').onclick = function () {
      var left = engine.unansweredInBlock(engine.s.bi);
      var last = engine.s.bi === engine.exam.blocks.length - 1;
      var msg = (left ? 'ما زال ' + arD(left) + ' سؤالاً بلا إجابة في هذا القسم. ' : '') +
        'بعد الإغلاق لا يمكن العودة إلى هذا القسم.';
      confirmBox(last ? 'إنهاء الاختبار؟' : 'إغلاق هذا القسم والانتقال؟', msg,
        last ? 'أنهي الاختبار' : 'أغلقي وانتقلي', 'أكملي هنا').then(function (yes) {
        if (yes) engine.finishBlock('manual');
      });
    };

    document.addEventListener('keydown', function (e) {
      if ($('#view-test').hidden) return;
      if (document.querySelector('.modal-wrap')) return;
      var b = engine.block();
      if (e.key === 'ArrowLeft') { engine.next(); renderQuestion(); }
      else if (e.key === 'ArrowRight') { engine.prev(); renderQuestion(); }
      else if (/^[1-4]$/.test(e.key)) {
        var q = engine.question();
        var n = (q.optionShapes || q.options || []).length;
        var i = +e.key - 1;
        if (i < n) { engine.choose(i); renderQuestion(); }
      }
    });

    window.addEventListener('beforeunload', function () { if (engine.s) engine.save(); });
    document.addEventListener('visibilitychange', function () { if (engine.s) engine.save(); });
  }

  /* ================= النتائج ================= */
  function finishAndShowResults() {
    var r = engine.grade();
    var attempt = {
      id: 'a' + Date.now(),
      examId: r.examId, examTitle: r.examTitle,
      startedAt: r.startedAt, finishedAt: r.finishedAt,
      score: r.score, total: r.total,
      byDomain: r.byDomain,
      totalUnanswered: r.totalUnanswered,
      timedOutBlocks: r.timedOutBlocks,
      blocks: r.blocks.map(function (b) {
        return { id: b.id, title: b.title, domain: b.domain, count: b.count,
                 score: b.score, unanswered: b.unanswered, used: Math.round(b.used),
                 seconds: b.seconds, endedBy: b.endedBy };
      }),
      items: r.items.map(function (it) {
        return { qid: it.qid, blockId: it.blockId, domain: it.domain,
                 chose: it.chose, correct: it.correct, ok: it.ok, flagged: it.flagged };
      })
    };
    Store.addAttempt(attempt);
    Store.clearSession();
    lastResult = r;
    renderResults(r);
    show('view-results');
    /* بعد انتهاء الاختبار فقط — لا شيء يجري أثناء الأقسام المؤقّتة */
    if (MW.Sync) MW.Sync.quietRun();
  }

  function renderResults(r) {
    $('#res-exam').textContent = r.examTitle;
    $('#res-score').textContent = arD(r.score);
    $('#res-total').textContent = 'من ' + arD(r.total);
    $('#res-unanswered').textContent = arD(r.totalUnanswered);
    $('#res-timedout').textContent =
      r.timedOutBlocks
        ? 'انتهى الوقت في ' + arD(r.timedOutBlocks) + ' من الأقسام قبل إنهائها.'
        : 'لم ينتهِ الوقت في أيّ قسم قبل إنهائه.';

    /* المجالات الأربعة */
    $('#res-domains').innerHTML = Data.domainKeys().map(function (k) {
      var d = r.byDomain[k] || { score: 0, total: 0 };
      var pct = d.total ? Math.round(d.score / d.total * 100) : 0;
      return '<div class="dom">' +
        '<div class="dom-head"><span class="dom-name">' + esc(Data.domainName(k)) + '</span>' +
        '<span class="dom-num">' + arD(d.score) + ' / ' + arD(d.total) + '</span></div>' +
        '<div class="bar"><span style="width:' + pct + '%"></span></div>' +
        '</div>';
    }).join('');

    /* الأقسام */
    $('#res-blocks').innerHTML =
      '<table class="tbl blocks"><thead><tr>' +
      '<th>القسم</th><th>الدرجة</th><th>الزمن المستخدم</th>' +
      '<th class="hi">بلا إجابة عند انتهاء الوقت</th><th>كيف انتهى</th>' +
      '</tr></thead><tbody>' +
      r.blocks.map(function (b) {
        var how = b.endedBy === 'timeout' ? 'انتهى الوقت'
                : b.endedBy === 'manual' ? 'أُغلق مبكّراً' : '—';
        return '<tr' + (b.unanswered ? ' class="has-gap"' : '') + '>' +
          '<td>' + esc(b.title) + '</td>' +
          '<td>' + arD(b.score) + ' / ' + arD(b.count) + '</td>' +
          '<td>' + esc(MW.minutesText(b.used)) + ' من ' + arD(Math.round(b.seconds / 60)) + ' د</td>' +
          '<td class="hi big">' + arD(b.unanswered) + '</td>' +
          '<td>' + how + '</td></tr>';
      }).join('') + '</tbody></table>';

    /* مراجعة كل سؤال */
    var ex = Data.exam(r.examId);
    var html = '';
    ex.blocks.forEach(function (b, bi) {
      html += '<h3 class="rev-block">' + esc(b.title) + '</h3>';
      b.questions.forEach(function (q, qi) {
        var it = r.items.filter(function (x) { return x.qid === q.id; })[0];
        var chose = it ? it.chose : null;
        var cls = it && it.ok ? 'ok' : (chose === null ? 'blank' : 'wrong');
        html += '<article class="rev ' + cls + '">' +
          '<p class="rev-q"><span class="rev-n">' + arD(qi + 1) + '</span>' + esc(q.prompt) + '</p>' +
          (q.stimulus ? Shapes.stimulus(q.stimulus, 'small') : '') +
          '<p class="rev-line"><span class="tag">إجابتها</span> ' +
            (chose === null ? '<i class="none">لم تُجب</i>' : revAnswer(q, chose)) + '</p>' +
          '<p class="rev-line"><span class="tag good">الصحيحة</span> ' + revAnswer(q, q.answer) + '</p>' +
          (q.explain ? '<p class="rev-explain">' + esc(q.explain) + '</p>' : '') +
          '</article>';
      });
    });
    $('#res-review').innerHTML = html;
  }

  function revAnswer(q, i) {
    if (Array.isArray(q.optionShapes) && q.optionShapes[i]) {
      return '<span class="rev-shape">' + arL(i) + ' ' +
        Shapes.svg(q.optionShapes[i], 'shape tiny') + '</span>';
    }
    return esc(arL(i) + ' — ' + optionLabel(q, i));
  }

  function wireResults() {
    $('#res-home').onclick = function () { renderHome(); show('view-home'); };
    $('#res-toggle-review').onclick = function () {
      var sec = $('#res-review-wrap');
      sec.hidden = !sec.hidden;
      $('#res-toggle-review').textContent = sec.hidden ? 'إظهار مراجعة الأسئلة' : 'إخفاء مراجعة الأسئلة';
    };
  }

  /* ================= التمهيد ================= */
  document.addEventListener('DOMContentLoaded', function () {
    wireLoader();
    wireInstructions();
    wireTestControls();
    wireResults();

    $('#reset-btn').onclick = function () {
      confirmBox('مسح كل البيانات المحفوظة؟',
        'ستُحذف جميع المحاولات السابقة والمحاولة الجارية من هذا الجهاز. لا يمكن التراجع.',
        'امسحي كل شيء', 'رجوع').then(function (yes) {
        if (yes) { Store.resetAll(); renderHome(); toast('مُسحت البيانات.', 4000); }
      });
    };
    $('#reload-data').onclick = function () {
      confirmBox('إعادة تحميل ملف الأسئلة؟',
        'سيُطلب منكِ اختيار ملف exams.json من جديد. المحاولات السابقة لن تُمسح.',
        'أعيدي التحميل', 'رجوع').then(function (yes) {
        if (yes) { Store.forgetDataFile(); location.reload(); }
      });
    };

    /* تحديث الشيفرة: لا نعيد التحميل أثناء اختبار جارٍ مهما كان */
    if (navigator.serviceWorker) {
      navigator.serviceWorker.addEventListener('message', function (e) {
        if (!e.data || e.data.type !== 'sw-updated') return;
        var inTest = !$('#view-test').hidden;
        if (inTest) { toast('يوجد تحديث للتطبيق. سيُطبَّق بعد انتهاء الاختبار.', 6000); return; }
        location.reload();
      });
    }

    if (speed !== 1) {
      var d = document.createElement('div');
      d.className = 'devbar';
      d.textContent = 'وضع الفحص: المؤقّت أسرع ' + arD(speed) + ' مرة';
      document.body.appendChild(d);
    }

    boot();
  });

  global.MWApp = { engine: engine };
})(window);
