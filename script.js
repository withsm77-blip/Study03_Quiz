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

// ---- 문항 데이터 검증 ----

const CATEGORIES = ["한국사", "세계지리", "과학", "예술과 문화"];

function isBlank(v) {
  return typeof v !== "string" || v.trim() === "";
}

function validateQuestions(questions) {
  const warnings = [];
  const counts = {};
  for (const c of CATEGORIES) counts[c] = 0;
  const seen = new Set();

  questions.forEach((q, i) => {
    const label = q && q.id ? q.id : `#${i}`;
    if (!(q.category in counts)) {
      warnings.push(`${label}: 알 수 없는 카테고리 "${q.category}"`);
    } else {
      counts[q.category]++;
    }
    if (seen.has(q.id)) warnings.push(`${label}: id 중복`);
    seen.add(q.id);
    if (!Array.isArray(q.choices) || q.choices.length !== 4) {
      warnings.push(`${label}: 보기가 4개가 아님`);
    } else if (new Set(q.choices).size !== 4) {
      warnings.push(`${label}: 같은 보기가 있음`);
    }
    if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer > 3) {
      warnings.push(`${label}: answer가 0~3 정수가 아님`);
    }
    if (isBlank(q.explanation)) warnings.push(`${label}: explanation이 비어 있음`);
    if (isBlank(q.source)) warnings.push(`${label}: source가 비어 있음`);
  });

  for (const c of CATEGORIES) {
    if (counts[c] !== 10) warnings.push(`${c}: ${counts[c]}문항 (10문항이어야 함)`);
  }
  return warnings;
}

function superlativeIds(questions) {
  return questions
    .filter((q) => /가장|최초|최대|최소|최고/.test(q.question))
    .map((q) => q.id);
}

if (typeof module !== "undefined") {
  module.exports = {
    shuffle,
    buildRound,
    correctDisplayIndex,
    isCorrect,
    scoreFor,
    formatScore,
    validateQuestions,
    superlativeIds,
  };
}
