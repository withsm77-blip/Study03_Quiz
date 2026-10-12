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

const SPEED_SECONDS = 15;

function createCountdown(seconds, onTick, onExpire, clock = { setInterval: (fn, ms) => setInterval(fn, ms), clearInterval: (id) => clearInterval(id) }) {
  let id = null;
  let remaining = seconds;
  function stop() {
    if (id !== null) {
      clock.clearInterval(id);
      id = null;
    }
  }
  function start() {
    stop();
    remaining = seconds;
    id = clock.setInterval(() => {
      remaining--;
      onTick(remaining);
      if (remaining <= 0) {
        stop();
        onExpire();
      }
    }, 1000);
  }
  return { start, stop };
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

// ---- 화면 제어 ----

const MODE_LABELS = { practice: "연습 모드", speed: "스피드 모드", hint: "힌트 모드" };

const state = {
  mode: "practice",
  category: null,
  items: [],
  index: 0,
  score: 0,
  results: [],
  locked: false,
  isRetry: false,
  timer: null,
};

function $(id) {
  return document.getElementById(id);
}

function showScreen(id) {
  document.querySelectorAll("main section").forEach((sec) => {
    sec.hidden = sec.id !== id;
  });
}

function stopTimer() {
  if (state.timer) state.timer.stop();
}

function startRound(mode, category) {
  stopTimer();
  state.timer = null;
  state.mode = mode;
  state.category = category;
  state.items = buildRound(QUESTIONS, category);
  state.index = 0;
  state.score = 0;
  state.results = [];
  state.locked = false;
  state.isRetry = false;
  if (mode === "speed") {
    state.timer = createCountdown(
      SPEED_SECONDS,
      (sec) => { $("timer").textContent = String(sec); },
      () => handleAnswer(null)
    );
  }
  showScreen("screen-quiz");
  renderQuestion();
}

function renderQuestion() {
  const item = state.items[state.index];
  state.locked = false;
  $("progress").textContent = `${state.index + 1} / ${state.items.length}`;
  $("quiz-category").textContent = state.category;
  $("score-now").textContent = formatScore(state.score);
  $("question").textContent = item.q.question;
  const box = $("choices");
  box.textContent = "";
  item.order.forEach((origIdx, displayIdx) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "choice";
    btn.dataset.index = String(displayIdx);
    btn.textContent = item.q.choices[origIdx];
    btn.addEventListener("click", () => handleAnswer(displayIdx));
    box.appendChild(btn);
  });
  const fb = $("feedback");
  fb.textContent = "";
  fb.className = "feedback";
  $("explanation").textContent = "";
  $("source").textContent = "";
  $("next-btn").hidden = true;
  $("next-btn").textContent =
    state.index === state.items.length - 1 ? "결과 보기" : "다음";
  const timerEl = $("timer");
  if (state.mode === "speed" && state.timer) {
    timerEl.hidden = false;
    timerEl.textContent = String(SPEED_SECONDS);
    state.timer.start();
  } else {
    timerEl.hidden = true;
  }
}

function handleAnswer(displayIndex) {
  if (state.locked) return;
  state.locked = true;
  stopTimer();
  const item = state.items[state.index];
  const timedOut = displayIndex === null;
  const correct = !timedOut && isCorrect(item, displayIndex);
  const usedHint = false;
  const pts = scoreFor({ correct, usedHint });
  state.score += pts;
  state.results.push({ item, correct, usedHint, timedOut });

  const buttons = $("choices").querySelectorAll(".choice");
  buttons.forEach((b) => { b.disabled = true; });
  buttons[correctDisplayIndex(item)].classList.add("is-correct");
  if (!correct && !timedOut) buttons[displayIndex].classList.add("is-wrong");

  $("score-now").textContent = formatScore(state.score);
  const fb = $("feedback");
  fb.textContent = timedOut ? "시간 초과" : correct ? "정답!" : "오답";
  fb.className = "feedback " + (correct ? "ok" : "bad");
  $("explanation").textContent = item.q.explanation;
  $("source").textContent = "출처: " + item.q.source;
  $("next-btn").hidden = false;
}

function nextQuestion() {
  if (!state.locked) return;
  if (state.index >= state.items.length - 1) {
    showResult();
    return;
  }
  state.index++;
  renderQuestion();
}

function showResult() {
  stopTimer();
  document.querySelectorAll("#screen-result .no-record-notice").forEach((el) => {
    el.hidden = state.mode !== "practice";
  });
  const right = state.results.filter((r) => r.correct).length;
  $("result-score").textContent = `${formatScore(state.score)} / ${state.items.length}`;
  $("result-detail").textContent = `맞힘 ${right} · 틀림 ${state.results.length - right}`;
  showScreen("screen-result");
}

function showCategoryScreen() {
  $("current-mode").textContent = MODE_LABELS[state.mode];
  document.querySelectorAll("#screen-category .no-record-notice").forEach((el) => {
    el.hidden = state.mode !== "practice";
  });
  showScreen("screen-category");
}

function goHome() {
  stopTimer();
  showScreen("screen-mode");
}

function init() {
  const warnings = validateQuestions(QUESTIONS);
  if (warnings.length > 0) console.warn("문항 데이터 문제:\n" + warnings.join("\n"));
  document.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.mode = btn.dataset.mode;
      showCategoryScreen();
    });
  });
  document.querySelectorAll(".category-btn").forEach((btn) => {
    btn.addEventListener("click", () => startRound(state.mode, btn.dataset.category));
  });
  $("next-btn").addEventListener("click", nextQuestion);
  $("again-btn").addEventListener("click", () => startRound(state.mode, state.category));
  $("home-btn").addEventListener("click", goHome);
  goHome();
}

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", init);
}

if (typeof module !== "undefined") {
  module.exports = {
    shuffle,
    buildRound,
    correctDisplayIndex,
    isCorrect,
    scoreFor,
    formatScore,
    createCountdown,
    SPEED_SECONDS,
    validateQuestions,
    superlativeIds,
  };
}
