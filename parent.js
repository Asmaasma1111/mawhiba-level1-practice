/* parent.js — لوحة وليّ الأمر: كل المحاولات، منحنى الدرجات، وصعوبة كل سؤال. */

(function (global) {
  'use strict';

  var MW = global.MW, Data = MW.Data, Store = MW.Store, Shapes = MW.Shapes;
  var arD = MW.arDigits, arL = MW.arLetter;

  function $(s) { return document.querySelector(s); }
  function esc(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  document.addEventListener('DOMContentLoaded', function () {
    Data.load().then(function (ok) {
      if (!ok) {
        $('#need-data').hidden = false;
        return;
      }
      render();
    });
  });

  function render() {
    var attempts = Store.getAttempts().slice().sort(function (a, b) {
      return new Date(a.finishedAt) - new Date(b.finishedAt);
    });

    if (!attempts.length) {
      $('#empty').hidden = false;
      return;
    }
    $('#content').hidden = false;

    renderSummary(attempts);
    $('#chart').innerHTML = lineChart(attempts);
    renderTable(attempts);
    renderDifficulty(attempts);
  }

  function renderSummary(att) {
    var last = att[att.length - 1];
    var best = att.reduce(function (m, a) { return a.score > m.score ? a : m; }, att[0]);
    var avgGap = att.reduce(function (n, a) { return n + a.totalUnanswered; }, 0) / att.length;
    $('#summary').innerHTML = [
      ['عدد المحاولات', arD(att.length)],
      ['آخر درجة', arD(last.score) + ' / ' + arD(last.total)],
      ['أفضل درجة', arD(best.score) + ' / ' + arD(best.total)],
      ['متوسّط الأسئلة بلا إجابة', arD(Math.round(avgGap * 10) / 10)]
    ].map(function (p) {
      return '<div class="stat"><div class="stat-num">' + p[1] + '</div>' +
        '<div class="stat-cap">' + esc(p[0]) + '</div></div>';
    }).join('');
  }

  /* ---------- منحنى الدرجات، مرسوم بـ SVG يدوياً ----------
     الزمن يتقدّم من اليمين إلى اليسار ليتوافق مع اتجاه القراءة. */
  function lineChart(att) {
    var W = 760, H = 300;
    var mT = 24, mB = 52, mR = 58, mL = 24;
    var plotW = W - mR - mL, plotH = H - mT - mB;
    var maxY = att.reduce(function (m, a) { return Math.max(m, a.total); }, 64);

    var n = att.length;
    var step = n > 1 ? plotW / (n - 1) : 0;
    var xOf = function (i) { return W - mR - (n > 1 ? i * step : plotW / 2); };
    var yOf = function (v) { return mT + plotH - (v / maxY) * plotH; };

    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="linechart" role="img" ' +
            'aria-label="منحنى الدرجات عبر المحاولات">';

    /* شبكة ومحور الدرجات على اليمين */
    [0, 0.25, 0.5, 0.75, 1].forEach(function (f) {
      var v = Math.round(maxY * f), y = yOf(v);
      s += '<line x1="' + mL + '" y1="' + y + '" x2="' + (W - mR) + '" y2="' + y +
           '" stroke="var(--line)" stroke-width="1"/>';
      s += '<text x="' + (W - mR + 10) + '" y="' + (y + 5) + '" font-size="14" ' +
           'fill="var(--ink-2)" text-anchor="start">' + arD(v) + '</text>';
    });

    /* الخط */
    var pts = att.map(function (a, i) { return xOf(i) + ',' + yOf(a.score); });
    if (n > 1) {
      s += '<polyline points="' + pts.join(' ') + '" fill="none" ' +
           'stroke="var(--navy-2)" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>';
    }

    att.forEach(function (a, i) {
      var x = xOf(i), y = yOf(a.score);
      s += '<circle cx="' + x + '" cy="' + y + '" r="6" fill="#fff" ' +
           'stroke="var(--navy)" stroke-width="3"><title>' +
           esc(a.examTitle + ' — ' + a.score + '/' + a.total) + '</title></circle>';
      s += '<text x="' + x + '" y="' + (y - 14) + '" font-size="14" font-weight="700" ' +
           'fill="var(--navy)" text-anchor="middle">' + arD(a.score) + '</text>';
      s += '<text x="' + x + '" y="' + (H - mB + 22) + '" font-size="12" ' +
           'fill="var(--ink-2)" text-anchor="middle">' + arD(i + 1) + '</text>';
      s += '<text x="' + x + '" y="' + (H - mB + 40) + '" font-size="11" ' +
           'fill="var(--muted-line)" text-anchor="middle">' + esc(shortDate(a.finishedAt)) + '</text>';
    });

    s += '<line x1="' + mL + '" y1="' + (mT + plotH) + '" x2="' + (W - mR) + '" y2="' +
         (mT + plotH) + '" stroke="var(--navy-line)" stroke-width="2"/>';
    return s + '</svg>';
  }

  function shortDate(iso) {
    try {
      return new Intl.DateTimeFormat('ar-u-ca-gregory-nu-arab',
        { month: 'numeric', day: 'numeric' }).format(new Date(iso));
    } catch (e) { return ''; }
  }

  /* ---------- جدول المحاولات ---------- */
  function renderTable(att) {
    var keys = Data.domainKeys();
    var head = '<tr><th>#</th><th>التاريخ</th><th>النموذج</th><th>الدرجة</th>' +
      keys.map(function (k) { return '<th>' + esc(Data.domainName(k)) + '</th>'; }).join('') +
      '<th class="hi">بلا إجابة</th><th>أقسام انتهى وقتها</th></tr>';

    var rows = att.slice().reverse().map(function (a, idx) {
      var n = att.length - idx;
      return '<tr><td>' + arD(n) + '</td>' +
        '<td>' + esc(MW.dateText(a.finishedAt)) + '</td>' +
        '<td>' + esc(a.examTitle) + '</td>' +
        '<td><b>' + arD(a.score) + '</b> / ' + arD(a.total) + '</td>' +
        keys.map(function (k) {
          var d = (a.byDomain && a.byDomain[k]) || { score: 0, total: 0 };
          return '<td>' + arD(d.score) + '/' + arD(d.total) + '</td>';
        }).join('') +
        '<td class="hi big">' + arD(a.totalUnanswered) + '</td>' +
        '<td>' + arD(a.timedOutBlocks || 0) + '</td></tr>' +
        '<tr class="detail"><td colspan="' + (6 + keys.length) + '">' +
        blockTable(a) + '</td></tr>';
    }).join('');

    $('#attempts').innerHTML =
      '<table class="tbl attempts"><thead>' + head + '</thead><tbody>' + rows + '</tbody></table>';
  }

  function blockTable(a) {
    return '<details><summary>تفصيل الأقسام في هذه المحاولة</summary>' +
      '<table class="tbl inner"><thead><tr><th>القسم</th><th>الدرجة</th>' +
      '<th>الزمن المستخدم</th><th>زمن القسم</th><th class="hi">بلا إجابة</th><th>كيف انتهى</th>' +
      '</tr></thead><tbody>' +
      (a.blocks || []).map(function (b) {
        var how = b.endedBy === 'timeout' ? 'انتهى الوقت'
                : b.endedBy === 'manual' ? 'أُغلق مبكّراً' : '—';
        return '<tr' + (b.unanswered ? ' class="has-gap"' : '') + '><td>' + esc(b.title) + '</td>' +
          '<td>' + arD(b.score) + '/' + arD(b.count) + '</td>' +
          '<td>' + esc(MW.minutesText(b.used)) + '</td>' +
          '<td>' + esc(MW.minutesText(b.seconds * 1000)) + '</td>' +
          '<td class="hi">' + arD(b.unanswered) + '</td>' +
          '<td>' + how + '</td></tr>';
      }).join('') + '</tbody></table></details>';
  }

  /* ---------- صعوبة كل سؤال عبر المحاولات ---------- */
  function renderDifficulty(att) {
    var stats = {};   // qid -> {seen, right, blank}
    att.forEach(function (a) {
      (a.items || []).forEach(function (it) {
        var s = stats[it.qid] || (stats[it.qid] = { seen: 0, right: 0, blank: 0, examId: a.examId });
        s.seen++;
        if (it.ok) s.right++;
        if (it.chose === null || it.chose === undefined) s.blank++;
      });
    });

    var rows = [];
    Data.exams.forEach(function (ex) {
      ex.blocks.forEach(function (b) {
        b.questions.forEach(function (q, qi) {
          var s = stats[q.id];
          if (!s || !s.seen) return;
          rows.push({
            q: q, exam: ex, block: b, qi: qi,
            seen: s.seen, right: s.right, blank: s.blank,
            rate: s.right / s.seen
          });
        });
      });
    });

    if (!rows.length) { $('#difficulty').innerHTML = '<p class="subtle">لا توجد بيانات بعد.</p>'; return; }

    var onlyWrong = $('#only-wrong').checked;
    var repeated = $('#only-repeated').checked;
    var list = rows.filter(function (r) {
      if (onlyWrong && r.rate === 1) return false;
      if (repeated && r.seen < 2) return false;
      return true;
    }).sort(function (a, b) {
      if (a.rate !== b.rate) return a.rate - b.rate;
      return b.seen - a.seen;
    });

    if (!list.length) {
      $('#difficulty').innerHTML = '<p class="subtle">لا شيء يطابق الفلترة الحالية.</p>';
      return;
    }

    $('#difficulty').innerHTML = list.map(function (r) {
      var cls = r.rate === 0 ? 'q-bad' : (r.rate < 0.5 ? 'q-warn' : 'q-ok');
      return '<article class="qrow ' + cls + '">' +
        '<div class="qrow-head">' +
          '<span class="qrow-badge">' + arD(r.right) + ' / ' + arD(r.seen) + ' صحيحة</span>' +
          '<span class="qrow-where">' + esc(r.exam.title) + ' · ' + esc(r.block.title) +
            ' · السؤال ' + arD(r.qi + 1) + '</span>' +
          (r.blank ? '<span class="qrow-blank">تُركت بلا إجابة ' + arD(r.blank) + ' مرة</span>' : '') +
        '</div>' +
        '<p class="qrow-prompt">' + esc(r.q.prompt) + '</p>' +
        (r.q.stimulus ? Shapes.stimulus(r.q.stimulus, 'small') : '') +
        '<p class="qrow-ans"><span class="tag good">الصحيحة</span> ' +
          (Array.isArray(r.q.optionShapes) && r.q.optionShapes[r.q.answer]
            ? arL(r.q.answer) + ' ' + Shapes.svg(r.q.optionShapes[r.q.answer], 'shape tiny')
            : esc(arL(r.q.answer) + ' — ' + (r.q.options ? r.q.options[r.q.answer] : ''))) +
        '</p>' +
        (r.q.explain ? '<p class="qrow-explain">' + esc(r.q.explain) + '</p>' : '') +
        '</article>';
    }).join('');
  }

  document.addEventListener('change', function (e) {
    if (e.target.id === 'only-wrong' || e.target.id === 'only-repeated') {
      var att = Store.getAttempts().slice().sort(function (a, b) {
        return new Date(a.finishedAt) - new Date(b.finishedAt);
      });
      if (att.length) renderDifficulty(att);
    }
  });
})(window);
