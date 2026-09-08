/* engine.js — محرّك الأقسام والمؤقّت.
   القاعدة الجوهرية: القسم يُغلق عند انتهاء وقته ولا يمكن العودة إليه. */

(function (global) {
  'use strict';

  var Store = global.MW.Store;
  var Data  = global.MW.Data;

  var TICK_MS = 200;
  var SAVE_EVERY_MS = 2000;

  function Engine() {
    this.s = null;          // الجلسة المحفوظة
    this.exam = null;
    this._interval = null;
    this._lastTick = 0;
    this._sinceSave = 0;
    this.onTick = null;     // (remainingMs)
    this.onBlockEnd = null; // (blockIndex, reason)
    this.onAdvance = null;  // (newBlockIndex, reason)
    this.onFinish = null;   // (session)
  }

  Engine.prototype.start = function (examId, speed) {
    var exam = Data.exam(examId);
    if (!exam) throw new Error('نموذج غير موجود: ' + examId);
    this.exam = exam;
    this.s = {
      examId: examId,
      startedAt: new Date().toISOString(),
      bi: 0,
      qi: 0,
      answers: {},
      blocks: exam.blocks.map(function (b) {
        return { rem: b.seconds * 1000, used: 0, done: false, endedBy: null };
      }),
      speed: speed || 1
    };
    this.save();
    this.run();
    return this.s;
  };

  /* استئناف جلسة محفوظة. يرجع false إذا لم تعد صالحة. */
  Engine.prototype.resume = function (session) {
    var exam = Data.exam(session.examId);
    if (!exam) return false;
    if (!session.blocks || session.blocks.length !== exam.blocks.length) return false;
    this.exam = exam;
    this.s = session;
    if (session.finished) return false;
    this.run();
    return true;
  };

  Engine.prototype.block = function (i) {
    return this.exam.blocks[i === undefined ? this.s.bi : i];
  };
  Engine.prototype.blockState = function (i) {
    return this.s.blocks[i === undefined ? this.s.bi : i];
  };
  Engine.prototype.question = function () {
    return this.block().questions[this.s.qi];
  };
  Engine.prototype.remaining = function () {
    return this.blockState().rem;
  };

  /* ---------- المؤقّت ---------- */
  Engine.prototype.run = function () {
    var self = this;
    this.stop();
    this._lastTick = Date.now();
    this._sinceSave = 0;
    this._interval = setInterval(function () { self._tick(); }, TICK_MS);
  };

  Engine.prototype.stop = function () {
    if (this._interval) { clearInterval(this._interval); this._interval = null; }
  };

  Engine.prototype._tick = function () {
    if (!this.s || this.s.finished) return this.stop();
    var now = Date.now();
    var dt = (now - this._lastTick) * (this.s.speed || 1);
    this._lastTick = now;
    if (dt < 0) dt = 0;

    var bs = this.blockState();
    bs.rem -= dt;
    bs.used += dt;
    this._sinceSave += dt;

    if (bs.rem <= 0) {
      bs.rem = 0;
      this.finishBlock('timeout');
      return;
    }
    if (this._sinceSave >= SAVE_EVERY_MS) { this._sinceSave = 0; this.save(); }
    if (this.onTick) this.onTick(bs.rem);
  };

  /* ---------- الإجابات ---------- */
  Engine.prototype.answerKey = function (q) { return q.id; };

  Engine.prototype.choose = function (index) {
    if (!this.s || this.s.finished) return;
    var q = this.question();
    var a = this.s.answers[q.id] || (this.s.answers[q.id] = { c: null, f: false });
    a.c = index;
    this.save();
  };

  Engine.prototype.toggleFlag = function () {
    var q = this.question();
    var a = this.s.answers[q.id] || (this.s.answers[q.id] = { c: null, f: false });
    a.f = !a.f;
    this.save();
    return a.f;
  };

  Engine.prototype.answerOf = function (q) {
    return this.s.answers[q.id] || { c: null, f: false };
  };

  Engine.prototype.goTo = function (qi) {
    var n = this.block().questions.length;
    if (qi < 0) qi = 0;
    if (qi > n - 1) qi = n - 1;
    this.s.qi = qi;
    this.save();
  };
  Engine.prototype.next = function () { this.goTo(this.s.qi + 1); };
  Engine.prototype.prev = function () { this.goTo(this.s.qi - 1); };

  Engine.prototype.unansweredInBlock = function (i) {
    var self = this, n = 0;
    this.block(i).questions.forEach(function (q) {
      var a = self.s.answers[q.id];
      if (!a || a.c === null || a.c === undefined) n++;
    });
    return n;
  };

  /* ---------- إغلاق القسم: لا رجعة ---------- */
  Engine.prototype.finishBlock = function (reason) {
    var bs = this.blockState();
    if (bs.done) return;
    bs.done = true;
    bs.endedBy = reason;
    bs.unanswered = this.unansweredInBlock(this.s.bi);
    var cap = this.block(this.s.bi).seconds * 1000;
    if (bs.used > cap) bs.used = cap;
    if (reason === 'timeout') bs.rem = 0;

    var ended = this.s.bi;
    if (this.onBlockEnd) this.onBlockEnd(ended, reason);

    if (this.s.bi < this.exam.blocks.length - 1) {
      this.s.bi += 1;
      this.s.qi = 0;
      this._lastTick = Date.now();
      this.save();
      if (this.onAdvance) this.onAdvance(this.s.bi, reason);
    } else {
      this.finishAttempt(reason);
    }
  };

  Engine.prototype.finishAttempt = function (reason) {
    this.stop();
    this.s.finished = true;
    this.s.finishedAt = new Date().toISOString();
    this.s.endedBy = reason;
    this.save();
    if (this.onFinish) this.onFinish(this.s);
  };

  Engine.prototype.save = function () {
    if (this.s) Store.setSession(this.s);
  };

  /* ---------- النتيجة ---------- */
  Engine.prototype.grade = function () {
    return global.MW.grade(this.exam, this.s);
  };

  /* دالة تصحيح مستقلة حتى تستعملها صفحة وليّ الأمر أيضاً */
  global.MW.grade = function (exam, s) {
    var total = 0, score = 0;
    var byDomain = {};
    var blocks = [];
    var items = [];

    exam.blocks.forEach(function (b, bi) {
      var bs = (s.blocks && s.blocks[bi]) || { used: 0, done: true, endedBy: null };
      var bScore = 0, bUnanswered = 0;
      b.questions.forEach(function (q, qi) {
        var a = (s.answers && s.answers[q.id]) || { c: null, f: false };
        var chose = (a.c === null || a.c === undefined) ? null : a.c;
        var ok = chose !== null && chose === q.answer;
        total++;
        if (ok) { score++; bScore++; }
        if (chose === null) bUnanswered++;
        if (!byDomain[b.domain]) byDomain[b.domain] = { score: 0, total: 0 };
        byDomain[b.domain].total++;
        if (ok) byDomain[b.domain].score++;
        items.push({
          qid: q.id, blockId: b.id, blockTitle: b.title, domain: b.domain,
          bi: bi, qi: qi, chose: chose, correct: q.answer, ok: ok, flagged: !!a.f
        });
      });
      blocks.push({
        id: b.id, title: b.title, domain: b.domain,
        count: b.questions.length,
        score: bScore,
        unanswered: (bs.unanswered !== undefined ? bs.unanswered : bUnanswered),
        used: bs.used || 0,
        seconds: b.seconds,
        endedBy: bs.endedBy || null,
        reached: !!bs.done || bi <= (s.bi || 0)
      });
    });

    return {
      examId: exam.id, examTitle: exam.title,
      score: score, total: total,
      byDomain: byDomain, blocks: blocks, items: items,
      startedAt: s.startedAt, finishedAt: s.finishedAt || new Date().toISOString(),
      totalUnanswered: blocks.reduce(function (n, b) { return n + b.unanswered; }, 0),
      timedOutBlocks: blocks.filter(function (b) { return b.endedBy === 'timeout'; }).length
    };
  };

  global.MW.Engine = Engine;
})(window);
