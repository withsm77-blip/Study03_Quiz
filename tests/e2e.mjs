import { chromium } from "playwright";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";
import fs from "node:fs";

const require = createRequire(import.meta.url);
const { QUESTIONS } = require("../questions.js");
const here = path.dirname(fileURLToPath(import.meta.url));
const APP_URL = "file://" + path.resolve(here, "..", "index.html");

const scenarios = [];
export function scenario(name, fn, opts = {}) {
  scenarios.push({ name, fn, opts });
}

async function launch() {
  try {
    return await chromium.launch();
  } catch (e) {
    return await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  }
}

async function openApp(browser, opts = {}) {
  const page = await browser.newPage();
  if (opts.clock) await page.clock.install();
  page.setDefaultTimeout(3000);
  page.errors = [];
  page.on("console", (m) => { if (m.type() === "error") page.errors.push(m.text()); });
  page.on("pageerror", (e) => page.errors.push(String(e)));
  await page.goto(APP_URL);
  return page;
}

async function currentQuestion(page) {
  const text = (await page.textContent("#question")).trim();
  const q = QUESTIONS.find((x) => x.question === text);
  assert.ok(q, "question not found in QUESTIONS: " + text);
  return q;
}

export async function answerCorrect(page) {
  const q = await currentQuestion(page);
  const want = q.choices[q.answer];
  const texts = await page.locator("#choices .choice").allTextContents();
  const idx = texts.findIndex((t) => t.trim() === want);
  assert.ok(idx >= 0, "correct choice not displayed");
  await page.locator("#choices .choice").nth(idx).click();
}

export async function answerWrong(page) {
  const q = await currentQuestion(page);
  const want = q.choices[q.answer];
  const texts = await page.locator("#choices .choice").allTextContents();
  const idx = texts.findIndex((t) => t.trim() !== want);
  await page.locator("#choices .choice").nth(idx).click();
}

scenario("stage1 practice flow", async (page) => {
  await page.click('.mode-btn[data-mode="practice"]');
  assert.ok(await page.isVisible("#screen-category"));
  assert.equal((await page.textContent(".no-record-notice")).trim(), "순위표에 기록되지 않음");
  await page.click('.category-btn[data-category="한국사"]');
  assert.equal((await page.textContent("#progress")).trim(), "1 / 10");
  await answerCorrect(page);
  assert.equal((await page.textContent("#feedback")).trim(), "정답!");
  assert.ok((await page.textContent("#explanation")).trim().length > 0);
  assert.ok((await page.textContent("#source")).trim().length > 0);
  const dis = await page.locator("#choices .choice").evaluateAll((els) => els.map((e) => e.disabled));
  assert.equal(dis.length, 4);
  assert.ok(dis.every(Boolean));
  assert.equal(await page.locator("#choices .choice.is-correct").count(), 1);
  assert.equal((await page.textContent("#next-btn")).trim(), "다음");
  await page.click("#next-btn");
  // wrong answer shows is-wrong
  await answerWrong(page);
  assert.equal((await page.textContent("#feedback")).trim(), "오답");
  assert.equal(await page.locator("#choices .choice.is-wrong").count(), 1);
  assert.equal(await page.locator("#choices .choice.is-correct").count(), 1);
  await page.click("#next-btn");
  // 2 done (1 correct, 1 wrong); remaining 8 -> 6 correct, 2 wrong
  for (let i = 2; i < 10; i++) {
    if (i < 8) await answerCorrect(page); else await answerWrong(page);
    if (i === 9) assert.equal((await page.textContent("#next-btn")).trim(), "결과 보기");
    await page.click("#next-btn");
  }
  assert.ok(await page.isVisible("#screen-result"));
  assert.equal((await page.textContent("#result-score")).trim(), "7 / 10");
  assert.equal((await page.textContent("#result-detail")).trim(), "맞힘 7 · 틀림 3");
  assert.ok(await page.isVisible("#screen-result .no-record-notice"));
  // again -> same category
  await page.click("#again-btn");
  assert.ok(await page.isVisible("#screen-quiz"));
  assert.equal((await page.textContent("#quiz-category")).trim(), "한국사");
  assert.equal((await page.textContent("#progress")).trim(), "1 / 10");
});

scenario("home button returns to mode screen", async (page) => {
  await page.click('.mode-btn[data-mode="practice"]');
  await page.click('.category-btn[data-category="과학"]');
  for (let i = 0; i < 10; i++) { await answerCorrect(page); await page.click("#next-btn"); }
  assert.equal((await page.textContent("#result-score")).trim(), "10 / 10");
  await page.click("#home-btn");
  assert.ok(await page.isVisible("#screen-mode"));
  assert.ok(!(await page.isVisible("#screen-result")));
});

scenario("double click scores once", async (page) => {
  await page.click('.mode-btn[data-mode="practice"]');
  await page.click('.category-btn[data-category="세계지리"]');
  const q = await currentQuestion(page);
  const texts = await page.locator("#choices .choice").allTextContents();
  const btn = page.locator("#choices .choice").nth(texts.findIndex((t) => t.trim() === q.choices[q.answer]));
  await btn.dblclick();
  assert.equal((await page.textContent("#score-now")).trim(), "1");
});

const timerText = async (page) => (await page.textContent("#timer")).trim();

async function startSpeed(page, cat = "한국사") {
  await page.click('.mode-btn[data-mode="speed"]');
  await page.click(`.category-btn[data-category="${cat}"]`);
}

scenario("mode screen", async (page) => {
  assert.ok(await page.isVisible("#screen-mode"));
  assert.ok(!(await page.isVisible("#screen-category")));
  await page.click('.mode-btn[data-mode="practice"]');
  assert.ok(await page.isVisible("#screen-category .no-record-notice"));
  assert.equal((await page.textContent("#screen-category .no-record-notice")).trim(), "순위표에 기록되지 않음");
});

scenario("mode screen speed hides notice", async (page) => {
  await page.click('.mode-btn[data-mode="speed"]');
  assert.ok(await page.isVisible("#screen-category"));
  assert.ok(!(await page.isVisible("#screen-category .no-record-notice")));
});

scenario("mode screen notice", async (page) => {
  const practice = page.locator('#screen-mode .mode-item[data-mode="practice"]');
  assert.ok((await practice.textContent()).includes("순위표에 기록되지 않음"));
  assert.ok(await practice.locator(".mode-rule").isVisible());
  for (const m of ["speed", "hint"]) {
    const t = (await page.locator(`#screen-mode .mode-item[data-mode="${m}"] .mode-rule`).textContent()).trim();
    assert.ok(t.length > 0, m + " rule missing");
  }
});

scenario("speed timeout", async (page) => {
  await startSpeed(page);
  assert.ok(await page.isVisible("#timer"));
  assert.equal(await timerText(page), "15");
  await page.clock.runFor(15000);
  assert.equal((await page.textContent("#feedback")).trim(), "시간 초과");
  assert.equal(await page.locator("#choices .choice.is-correct").count(), 1);
  assert.equal(await page.locator("#choices .choice.is-wrong").count(), 0);
  assert.equal((await page.textContent("#score-now")).trim(), "0");
  const dis = await page.locator("#choices .choice").evaluateAll((els) => els.map((e) => e.disabled));
  assert.ok(dis.every(Boolean));
  assert.ok(await page.isVisible("#next-btn"));
}, { clock: true });

scenario("speed timer pauses and resets", async (page) => {
  await startSpeed(page);
  await page.clock.runFor(5000);
  await answerCorrect(page);
  assert.equal(await timerText(page), "10");
  await page.clock.runFor(20000);
  assert.equal(await timerText(page), "10");
  await page.click("#next-btn");
  assert.equal(await timerText(page), "15");
}, { clock: true });

scenario("answer after timeout ignored", async (page) => {
  await startSpeed(page);
  await page.clock.runFor(15000);
  await page.evaluate(() => document.querySelector("#choices .choice").click());
  assert.equal((await page.textContent("#feedback")).trim(), "시간 초과");
  assert.equal((await page.textContent("#score-now")).trim(), "0");
}, { clock: true });

scenario("no timer leak", async (page) => {
  await startSpeed(page);
  for (let i = 0; i < 10; i++) {
    await answerCorrect(page);
    await page.click("#next-btn");
  }
  assert.ok(await page.isVisible("#screen-result"));
  await page.click("#again-btn");
  assert.equal(await timerText(page), "15");
  await page.clock.runFor(1000);
  assert.equal(await timerText(page), "14");
}, { clock: true });

scenario("speed timer works with real clock", async (page) => {
  await startSpeed(page);
  assert.equal(await timerText(page), "15");
  await page.waitForTimeout(1200);
  assert.equal(await timerText(page), "14");
});

scenario("timer hidden outside speed mode", async (page) => {
  await page.click('.mode-btn[data-mode="practice"]');
  await page.click('.category-btn[data-category="과학"]');
  assert.ok(!(await page.isVisible("#timer")));
});

async function startHint(page, cat = "한국사") {
  await page.click('.mode-btn[data-mode="hint"]');
  await page.click(`.category-btn[data-category="${cat}"]`);
}

scenario("hint mode", async (page) => {
  await startHint(page);
  assert.ok(await page.isVisible("#hint-btn"));
  assert.ok(!(await page.isVisible("#timer")));
  await page.click("#hint-btn");
  assert.equal(await page.locator("#choices .choice.is-removed").count(), 2);
  const rem = await page.locator("#choices .choice.is-removed").evaluateAll((els) => els.map((e) => e.disabled));
  assert.ok(rem.every(Boolean));
  assert.ok(await page.locator("#hint-btn").isDisabled());
  const q = await currentQuestion(page);
  const removed = (await page.locator("#choices .choice.is-removed").allTextContents()).map((t) => t.trim());
  assert.ok(!removed.includes(q.choices[q.answer]));
  await answerCorrect(page);
  assert.equal((await page.textContent("#score-now")).trim(), "0.5");
  await page.click("#next-btn");
  assert.ok(!(await page.locator("#hint-btn").isDisabled()));
  assert.equal(await page.locator("#choices .choice.is-removed").count(), 0);
  await answerCorrect(page);
  assert.equal((await page.textContent("#score-now")).trim(), "1.5");
});

scenario("hint disabled after answer", async (page) => {
  await startHint(page);
  await answerCorrect(page);
  assert.ok(await page.locator("#hint-btn").isDisabled());
});

scenario("hint hidden outside hint mode", async (page) => {
  await page.click('.mode-btn[data-mode="practice"]');
  await page.click('.category-btn[data-category="과학"]');
  assert.ok(!(await page.isVisible("#hint-btn")));
});

scenario("hint result format", async (page) => {
  await startHint(page);
  await page.click("#hint-btn");
  await answerCorrect(page);
  await page.click("#next-btn");
  for (let i = 1; i < 10; i++) {
    if (i < 8) await answerCorrect(page); else await answerWrong(page);
    await page.click("#next-btn");
  }
  assert.equal((await page.textContent("#result-score")).trim(), "7.5 / 10");
  assert.equal((await page.textContent("#result-detail")).trim(), "맞힘 8 · 틀림 2");
});

async function playPractice(page, wrongCount, cat = "한국사") {
  await page.click('.mode-btn[data-mode="practice"]');
  await page.click(`.category-btn[data-category="${cat}"]`);
  const wrongTexts = [];
  for (let i = 0; i < 10; i++) {
    if (i < 10 - wrongCount) await answerCorrect(page);
    else { wrongTexts.push((await page.textContent("#question")).trim()); await answerWrong(page); }
    await page.click("#next-btn");
  }
  return wrongTexts;
}

scenario("retry wrong only", async (page) => {
  const wrongTexts = await playPractice(page, 3);
  assert.ok(await page.isVisible("#screen-result"));
  assert.ok(!(await page.isVisible("#retry-summary")));
  assert.ok(await page.isVisible("#retry-btn"));
  await page.click("#retry-btn");
  assert.equal((await page.textContent("#progress")).trim(), "1 / 3");
  const seen = [];
  for (let i = 0; i < 3; i++) {
    seen.push((await page.textContent("#question")).trim());
    if (i < 2) await answerCorrect(page); else await answerWrong(page);
    assert.ok(["정답!", "오답"].includes((await page.textContent("#feedback")).trim()));
    await page.click("#next-btn");
  }
  assert.deepEqual(seen.slice().sort(), wrongTexts.slice().sort());
  assert.equal((await page.textContent("#result-score")).trim(), "7 / 10");
  assert.equal((await page.textContent("#retry-summary")).trim(), "다시 풀기 3문제 중 2문제 정답");
  assert.ok(!(await page.isVisible("#retry-btn")));
  await page.click("#again-btn");
  assert.equal((await page.textContent("#progress")).trim(), "1 / 10");
  for (let i = 0; i < 10; i++) { await answerCorrect(page); await page.click("#next-btn"); }
  assert.equal((await page.textContent("#result-score")).trim(), "10 / 10");
  assert.ok(!(await page.isVisible("#retry-summary")));
  assert.ok(!(await page.isVisible("#retry-btn")));
});

scenario("no retry when perfect", async (page) => {
  await playPractice(page, 0);
  assert.ok(await page.isVisible("#screen-result"));
  assert.ok(!(await page.isVisible("#retry-btn")));
});

scenario("retry only in practice", async (page) => {
  await startSpeed(page);
  for (let i = 0; i < 10; i++) { await answerWrong(page); await page.click("#next-btn"); }
  assert.ok(await page.isVisible("#screen-result"));
  assert.ok(!(await page.isVisible("#retry-btn")));
  await page.click("#home-btn");
  await startHint(page);
  for (let i = 0; i < 10; i++) { await answerWrong(page); await page.click("#next-btn"); }
  assert.ok(await page.isVisible("#screen-result"));
  assert.ok(!(await page.isVisible("#retry-btn")));
});

async function playToResult(page, mode, correctCount, cat = "한국사") {
  await page.click(`.mode-btn[data-mode="${mode}"]`);
  await page.click(`.category-btn[data-category="${cat}"]`);
  for (let i = 0; i < 10; i++) {
    if (i < correctCount) await answerCorrect(page); else await answerWrong(page);
    await page.click("#next-btn");
  }
  assert.ok(await page.isVisible("#screen-result"));
}

const readBoard = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("quizLeaderboard")));
const msgText = async (page) => (await page.textContent("#save-msg")).trim();

async function openLbFromHome(page, mode, cat) {
  await page.click("#open-lb-btn");
  await page.selectOption("#lb-mode", mode);
  await page.selectOption("#lb-category", cat);
}

scenario("save and persist", async (page) => {
  await playToResult(page, "speed", 8);
  assert.ok(await page.isVisible("#save-area"));
  await page.fill("#name-input", "철수");
  await page.click("#save-btn");
  assert.equal(await msgText(page), "저장했습니다");
  assert.ok(await page.locator("#save-btn").isDisabled());
  await page.reload();
  await openLbFromHome(page, "speed", "한국사");
  const first = (await page.locator("#lb-list li").first().textContent()).trim();
  assert.ok(first.includes("철수") && first.includes("8"), first);
  assert.ok(/^1\. 철수 — 8 \(\d{4}-\d{2}-\d{2}\)$/.test(first), first);
});

scenario("save only once", async (page) => {
  await playToResult(page, "speed", 8);
  await page.fill("#name-input", "철수");
  await page.evaluate(() => { document.getElementById("save-btn").click(); document.getElementById("save-btn").click(); });
  await page.press("#name-input", "Enter");
  const b = await readBoard(page);
  assert.equal(b["speed|한국사"].length, 1);
});

scenario("enter key saves", async (page) => {
  await playToResult(page, "hint", 3);
  await page.fill("#name-input", "영희");
  await page.press("#name-input", "Enter");
  assert.equal(await msgText(page), "저장했습니다");
  assert.equal((await readBoard(page))["hint|한국사"][0].name, "영희");
});

scenario("practice has no save", async (page) => {
  await playToResult(page, "practice", 7);
  assert.ok(!(await page.isVisible("#save-area")));
});

scenario("practice retry result has no save", async (page) => {
  await playPractice(page, 2);
  await page.click("#retry-btn");
  for (let i = 0; i < 2; i++) { await answerCorrect(page); await page.click("#next-btn"); }
  assert.ok(await page.isVisible("#screen-result"));
  assert.ok(!(await page.isVisible("#save-area")));
});

scenario("name rendered as text", async (page) => {
  await playToResult(page, "speed", 8);
  await page.fill("#name-input", "<b>x</b>");
  await page.click("#save-btn");
  await page.click("#lb-open-from-result");
  const li = page.locator("#lb-list li").first();
  assert.ok((await li.textContent()).includes("<b>x</b>"));
  assert.equal(await page.locator("#lb-list li b").count(), 0);
});

scenario("empty name is 익명", async (page) => {
  await playToResult(page, "speed", 8);
  await page.fill("#name-input", "   ");
  await page.click("#save-btn");
  assert.equal((await readBoard(page))["speed|한국사"][0].name, "익명");
});

scenario("out of rank", async (page) => {
  await page.evaluate(() => {
    const recs = [1, 2, 3, 4, 5].map((i) => ({ name: "고수" + i, score: 10, date: "2026-01-01", ts: i }));
    localStorage.setItem("quizLeaderboard", JSON.stringify({ "speed|한국사": recs }));
  });
  await page.reload();
  await playToResult(page, "speed", 9);
  await page.click("#save-btn");
  assert.equal(await msgText(page), "순위권 밖입니다");
  assert.equal((await readBoard(page))["speed|한국사"].length, 5);
});

scenario("corrupt storage", async (page) => {
  await page.evaluate(() => localStorage.setItem("quizLeaderboard", "{oops"));
  await page.reload();
  await openLbFromHome(page, "speed", "한국사");
  assert.equal((await page.textContent("#lb-list")).trim(), "기록 없음");
  assert.ok((await page.textContent("#screen-leaderboard")).includes("순위표를 저장할 수 없습니다"));
  await page.click("#lb-back-btn");
  await playToResult(page, "speed", 5);
  await page.click("#save-btn");
  assert.equal(await msgText(page), "순위표를 저장할 수 없습니다");
});

scenario("malformed board entries", async (page) => {
  await page.evaluate(() => localStorage.setItem("quizLeaderboard", JSON.stringify({ "speed|한국사": "x", "speed|과학": [null, 3, { name: "정상", score: 2, date: "2026-01-01", ts: 1 }] })));
  await page.reload();
  await openLbFromHome(page, "speed", "한국사");
  assert.equal((await page.textContent("#lb-list")).trim(), "기록 없음");
  await page.selectOption("#lb-category", "과학");
  assert.equal(await page.locator("#lb-list li").count(), 1);
});

scenario("separate boards", async (page) => {
  await playToResult(page, "hint", 8);
  await page.fill("#name-input", "힌트왕");
  await page.click("#save-btn");
  await page.click("#home-btn");
  await openLbFromHome(page, "speed", "한국사");
  assert.equal((await page.textContent("#lb-list")).trim(), "기록 없음");
  await page.selectOption("#lb-mode", "hint");
  assert.ok((await page.textContent("#lb-list")).includes("힌트왕"));
  assert.deepEqual(await page.locator("#lb-mode option").allTextContents(), ["스피드", "힌트"]);
});

scenario("new round re-enables save", async (page) => {
  await playToResult(page, "speed", 8);
  await page.click("#save-btn");
  await page.click("#again-btn");
  for (let i = 0; i < 10; i++) { await answerCorrect(page); await page.click("#next-btn"); }
  assert.ok(!(await page.locator("#save-btn").isDisabled()));
  assert.equal(await msgText(page), "");
  await page.click("#save-btn");
  assert.equal((await readBoard(page))["speed|한국사"].length, 2);
});

scenario("leaderboard from result preselects", async (page) => {
  await playToResult(page, "hint", 4, "과학");
  await page.click("#lb-open-from-result");
  assert.equal(await page.inputValue("#lb-mode"), "hint");
  assert.equal(await page.inputValue("#lb-category"), "과학");
  await page.click("#lb-back-btn");
  assert.ok(await page.isVisible("#screen-result"));
});

async function main() {
  const browser = await launch();
  let failed = 0;
  for (const { name, fn, opts } of scenarios) {
    const page = await openApp(browser, opts);
    try {
      await page.evaluate(() => localStorage.clear());
      await fn(page);
      assert.deepEqual(page.errors, [], "console errors");
      console.log("PASS  " + name);
    } catch (e) {
      failed++;
      console.log("FAIL  " + name + "\n      " + (e.message || e).split("\n")[0]);
    }
    await page.close();
  }
  await browser.close();
  console.log(`\n${scenarios.length - failed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main();
