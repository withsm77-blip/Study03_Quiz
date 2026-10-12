"use strict";

// ---- 핵심 판정 로직 ----

function shuffle(arr, rng = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildRound(questions, category, rng = Math.random) {
  const pool = questions.filter((q) => q.category === category);
  return shuffle(pool, rng).map((q) => ({
    q,
    order: shuffle([0, 1, 2, 3], rng),
  }));
}

function correctDisplayIndex(item) {
  return item.order.indexOf(item.q.answer);
}

function isCorrect(item, displayIndex) {
  return displayIndex === correctDisplayIndex(item);
}

function scoreFor({ correct, usedHint }) {
  if (!correct) return 0;
  return usedHint ? 0.5 : 1;
}

function formatScore(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

if (typeof module !== "undefined") {
  module.exports = {
    shuffle,
    buildRound,
    correctDisplayIndex,
    isCorrect,
    scoreFor,
    formatScore,
  };
}
