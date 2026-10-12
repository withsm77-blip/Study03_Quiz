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
export function scenario(name, fn) {
  scenarios.push({ name, fn });
}

async function launch() {
  try {
    return await chromium.launch();
  } catch (e) {
    return await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  }
}

async function openApp(browser) {
  const page = await browser.newPage();
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

scenario("home button returns to category screen", async (page) => {
  await page.click('.category-btn[data-category="과학"]');
  for (let i = 0; i < 10; i++) { await answerCorrect(page); await page.click("#next-btn"); }
  assert.equal((await page.textContent("#result-score")).trim(), "10 / 10");
  await page.click("#home-btn");
  assert.ok(await page.isVisible("#screen-category"));
  assert.ok(!(await page.isVisible("#screen-result")));
});

scenario("double click scores once", async (page) => {
  await page.click('.category-btn[data-category="세계지리"]');
  const q = await currentQuestion(page);
  const texts = await page.locator("#choices .choice").allTextContents();
  const btn = page.locator("#choices .choice").nth(texts.findIndex((t) => t.trim() === q.choices[q.answer]));
  await btn.dblclick();
  assert.equal((await page.textContent("#score-now")).trim(), "1");
});

async function main() {
  const browser = await launch();
  let failed = 0;
  for (const { name, fn } of scenarios) {
    const page = await openApp(browser);
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
