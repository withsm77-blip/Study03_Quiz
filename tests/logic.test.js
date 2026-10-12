const test = require("node:test");
const assert = require("node:assert/strict");
const {
  shuffle, buildRound, correctDisplayIndex, isCorrect, scoreFor, formatScore,
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
    assert.ok(/\d{4}년/.test(q.question) || q.question.includes("기준"), id);
  }
});
