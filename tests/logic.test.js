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
