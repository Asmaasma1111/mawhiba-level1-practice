/* revise.js — ركن المراجعة: تدريب بلا وقت وبلا درجة، مع تصحيح فوري.
   غرضه أن تتعرّف على أنماط الأسئلة وتعيدها كما تشاء قبل أن تواجه المؤقّت. */

(function (global) {
  'use strict';

  var MW = global.MW, Data = MW.Data, Shapes = MW.Shapes;
  var arD = MW.arDigits, arL = MW.arLetter;
  var PROGRESS_KEY = 'mawhiba.revise.v1';

  var state = { topic: null, list: [], i: 0, answers: {}, shuffled: false };

  function $(s) { return document.querySelector(s); }
  function esc(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function show(id) {
    ['view-topics', 'view-practice'].forEach(function (v) { $('#' + v).hidden = (v !== id); });
    window.scrollTo(0, 0);
  }

  /* ---------- تقدّم لطيف: ما أتقنته، لا درجة ---------- */
  function progress() {
    try { return JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}'); } catch (e) { return {}; }
  }
  function saveProgress(p) {
    try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(p)); } catch (e) {}
  }
  function markSeen(qid, ok) {
    var p = progress();
    var r = p[qid] || (p[qid] = { tries: 0, got: false });
    r.tries++;
    if (ok) r.got = true;
    saveProgress(p);
  }

  /* ---------- كل الأسئلة مجمّعة حسب النمط ---------- */
  function allQuestions() {
    var out = [];
    Data.exams.forEach(function (ex) {
      ex.blocks.forEach(function (b) {
        b.questions.forEach(function (q) {
          out.push({ q: q, examTitle: ex.title });
        });
      });
    });
    return out;
  }

  function byTopic() {
    var map = {};
    allQuestions().forEach(function (item) {
      var t = item.q.topic || 'أخرى';
      (map[t] || (map[t] = [])).push(item);
    });
    return map;
  }

  /* ---------- شاشة الأنماط ---------- */
  function renderTopics() {
    var map = byTopic();
    var p = progress();
    var keys = Object.keys(map).sort(function (a, b) { return map[b].length - map[a].length; });

    var totalQ = 0, totalGot = 0;
    keys.forEach(function (t) {
      map[t].forEach(function (it) { totalQ++; if (p[it.q.id] && p[it.q.id].got) totalGot++; });
    });

    $('#overall').innerHTML =
      '<p>هنا <b>' + arD(totalQ) + '</b> سؤالاً في <b>' + arD(keys.length) + '</b> نمطاً. ' +
      'لا وقت، ولا درجة — جرّبي، وأعيدي، وتعلّمي.</p>' +
      (totalGot ? '<p class="subtle">أجبتِ إجابة صحيحة عن ' + arD(totalGot) +
                  ' منها حتى الآن.</p>' : '');

    $('#topics').innerHTML = keys.map(function (t) {
      var items = map[t];
      var got = items.filter(function (it) { return p[it.q.id] && p[it.q.id].got; }).length;
      var pct = Math.round(got / items.length * 100);
      return '<button class="topic" data-topic="' + esc(t) + '">' +
        '<span class="topic-name">' + esc(t) + '</span>' +
        '<span class="topic-count">' + arD(items.length) + ' سؤالاً</span>' +
        '<span class="bar"><span style="width:' + pct + '%"></span></span>' +
        '<span class="topic-got">' + (got ? 'صحيحة: ' + arD(got) + ' من ' + arD(items.length)
                                          : 'لم تبدئي بعد') + '</span>' +
        '</button>';
    }).join('');

    Array.prototype.forEach.call($('#topics').querySelectorAll('.topic'), function (b) {
      b.onclick = function () { openTopic(b.getAttribute('data-topic')); };
    });
  }

  /* ---------- التدريب ---------- */
  function openTopic(topic, shuffle) {
    var map = byTopic();
    state.topic = topic;
    state.list = (map[topic] || []).slice();
    state.shuffled = !!shuffle;
    if (shuffle) {
      for (var i = state.list.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = state.list[i]; state.list[i] = state.list[j]; state.list[j] = tmp;
      }
    }
    state.i = 0;
    state.answers = {};
    $('#practice-title').textContent = topic;
    show('view-practice');
    renderQuestion();
  }

  function renderQuestion() {
    var item = state.list[state.i];
    if (!item) return;
    var q = item.q;
    var chosen = state.answers[q.id];
    var answered = chosen !== undefined && chosen !== null;

    $('#practice-count').textContent =
      'السؤال ' + arD(state.i + 1) + ' من ' + arD(state.list.length);

    var shapes = q.optionShapes;
    var isShapes = Array.isArray(shapes) && shapes.length;
    var n = isShapes ? shapes.length : (q.options || []).length;

    var opts = '<div class="options ' + (isShapes ? 'shapes' : 'texts') + '">';
    for (var i = 0; i < n; i++) {
      var cls = 'opt';
      if (answered) {
        if (i === q.answer) cls += ' correct';
        else if (i === chosen) cls += ' wrong';
        else cls += ' dim';
      } else if (chosen === i) cls += ' selected';
      opts += '<button type="button" class="' + cls + '" data-i="' + i + '"' +
        (answered ? ' disabled' : '') + '>' +
        '<span class="lbl">' + arL(i) + '</span>' +
        '<span class="body">' +
        (isShapes ? Shapes.svg(shapes[i], 'opt-shape') : esc(q.options[i])) +
        '</span>' +
        (answered && i === q.answer ? '<span class="mark ok">✓</span>' : '') +
        (answered && i === chosen && i !== q.answer ? '<span class="mark no">✗</span>' : '') +
        '</button>';
    }
    opts += '</div>';

    $('#practice-body').innerHTML =
      (q.passage ? '<section class="passage"><h3>' + esc(q.passage.title) + '</h3><p>' +
                   esc(q.passage.text) + '</p></section>' : '') +
      (q.instructions ? '<p class="hint">' + esc(q.instructions) + '</p>' : '') +
      '<p class="prompt">' + esc(q.prompt) + '</p>' +
      (q.stimulus ? Shapes.stimulus(q.stimulus) : '') +
      opts +
      (answered
        ? '<div class="verdict ' + (chosen === q.answer ? 'good' : 'bad') + '">' +
          '<p class="verdict-line">' +
          (chosen === q.answer ? 'إجابة صحيحة.' : 'ليست الإجابة الصحيحة.') + '</p>' +
          (q.explain ? '<p class="verdict-why">' + esc(q.explain) + '</p>' : '') +
          '</div>'
        : '');

    Array.prototype.forEach.call($('#practice-body').querySelectorAll('.opt'), function (btn) {
      btn.onclick = function () {
        var i = +btn.getAttribute('data-i');
        state.answers[q.id] = i;
        markSeen(q.id, i === q.answer);
        renderQuestion();
      };
    });

    $('#again-btn').hidden = !answered;
    $('#prev-btn').disabled = state.i === 0;
    $('#next-btn').disabled = state.i === state.list.length - 1;
    $('#practice-source').textContent = item.examTitle;
  }

  function wire() {
    $('#next-btn').onclick = function () {
      if (state.i < state.list.length - 1) { state.i++; renderQuestion(); }
    };
    $('#prev-btn').onclick = function () {
      if (state.i > 0) { state.i--; renderQuestion(); }
    };
    $('#again-btn').onclick = function () {
      delete state.answers[state.list[state.i].q.id];
      renderQuestion();
    };
    $('#shuffle-btn').onclick = function () { openTopic(state.topic, true); };
    $('#back-btn').onclick = function () { renderTopics(); show('view-topics'); };
    $('#reset-progress').onclick = function () {
      if (!confirm('مسح تقدّم المراجعة؟ الأسئلة تبقى كما هي.')) return;
      try { localStorage.removeItem(PROGRESS_KEY); } catch (e) {}
      renderTopics();
    };
    $('#mix-all').onclick = function () {
      var all = allQuestions();
      for (var i = all.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var t = all[i]; all[i] = all[j]; all[j] = t;
      }
      state.topic = 'كل الأنماط معاً';
      state.list = all; state.i = 0; state.answers = {};
      $('#practice-title').textContent = state.topic;
      show('view-practice');
      renderQuestion();
    };
  }

  document.addEventListener('DOMContentLoaded', function () {
    wire();
    Data.load().then(function (ok) {
      if (!ok) { $('#need-data').hidden = false; return; }
      renderTopics();
      show('view-topics');
    });
  });
})(window);
