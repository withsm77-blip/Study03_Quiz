const test = require("node:test");
const assert = require("node:assert/strict");
const {
  shuffle, buildRound, correctDisplayIndex, isCorrect, scoreFor, formatScore, createCountdown,
  sanitizeName, lbKey, insertRecord, loadBoard, saveBoard, todayString,
  LB_STORAGE_KEY, LB_LIMIT, NAME_MAX,
} = require("../script.js");

test("shuffle keeps elements", () => {
  const arr = [1, 2, 3, 4, 5, 6, 7, 8];
  const copy = arr.slice();
  const out = shuffle(arr);
  assert.equal(out.length, arr.length);
  assert.deepEqual(out.slice().sort((a, b) => a - b), copy);
  assert.deepEqual(arr, copy);
  assert.notEqual(out, arr);
});

test("buildRound filters category", () => {
  const qs = [];
  for (let i = 0; i < 12; i++) {
    qs.push({
      category: i < 10 ? "한국사" : "과학",
      question: "q" + i,
      choices: ["a", "b", "c", "d"],
      answer: 0,
    });
  }
  const round = buildRound(qs, "한국사");
  assert.equal(round.length, 10);
  for (const item of round) {
    assert.equal(item.q.category, "한국사");
    assert.deepEqual(item.order.slice().sort(), [0, 1, 2, 3]);
  }
});

test("isCorrect follows shuffled order", () => {
  const item = { q: { answer: 2, choices: ["a", "b", "c", "d"] }, order: [3, 2, 0, 1] };
  assert.equal(isCorrect(item, 1), true);
  assert.equal(isCorrect(item, 2), false);
  assert.equal(correctDisplayIndex(item), 1);
});

test("scoreFor", () => {
  assert.equal(scoreFor({ correct: true, usedHint: false }), 1);
  assert.equal(scoreFor({ correct: true, usedHint: true }), 0.5);
  assert.equal(scoreFor({ correct: false, usedHint: true }), 0);
  assert.equal(scoreFor({ correct: false, usedHint: false }), 0);
});

test("formatScore", () => {
  assert.equal(formatScore(7), "7");
  assert.equal(formatScore(7.5), "7.5");
  assert.equal(formatScore(0), "0");
});

// ---- Task 2: 문항 데이터 검증 ----

const { validateQuestions, superlativeIds } = require("../script.js");

function makeValidSet() {
  const cats = [
    ["한국사", "kh"],
    ["세계지리", "wg"],
    ["과학", "sc"],
    ["예술과 문화", "ac"],
  ];
  const qs = [];
  for (const [category, prefix] of cats) {
    for (let i = 1; i <= 10; i++) {
      qs.push({
        id: `${prefix}-${String(i).padStart(2, "0")}`,
        category,
        question: `${category} 문제 ${i}`,
        choices: ["가", "나", "다", "라"],
        answer: i % 4,
        explanation: "해설",
        source: "출처, 항목",
      });
    }
  }
  return qs;
}

test("validateQuestions catches problems", () => {
  assert.deepEqual(validateQuestions(makeValidSet()), []);

  const badAnswer = makeValidSet();
  badAnswer[0].answer = 4;
  assert.ok(validateQuestions(badAnswer).length >= 1, "answer: 4");

  const dupChoice = makeValidSet();
  dupChoice[1].choices = ["가", "가", "다", "라"];
  assert.ok(validateQuestions(dupChoice).length >= 1, "duplicate choices");

  const blankSource = makeValidSet();
  blankSource[2].source = " ";
  assert.ok(validateQuestions(blankSource).length >= 1, "blank source");

  const dupId = makeValidSet();
  dupId[3].id = dupId[4].id;
  assert.ok(validateQuestions(dupId).length >= 1, "duplicate id");

  const nine = makeValidSet().slice(1);
  assert.ok(validateQuestions(nine).length >= 1, "category with 9");
});

test("real QUESTIONS are valid", () => {
  const { QUESTIONS } = require("../questions.js");
  assert.equal(QUESTIONS.length, 40);
  assert.deepEqual(validateQuestions(QUESTIONS), []);
});

test("superlatives state basis", () => {
  const { QUESTIONS } = require("../questions.js");
  const ids = superlativeIds(QUESTIONS);
  for (const id of ids) {
    const q = QUESTIONS.find((x) => x.id === id);
    assert.ok(/\d{4}년/.test(q.question), `${id}: 시점(연도) 없음`);
    assert.ok(/기준/.test(q.question), `${id}: 기준 없음`);
  }
});

function fakeClock() {
  let nextId = 1;
  const active = new Map();
  return {
    setInterval(fn) { const id = nextId++; active.set(id, fn); return id; },
    clearInterval(id) { active.delete(id); },
    tick(n = 1) { for (let i = 0; i < n; i++) [...active.values()].forEach((f) => f()); },
    activeCount() { return active.size; },
  };
}

test("countdown ticks then expires once", () => {
  const clock = fakeClock();
  const ticks = [];
  let expired = 0;
  const cd = createCountdown(15, (s) => ticks.push(s), () => expired++, clock);
  cd.start();
  clock.tick(15);
  assert.deepEqual(ticks, [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
  assert.equal(expired, 1);
  clock.tick(5);
  assert.equal(expired, 1);
  assert.equal(ticks.length, 15);
  assert.equal(clock.activeCount(), 0);
});

test("countdown stop prevents expire", () => {
  const clock = fakeClock();
  let expired = 0;
  let ticks = 0;
  const cd = createCountdown(15, () => ticks++, () => expired++, clock);
  cd.start();
  clock.tick(10);
  cd.stop();
  clock.tick(10);
  assert.equal(expired, 0);
  assert.equal(ticks, 10);
});

test("countdown restart resets", () => {
  const clock = fakeClock();
  const ticks = [];
  const cd = createCountdown(15, (s) => ticks.push(s), () => {}, clock);
  cd.start();
  clock.tick(5);
  cd.start();
  assert.equal(clock.activeCount(), 1);
  ticks.length = 0;
  clock.tick(1);
  assert.deepEqual(ticks, [14]);
});

test("hint removes two wrong choices", () => {
  const { pickHintRemovals } = require("../script.js");
  const item = { q: { answer: 2 }, order: [3, 2, 0, 1] };
  for (let i = 0; i < 100; i++) {
    const r = pickHintRemovals(item, Math.random);
    assert.equal(r.length, 2);
    assert.ok(!r.includes(1));
    assert.notEqual(r[0], r[1]);
    assert.ok(r[0] < r[1]);
    assert.ok(r.every((x) => [0, 2, 3].includes(x)));
  }
});

test("getWrongItems returns fresh items for wrong answers only", () => {
  const { getWrongItems } = require("../script.js");
  const results = [];
  for (let i = 0; i < 10; i++) {
    const q = { id: "q" + i, category: "c", question: "Q" + i, choices: ["a", "b", "c", "d"], answer: 0 };
    results.push({ item: { q, order: [0, 1, 2, 3] }, correct: ![2, 5, 7].includes(i), usedHint: false, timedOut: false });
  }
  const out = getWrongItems(results);
  assert.equal(out.length, 3);
  assert.deepEqual(out.map((it) => it.q.id).sort(), ["q2", "q5", "q7"]);
  for (const it of out) assert.deepEqual(it.order.slice().sort(), [0, 1, 2, 3]);
  assert.deepEqual(getWrongItems(results.filter((r) => r.correct)), []);
});

test("leaderboard constants and lbKey", () => {
  assert.equal(LB_STORAGE_KEY, "quizLeaderboard");
  assert.equal(LB_LIMIT, 5);
  assert.equal(NAME_MAX, 10);
  assert.equal(lbKey("speed", "한국사"), "speed|한국사");
});

test("sanitizeName", () => {
  assert.equal(sanitizeName("  철수  "), "철수");
  assert.equal(sanitizeName("   "), "익명");
  assert.equal(sanitizeName("가나다라마바사아자차카"), "가나다라마바사아자차");
  assert.equal(sanitizeName("<b>x</b>"), "<b>x</b>");
});

const rec = (score, ts) => ({ name: "n", score, date: "2026-10-02", ts });

test("insertRecord order and ties", () => {
  const list = [rec(9, 1), rec(7, 2), rec(5, 0)];
  const frozen = JSON.stringify(list);
  const out = insertRecord(list, rec(7, 3));
  assert.deepEqual(out.list.map((r) => [r.score, r.ts]), [[9, 1], [7, 2], [7, 3], [5, 0]]);
  assert.equal(out.inserted, true);
  assert.equal(JSON.stringify(list), frozen);
});

test("insertRecord full board cut-off", () => {
  const list = [rec(10, 1), rec(9, 2), rec(8, 3), rec(7, 4), rec(6, 5)];
  const out = insertRecord(list, rec(6, 6));
  assert.equal(out.inserted, false);
  assert.deepEqual(out.list, list);
  const out2 = insertRecord(list, rec(6.5, 6));
  assert.equal(out2.inserted, true);
  assert.equal(out2.list.length, 5);
});

test("insertRecord with room accepts 0", () => {
  const out = insertRecord([rec(3, 1), rec(2, 2), rec(1, 3), rec(1, 4)], rec(0, 5));
  assert.equal(out.inserted, true);
  assert.equal(out.list.length, 5);
});

test("loadBoard missing key, valid, and invalid shapes", () => {
  assert.deepEqual(loadBoard({ getItem: () => null }), { board: {}, ok: true });
  assert.deepEqual(loadBoard({ getItem: () => '{"a|b":[]}' }), { board: { "a|b": [] }, ok: true });
  for (const raw of ["null", "[1]", "5", '"x"']) {
    assert.deepEqual(loadBoard({ getItem: () => raw }), { board: {}, ok: false });
  }
});

test("loadBoard survives bad json", () => {
  assert.deepEqual(loadBoard({ getItem: () => "{oops" }), { board: {}, ok: false });
});

test("loadBoard survives throwing storage", () => {
  const r = loadBoard({ getItem: () => { throw new Error("x"); } });
  assert.equal(r.ok, false);
  assert.deepEqual(r.board, {});
  assert.equal(loadBoard(null).ok, false);
});

test("saveBoard reports failure", () => {
  assert.equal(saveBoard({ setItem: () => { throw new Error("full"); } }, {}), false);
  let saved;
  assert.equal(saveBoard({ setItem: (k, v) => { saved = [k, v]; } }, { a: 1 }), true);
  assert.deepEqual(saved, ["quizLeaderboard", '{"a":1}']);
});

test("todayString", () => {
  assert.equal(todayString(new Date(2026, 9, 2)), "2026-10-02");
});

test("validateQuestions tolerates non-object entries", () => {
  const set = [null, 5, ...makeValidSet()];
  let w;
  assert.doesNotThrow(() => { w = validateQuestions(set); });
  assert.ok(w.length >= 2);
  assert.doesNotThrow(() => validateQuestions([{ category: "toString" }]));
});
