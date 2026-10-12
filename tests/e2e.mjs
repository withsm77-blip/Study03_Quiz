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

async function main() {
  const browser = await launch();
  let failed = 0;
  for (const { name, fn, opts } of scenarios) {
    const page = await openApp(browser, opts);
    try {
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
