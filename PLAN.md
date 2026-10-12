# 4지선다 상식 퀴즈 웹 앱 구현 계획서

> **에이전트 작업자 필독:** 이 계획은 superpowers:subagent-driven-development(권장) 또는 superpowers:executing-plans 스킬로 Task 단위로 실행합니다. 진행 상황은 체크박스(`- [ ]`)로 표시합니다.

**목표:** 서버 없이 `index.html`만 열면 동작하는 4지선다 상식 퀴즈 웹 앱(연습·스피드·힌트 모드, 순위표)을 PRD의 3단계 순서대로 만든다.

**구조**
- 앱 파일은 4개(`index.html`, `style.css`, `script.js`, `questions.js`)이고, 일반 `<script>` 태그로 불러와 전역 변수를 공유한다.
- `script.js`는 앞부분의 **순수 로직**(섞기, 판정, 점수, 힌트, 타이머, 순위표)과 뒷부분의 **화면 제어(DOM)** 로 나눈다.
- 순수 로직은 Node 내장 테스트로 검증하고, 화면은 Playwright로 `file://`에서 열어 검증한다.

**기술 스택:** 바닐라 HTML/CSS/JS(ES2020), 외부 라이브러리 없음. 테스트에는 Node 18 이상의 `node:test`와 Playwright(개발용)를 쓴다.

**스펙:** `PRD.md` (이 계획은 PRD를 근거로 하므로 함께 읽는다)

## 전체 제약

- 앱 파일은 `index.html`, `style.css`, `script.js`, `questions.js` 4개만 둔다. 테스트용 파일은 `tests/` 폴더에만 두고, 앱이 이 파일들을 불러오지 않는다.
- `file://`로 열어도 동작해야 한다. ES 모듈(`import`/`export`), `fetch`, 외부 CDN을 쓰지 않는다.
- 카테고리 문자열은 `"한국사"`, `"세계지리"`, `"과학"`, `"예술과 문화"`로 고정하고, 카테고리마다 10문항, 총 40문항을 둔다.
- 모드 키는 `"practice"`, `"speed"`, `"hint"`로 고정한다.
- 점수: 맞히면 1, 힌트를 쓰고 맞히면 0.5, 틀리거나 시간이 지나면 0이다. 한 판 만점은 10점이다.
- 스피드 모드는 문항마다 15초다. 해설이 나오면 타이머가 멈추고, [다음]을 누르면 15초부터 다시 센다.
- 연습 모드의 카테고리 선택(1단계에서는 시작) 화면과 결과 화면에 `순위표에 기록되지 않음`을 표시한다.
- 연습 모드의 틀린 문제 다시 풀기는 1번만 할 수 있고, 원래 점수에는 반영하지 않는다. 결과 문구는 `다시 풀기 N문제 중 M문제 정답`이다.
- 순위표
  - `localStorage` 키 `quizLeaderboard`에 저장한다. 내부 키는 `"speed|한국사"`처럼 `모드|카테고리` 형식이다.
  - 모드·카테고리마다 상위 5개를 남긴다.
  - 정렬은 점수 내림차순이고, 동점이면 `ts`가 작은 기록(먼저 저장한 기록)을 위에 둔다.
  - 이름은 앞뒤 공백을 지우고 최대 10자까지 받는다. 비어 있으면 `익명`으로 저장한다.
  - 상위 5위 안에 들지 못하면 저장하지 않고 `순위권 밖입니다`를 표시한다.
  - 저장할 수 없으면 `순위표를 저장할 수 없습니다`를 표시한다.
- 문항 데이터 형식은 `{ id, category, question, choices[4], answer(0~3), explanation, source }`이다. `id` 접두어는 `kh`(한국사)·`wg`(세계지리)·`sc`(과학)·`ac`(예술과 문화)로 한다.
- 사용자 입력과 문항 문자열은 화면에 넣을 때 항상 `textContent`를 쓴다. `innerHTML`로 넣지 않는다.

## 사용자가 걸려 넘어지기 쉬운 지점

PRD가 직접 다루지 않지만 실제 사용에서 문제가 되기 쉬운 상황 5가지다. 위에 있을수록 일어나기 쉽다. 각 항목을 고정하는 테스트를 괄호 안의 Task에 넣었다.

1. **보기를 빠르게 두 번 클릭함:** 점수는 한 번만 올라야 한다. (Task 3 e2e `double click scores once`)
2. **스피드 모드에서 0초가 되는 순간 답을 클릭함:** 시간 초과와 답 선택 중 먼저 처리된 것 하나만 반영되어야 한다. 이미 판정이 끝났다면 나중 입력은 무시한다. (Task 4 `countdown stop prevents expire`, e2e `answer after timeout ignored`)
3. **`localStorage`가 손상됐거나 접근할 때 예외가 남:** 앱은 빈 순위표로 계속 동작하고 안내 문구를 보여야 한다. (Task 7 `loadBoard survives bad json / throwing storage`)
4. **이름에 `<b>` 같은 태그나 공백만 입력함:** 태그는 글자 그대로 보이고, 공백만 입력하면 `익명`으로 저장되어야 한다. (Task 7 `sanitizeName`, Task 8 e2e `name rendered as text`)
5. **[저장]을 두 번 누르거나 Enter를 연타함:** 기록은 1개만 생겨야 한다. (Task 8 e2e `save only once`)

---

## 파일 구조

| 파일 | 책임 |
|---|---|
| `questions.js` | `const QUESTIONS = [...]`(40문항). 맨 끝에 `if (typeof module !== "undefined") module.exports = { QUESTIONS };`를 둔다 |
| `script.js` 앞부분 (순수 로직) | `shuffle`, `buildRound`, `isCorrect`, `scoreFor`, `formatScore`, `validateQuestions`, `createCountdown`, `pickHintRemovals`, `getWrongItems`, `sanitizeName`, `lbKey`, `insertRecord`, `loadBoard`, `saveBoard`. 끝부분에서 Node용으로 `module.exports`를 조건부로 내보낸다 |
| `script.js` 뒷부분 (화면 제어) | 상태 객체 `state`, 화면 전환 `showScreen(id)`, 렌더링 함수와 이벤트 연결. `typeof document !== "undefined"`일 때만 `DOMContentLoaded`에서 `init()`을 실행한다 |
| `index.html` | 화면 5개 구역과 고정 요소 id(아래 DOM 약속). `questions.js` → `script.js` 순서로 불러온다 |
| `style.css` | 레이아웃, 정답/오답 색, 지워진 보기, 타이머 |
| `tests/logic.test.js` | 순수 로직 단위 테스트 (`node --test tests/`) |
| `tests/e2e.mjs` | Playwright로 `file://` 시나리오 실행 (`node tests/e2e.mjs`) |
| `tests/package.json` | 개발 의존성 `playwright`만 둔다 |

### DOM 약속 (Task 3에서 만들고 이후 Task에서 그대로 사용)

**화면 구역**

| id | 화면 |
|---|---|
| `#screen-mode` | 모드 선택 |
| `#screen-category` | 카테고리 선택 |
| `#screen-quiz` | 퀴즈 |
| `#screen-result` | 결과 |
| `#screen-leaderboard` | 순위표 |

`showScreen(id)`는 해당 구역에만 `hidden`을 해제하고 나머지 구역은 숨긴다.

**화면별 요소**

- 모드 선택 화면: `button.mode-btn[data-mode]`, `#open-lb-btn`
- 카테고리 선택 화면: `button.category-btn[data-category]`, `#current-mode`, `.no-record-notice`
- 퀴즈 화면
  - 상단 정보: `#progress`(`3 / 10`), `#quiz-category`, `#score-now`, `#timer`(스피드 모드만 표시)
  - 문제와 보기: `#question`, `#choices` 안의 `button.choice[data-index]` 4개
  - 힌트: `#hint-btn`(힌트 모드만 표시)
  - 판정 후 표시: `#feedback`(`정답!` / `오답` / `시간 초과`), `#explanation`, `#source`
  - 다음 버튼: `#next-btn`(마지막 문항에서는 문구가 `결과 보기`)
- 결과 화면
  - 점수와 안내: `#result-score`(`7.5 / 10`), `#result-detail`(`맞힘 N · 틀림 M`), `.no-record-notice`
  - 다시 풀기: `#retry-btn`, `#retry-summary`
  - 이동 버튼: `#again-btn`, `#home-btn`
  - 순위표 저장: `#save-area`, `#name-input`(`maxlength="10"`), `#save-btn`, `#save-msg`
- 순위표 화면: `#lb-mode`, `#lb-category`(select), `#lb-list`(ol), `#lb-back-btn`

`.choice`의 상태 클래스는 다음 세 가지다.
- `is-correct`: 정답
- `is-wrong`: 틀리게 고른 보기
- `is-removed`: 힌트로 지운 보기(버튼은 `disabled`)

---

## 1단계: 연습 모드와 점수

### Task 1: 프로젝트 뼈대와 핵심 판정 로직

**Files:**
- Create: `script.js`, `tests/logic.test.js`, `tests/package.json`, `.gitignore`(`tests/node_modules/`)
- 실행: 폴더에서 `git init`

**Interfaces:**
- Produces
  - `shuffle(arr, rng = Math.random) -> Array`: 원본을 바꾸지 않고 새 배열을 돌려준다. Fisher–Yates로 섞는다.
  - `buildRound(questions, category, rng = Math.random) -> RoundItem[]`
    - 해당 카테고리 문항을 섞어서 만든다.
    - `RoundItem = { q: Question, order: number[] }`이고, `order`는 원본 보기 인덱스 `[0,1,2,3]`을 섞은 것이다.
    - 화면의 i번째 보기는 `q.choices[order[i]]`다.
  - `correctDisplayIndex(item) -> number`: `item.order.indexOf(item.q.answer)`를 돌려준다.
  - `isCorrect(item, displayIndex) -> boolean`
  - `scoreFor({ correct: boolean, usedHint: boolean }) -> 0 | 0.5 | 1`
  - `formatScore(n) -> string`: 정수면 `"7"`, 아니면 소수 한 자리 `"7.5"`
  - 내보내기 방식: `script.js`의 끝에서 `if (typeof module !== "undefined") module.exports = { ... }`로 내보낸다. 이후 Task에서 만드는 함수도 여기에 추가한다.

- [ ] **Step 1: 실패하는 테스트 작성** (`tests/logic.test.js`, `node:test` + `node:assert/strict`)
  - `shuffle keeps elements`: 길이가 같고, 정렬하면 원본과 같다. 원본 배열은 바뀌지 않는다.
  - `buildRound filters category`: 가짜 문항 12개(한국사 10개, 과학 2개)를 넣고 `"한국사"`를 고르면 길이가 10이고 모두 한국사다. 모든 `order`를 정렬하면 `[0,1,2,3]`이다.
  - `isCorrect follows shuffled order`: `{ q:{answer:2, choices:[...]}, order:[3,2,0,1] }`이면 `isCorrect(item,1) === true`, `isCorrect(item,2) === false`, `correctDisplayIndex(item) === 1`이다.
  - `scoreFor`: `{correct:true, usedHint:false}`는 1, `{correct:true, usedHint:true}`는 0.5, `{correct:false, usedHint:true}`와 `{correct:false, usedHint:false}`는 0이다.
  - `formatScore`: `formatScore(7) === "7"`, `formatScore(7.5) === "7.5"`, `formatScore(0) === "0"`
- [ ] **Step 2: 테스트 실행** — `node --test tests/` → `shuffle is not a function` 같은 오류로 FAIL
- [ ] **Step 3: 위 함수들을 `script.js` 앞부분에 구현하고 조건부 export를 추가**
- [ ] **Step 4: 테스트 실행** — `node --test tests/` → 모두 PASS
- [ ] **Step 5: 커밋** — `git add -A && git commit -m "feat: core round, judge and score logic"`

### Task 2: 40문항 작성과 데이터 검증

**Files:**
- Create: `questions.js`
- Modify: `script.js`(`validateQuestions` 추가), `tests/logic.test.js`

**Interfaces:**
- Consumes: Task 1의 export 방식
- Produces
  - 전역 `QUESTIONS: Question[]`
  - `validateQuestions(questions) -> string[]`: 경고 메시지 배열을 돌려주고, 빈 배열이면 통과다. 검사 항목은 아래와 같다.
    - 카테고리별로 정확히 10문항이다.
    - `id`가 중복되지 않는다.
    - `choices`가 4개이고 서로 다르다.
    - `answer`가 0~3 범위의 정수다.
    - `explanation`과 `source`가 공백이 아니다.
  - `superlativeIds(questions) -> string[]`: `question`에 `가장|최초|최대|최소|최고`가 들어 있는 문항의 id를 돌려준다. 오류가 아니라 사람이 확인할 목록이다.

- [ ] **Step 1: 실패하는 테스트 작성**
  - `validateQuestions catches problems`: 아래 결함마다 경고가 1개 이상 나온다.
    - `answer: 4`
    - 같은 보기 2개
    - `source: " "`
    - id 중복
    - 한 카테고리가 9문항
  - `real QUESTIONS are valid`: `require("../questions.js").QUESTIONS`에 대해 `validateQuestions`가 `[]`를 돌려주고 길이가 40이다.
  - `superlatives state basis`: `superlativeIds`가 돌려준 각 문항의 `question`에 숫자 연도(`/\d{4}년/`)나 `기준`이 들어 있다.
- [ ] **Step 2: 테스트 실행** — FAIL (`questions.js`와 함수가 없음)
- [ ] **Step 3: `validateQuestions`, `superlativeIds` 구현**
- [ ] **Step 4: 카테고리별로 10문항씩 작성**
  - 각 문항의 사실을 WebSearch로 확인하고, 확인한 페이지를 `source`에 `"기관/사전명, 항목명"` 형식으로 적는다.
    - 예: `"국사편찬위원회 우리역사넷, 훈민정음"`
  - 확인하지 못한 문항은 다른 문항으로 바꾼다.
  - `explanation`은 출처를 빼고 약 60자 이내로 쓴다.
  - 정답 보기 이외의 3개가 해석에 따라서도 정답이 될 수 없는지 하나씩 확인한다.
  - 최상급 표현을 쓴 문항은 문제에 기준과 시점을 적는다.
    - 예: `"2024년 기준, 면적 기준으로 세계에서 가장 넓은 나라는?"`
  - 출처 URL 목록은 커밋 메시지 본문에 남겨, 나중에 사용자가 검수할 때 쓸 수 있게 한다.
- [ ] **Step 5: 테스트 실행** — `node --test tests/` → PASS
- [ ] **Step 6: 커밋** — `git commit -m "feat: add 40 verified questions and data validation"`

### Task 3: 1단계 화면 — 카테고리 선택 → 연습 퀴즈 → 결과

**Files:**
- Create: `index.html`, `style.css`, `tests/e2e.mjs`
- Modify: `script.js`(화면 제어 부분)

**Interfaces:**
- Consumes: `buildRound`, `isCorrect`, `correctDisplayIndex`, `scoreFor`, `formatScore`, `validateQuestions`, `QUESTIONS`, 위의 DOM 약속
- Produces
  - 상태 객체: `state = { mode, category, items, index, score, results: [{ item, correct, usedHint, timedOut }], locked, isRetry }`
  - 함수: `startRound(mode, category)`, `renderQuestion()`, `handleAnswer(displayIndex)`, `nextQuestion()`, `showResult()`
  - `init()`
    - `validateQuestions` 결과가 비어 있지 않으면 `console.warn`으로 알린다.
    - 1단계에서는 `#screen-category`를 첫 화면으로 보여 주고 `state.mode = "practice"`로 둔다.

- [ ] **Step 1: e2e 준비**
  - `cd tests && npm i -D playwright`를 실행한다. `playwright install`은 실행하지 않는다.
  - Chromium 경로는 `executablePath: '/opt/pw-browsers/chromium'`을 쓰거나 기본값을 쓴다.
  - `tests/e2e.mjs`에는 테스트 등록 함수 `scenario(name, fn)`과 결과 요약 출력 기능을 둔다. 실패가 하나라도 있으면 종료 코드 1로 끝낸다.
  - 도우미 `answerCorrect(page)`: 화면의 `#question` 텍스트로 `QUESTIONS`에서 문항을 찾고, 정답 보기 텍스트와 같은 `.choice`를 클릭한다.
  - 도우미 `answerWrong(page)`: 정답이 아닌 첫 `.choice`를 클릭한다.
- [ ] **Step 2: 실패하는 e2e 시나리오 작성**
  - `stage1 practice flow`
    - 시작할 때 `#screen-category`가 보이고, `.no-record-notice`의 텍스트가 `순위표에 기록되지 않음`이다.
    - `한국사`를 클릭하면 `#progress`가 `1 / 10`이다.
    - 정답을 고르면 `#feedback`이 `정답!`이고 `#explanation`과 `#source`가 비어 있지 않다. 모든 `.choice`가 `disabled`다.
    - 정답 7개, 오답 3개로 끝내면 `#result-score`가 `7 / 10`이고, 결과 화면에도 `.no-record-notice`가 보인다.
  - `double click scores once`: 정답 보기를 두 번 클릭해도 `#score-now`가 `1`이다.
  - `no console errors`: 위 흐름 동안 `page.on('console')`과 `pageerror`에서 error가 0건이다.
- [ ] **Step 3: 실행** — `node tests/e2e.mjs` → FAIL
- [ ] **Step 4: 구현**
  - `handleAnswer`는 처음에 `state.locked`이면 바로 return한다. 판정이 끝나면 `locked = true`로 바꾼다.
  - 보기 버튼 텍스트와 해설은 `textContent`로 넣는다.
  - 마지막 문항에서는 `#next-btn` 문구를 `결과 보기`로 바꾸고, 누르면 `showResult()`를 호출한다.
  - `#again-btn`은 같은 모드와 같은 카테고리로 `startRound`를 다시 호출한다. `#home-btn`은 첫 화면으로 돌아간다.
  - 정답 칸에는 `is-correct`, 틀리게 고른 칸에는 `is-wrong` 클래스를 붙인다.
- [ ] **Step 5: 실행** — `node --test tests/ && node tests/e2e.mjs` → 모두 PASS
- [ ] **Step 6: 커밋** — `git commit -m "feat: stage 1 practice mode UI"`

> **1단계 체크포인트:** 사용자가 `index.html`을 더블클릭해 한 판을 끝까지 풀어 본다. 2단계로 넘어가기 전에 사용자 확인을 받는다.

---

## 2단계: 스피드·힌트 모드, 모드 선택, 틀린 문제 다시 풀기

### Task 4: 모드 선택 화면과 스피드 모드

**Files:**
- Modify: `script.js`, `index.html`, `style.css`, `tests/logic.test.js`, `tests/e2e.mjs`

**Interfaces:**
- Produces
  - `createCountdown(seconds, onTick, onExpire, clock = { setInterval, clearInterval }) -> { start(), stop() }`
    - 1초마다 `onTick(남은초)`를 호출하고, 0이 되면 `onExpire()`를 **1번만** 호출한 뒤 스스로 멈춘다.
    - `start()`를 다시 부르면 이전 interval을 지우고 `seconds`부터 다시 센다.
    - `stop()`을 부른 뒤에는 어떤 콜백도 호출하지 않는다.
  - 상수 `SPEED_SECONDS = 15`
  - 상태 변경: `state.timer`를 추가한다(`createCountdown`이 돌려준 객체 또는 `null`).
  - 동작 변경: `init()`의 첫 화면을 `#screen-mode`로 바꾼다.

- [ ] **Step 1: 실패하는 단위 테스트 작성** (setInterval과 clearInterval을 흉내 내는 가짜 시계를 쓴다)
  - `countdown ticks then expires once`: 15번 tick을 진행하면 `onTick`이 14,13,…,0 순서로 호출되고, `onExpire`는 1번만 호출된다. 추가로 tick해도 더 호출되지 않는다.
  - `countdown stop prevents expire`: 10번 tick한 뒤 `stop()`하고 다시 10번 tick해도 `onExpire`가 호출되지 않는다.
  - `countdown restart resets`: 5번 tick한 뒤 `start()`를 다시 부르고, 그다음 첫 tick에서 `onTick(14)`가 호출된다. 활성 interval은 1개뿐이다.
- [ ] **Step 2: 실행** → FAIL
- [ ] **Step 3: `createCountdown` 구현**
- [ ] **Step 4: 실패하는 e2e 작성** (`page.clock.install()`을 페이지를 불러오기 전에 호출한다)
  - `mode screen`
    - 첫 화면이 `#screen-mode`다.
    - 연습 모드를 고르면 카테고리 화면에 `순위표에 기록되지 않음`이 보인다.
    - 스피드 모드를 고르면 카테고리 화면에 그 문구가 보이지 않는다.
  - `speed timeout`: 스피드 모드에서 `page.clock.runFor(15000)`을 실행하면 `#feedback`이 `시간 초과`이고, 정답 칸이 `is-correct`이며, `#score-now`가 `0`이다.
  - `speed timer pauses and resets`
    - 5초 뒤에 정답을 고르면 `#timer`가 `10`에서 멈추고, 그 뒤 20초가 지나도 값이 그대로다.
    - [다음]을 누르면 `#timer`가 `15`다.
  - `answer after timeout ignored`: 시간 초과 뒤에 보기를 클릭해도 점수와 `#feedback`이 바뀌지 않는다.
  - `no timer leak`: 스피드 모드에서 결과까지 진행하고 [다시 하기]를 누른다. 그 뒤 `runFor(1000)`을 한 번 실행하면 `#timer`가 `14`다. 정확히 1만 줄어야 하며, 타이머가 겹치면 더 많이 줄어든다.
  - `mode screen notice`: 모드 선택 화면의 연습 모드 항목에 `순위표에 기록되지 않음`이 보인다(PRD 4.1).
- [ ] **Step 5: 구현**
  - `renderQuestion`
    - 스피드 모드일 때 `#timer`를 보여 주고 `state.timer.start()`를 호출한다.
    - 그 외 모드에서는 `#timer`를 숨긴다.
  - `handleAnswer`와 만료 처리는 둘 다 맨 처음에 `state.timer?.stop()`을 호출한다.
  - 만료 처리는 `handleAnswer(null)`로 공유하고, `null`이면 `timedOut: true`, 피드백 문구는 `시간 초과`로 처리한다.
  - `startRound`와 `showResult`는 기존 타이머를 `stop()`한다.
  - 모드 선택 화면에서 각 모드 아래에 규칙 설명을 한 줄씩 표시한다.
- [ ] **Step 6: 실행** — `node --test tests/ && node tests/e2e.mjs` → PASS (1단계 시나리오는 첫 화면 변경에 맞춰 모드 선택부터 시작하도록 고친다)
- [ ] **Step 7: 커밋** — `git commit -m "feat: mode select and speed mode"`

### Task 5: 힌트 모드

**Files:**
- Modify: `script.js`, `index.html`, `style.css`, `tests/logic.test.js`, `tests/e2e.mjs`

**Interfaces:**
- Produces
  - `pickHintRemovals(item, rng = Math.random) -> number[]`: 정답이 아닌 **화면** 인덱스 3개 중 2개를 골라 오름차순으로 돌려준다.
  - 상태 변경: `state.hintUsed`(현재 문항에서 힌트를 썼는지)

- [ ] **Step 1: 실패하는 단위 테스트**
  - `hint removes two wrong choices`
    - `order:[3,2,0,1]`, `answer:2`(화면 정답 인덱스 1)인 문항으로 rng를 바꿔 가며 100번 실행한다.
    - 결과는 항상 길이 2이고, 1을 포함하지 않으며, 서로 다르다.
- [ ] **Step 2: 실행** → FAIL
- [ ] **Step 3: `pickHintRemovals` 구현**
- [ ] **Step 4: 실패하는 e2e**
  - `hint mode`
    - 힌트 모드에서 `#hint-btn`이 보인다.
    - 힌트를 누르면 `.choice.is-removed`가 2개 있고 모두 `disabled`다. 정답 칸은 지워지지 않는다. `#hint-btn`은 `disabled`가 된다.
    - 이어서 정답을 고르면 `#score-now`가 `0.5`다.
    - 다음 문항에서 힌트 없이 정답을 고르면 `#score-now`가 `1.5`다.
  - `hint disabled after answer`: 답을 먼저 고르면 `#hint-btn`이 `disabled`가 된다.
  - `hint result format`: 힌트 모드 결과가 `7.5 / 10` 형식으로 표시된다(정답 7개 중 1개에 힌트 사용, 1개는 힌트 없이 정답, 나머지 2개는 오답 같은 조합).
- [ ] **Step 5: 구현**
  - 결과 기록의 `usedHint`는 `state.hintUsed`에서 가져온다.
  - 점수는 `scoreFor`로 계산한다.
  - `#score-now`와 `#result-score`는 `formatScore`로 표시한다.
- [ ] **Step 6: 실행** → PASS
- [ ] **Step 7: 커밋** — `git commit -m "feat: hint mode"`

### Task 6: 연습 모드 틀린 문제 다시 풀기

**Files:**
- Modify: `script.js`, `index.html`, `tests/logic.test.js`, `tests/e2e.mjs`

**Interfaces:**
- Produces
  - `getWrongItems(results, rng = Math.random) -> RoundItem[]`
    - `correct === false`인 기록의 `item.q`로 새 `RoundItem`을 만든다. 문항 순서와 `order`를 새로 섞는다.
  - `startRetry()`
    - `state.isRetry = true`로 바꾸고, 원래 점수를 `state.baseScore`, 원래 결과를 `state.baseResults`에 보관한 뒤 다시 풀기를 시작한다.
  - `showResult()` 분기
    - `state.isRetry`이면 `#result-score`에는 원래 점수를 그대로 보여 준다.
    - `#retry-summary`에는 `다시 풀기 N문제 중 M문제 정답`을 보여 준다.
    - `#retry-btn`은 숨긴다.

- [ ] **Step 1: 실패하는 단위 테스트**
  - `getWrongItems`: 결과 10개 중 오답 3개를 넣으면 길이 3이고, 각 `q`가 오답 문항과 같다. `order`를 정렬하면 `[0,1,2,3]`이다.
- [ ] **Step 2: 실행** → FAIL
- [ ] **Step 3: `getWrongItems` 구현**
- [ ] **Step 4: 실패하는 e2e**
  - `retry wrong only`
    - 연습 모드에서 정답 7개, 오답 3개로 끝내면 `#retry-btn`이 보인다.
    - 누르면 `#progress`가 `1 / 3`이고, 3문항이 모두 앞에서 틀린 문제다(문제 텍스트로 비교).
    - 다시 풀기에서 2개를 맞히면 `#result-score`가 `7 / 10`이고 `#retry-summary`가 `다시 풀기 3문제 중 2문제 정답`이다. `#retry-btn`은 숨겨진다.
  - `no retry when perfect`: 10개를 모두 맞히면 `#retry-btn`이 숨겨진다.
  - `retry only in practice`: 스피드·힌트 모드 결과에서는 `#retry-btn`이 숨겨진다.
- [ ] **Step 5: 구현**
- [ ] **Step 6: 실행** → PASS
- [ ] **Step 7: 커밋** — `git commit -m "feat: practice retry of wrong questions"`

> **2단계 체크포인트:** 사용자가 세 모드를 직접 한 판씩 풀어 본다. 3단계로 넘어가기 전에 사용자 확인을 받는다.

---

## 3단계: 점수 저장과 순위표

### Task 7: 순위표 로직

**Files:**
- Modify: `script.js`, `tests/logic.test.js`

**Interfaces:**
- Produces
  - 상수: `LB_STORAGE_KEY = "quizLeaderboard"`, `LB_LIMIT = 5`, `NAME_MAX = 10`
  - `lbKey(mode, category) -> string`: `"speed|한국사"`처럼 만든다.
  - `sanitizeName(raw) -> string`: `trim` 후 앞 10자를 남기고, 비어 있으면 `"익명"`을 돌려준다.
  - `insertRecord(list, record, limit = 5) -> { list: Record[], inserted: boolean }`
    - 원본 list를 바꾸지 않는다.
    - 점수 내림차순, 동점이면 `ts` 오름차순으로 정렬한 뒤 limit개로 자른다.
    - 새 기록이 잘려 나가면 `inserted: false`다.
    - `Record = { name, score, date: "YYYY-MM-DD", ts }`
  - `loadBoard(storage) -> { board: object, ok: boolean }`
    - 키가 없으면 `{ board: {}, ok: true }`를 돌려준다.
    - JSON 파싱에 실패하거나, 객체가 아니거나, `getItem`이 예외를 던지면 `{ board: {}, ok: false }`를 돌려준다.
  - `saveBoard(storage, board) -> boolean`: `setItem` 예외는 잡아서 false를 돌려준다.
  - `todayString(date = new Date()) -> "YYYY-MM-DD"`: 로컬 시간 기준

- [ ] **Step 1: 실패하는 단위 테스트**
  - `sanitizeName`
    - `"  철수  "`는 `"철수"`
    - `"   "`는 `"익명"`
    - `"가나다라마바사아자차카"`(11자)는 `"가나다라마바사아자차"`
    - `"<b>x</b>"`는 그대로 `"<b>x</b>"`(이스케이프는 화면 단계에서 `textContent`가 담당)
  - `insertRecord order and ties`
    - 점수 [9, 7, 7(ts 2), 5]에 7점(ts 3)을 넣으면 순서가 9, 7(ts2), 7(ts3), 5다.
    - 5개가 꽉 찬 상태(최저 6점)에 6점을 새로 넣으면 `inserted: false`이고 list는 그대로다.
    - 4개만 있을 때 0점을 넣으면 `inserted: true`다.
  - `loadBoard survives bad json`: `getItem`이 `"{oops"`를 돌려주면 `{ board: {}, ok: false }`다.
  - `loadBoard survives throwing storage`: `getItem`이 throw하면 `ok: false`다.
  - `saveBoard reports failure`: `setItem`이 throw하면 false를 돌려준다.
  - `todayString`: `new Date(2026, 9, 2)`이면 `"2026-10-02"`다.
- [ ] **Step 2: 실행** → FAIL
- [ ] **Step 3: 구현**
- [ ] **Step 4: 실행** → PASS
- [ ] **Step 5: 커밋** — `git commit -m "feat: leaderboard storage logic"`

### Task 8: 결과 화면 저장과 순위표 화면

**Files:**
- Modify: `script.js`, `index.html`, `style.css`, `tests/e2e.mjs`

**Interfaces:**
- Consumes: Task 7의 함수 전부, `window.localStorage`
- Produces
  - `saveCurrentScore()`
    - 한 판에 한 번만 실행된다(`state.saved` 플래그).
    - 실행 결과에 따라 `#save-msg`에 `저장했습니다`, `순위권 밖입니다`, `순위표를 저장할 수 없습니다` 중 하나를 보여 준다.
  - `renderLeaderboard(mode, category)`: `#lb-list`에 `li`를 `순위. 이름 — 점수 (날짜)` 형식으로 넣는다. 모든 문자열은 `textContent`로 넣고, 기록이 없으면 `기록 없음`을 표시한다.

- [ ] **Step 1: 실패하는 e2e** (각 시나리오 전에 `localStorage.clear()`를 실행한다)
  - `save and persist`
    - 스피드 모드에서 정답 8개로 결과를 낸 뒤 이름 `철수`로 저장한다.
    - `#save-msg`가 `저장했습니다`이고 `#save-btn`이 `disabled`다.
    - 새로고침한 뒤 순위표에서 `스피드` / `한국사`를 고르면 첫 줄에 `철수`와 `8`이 있다.
  - `save only once`: `#save-btn`을 연속으로 두 번 클릭하고 `#name-input`에서 Enter를 눌러도 `quizLeaderboard["speed|한국사"].length === 1`이다.
  - `practice has no save`: 연습 모드 결과에서는 `#save-area`가 숨겨진다.
  - `name rendered as text`: 이름 `<b>x</b>`로 저장하면 순위표의 `li` 텍스트에 `<b>x</b>` 글자가 그대로 보이고, `li b` 요소는 0개다.
  - `empty name is 익명`: 공백만 입력해도 `익명`으로 저장된다.
  - `out of rank`: 미리 10점 기록 5개를 심어 둔 뒤 9점으로 저장하면 `#save-msg`가 `순위권 밖입니다`이고 기록 수는 5개다.
  - `corrupt storage`: `quizLeaderboard`에 `"{oops"`를 심어 둔다. 순위표 화면에서 오류 없이 `기록 없음`과 `순위표를 저장할 수 없습니다` 안내가 보이고, 퀴즈는 정상으로 시작된다.
  - `separate boards`: 힌트 모드와 한국사 조합으로 저장한 기록이 `스피드` / `한국사` 순위표에는 보이지 않는다.
- [ ] **Step 2: 실행** → FAIL
- [ ] **Step 3: 구현**
  - `#save-area`는 모드가 `speed` 또는 `hint`일 때만 보여 준다.
  - `#name-input`에서 Enter를 누르면 `saveCurrentScore`를 호출한다.
  - 모드 선택 화면의 `#open-lb-btn`과 결과 화면에서 순위표 화면으로 이동할 수 있다. 결과 화면에서 이동하면 현재 모드와 카테고리를 미리 선택해 둔다.
  - 순위표 화면의 모드 선택지는 `스피드` / `힌트` 2개만 둔다.
- [ ] **Step 4: 실행** — `node --test tests/ && node tests/e2e.mjs` → 모두 PASS
- [ ] **Step 5: 커밋** — `git commit -m "feat: leaderboard save and view"`

### Task 9: 최종 검증과 사용자 검수 준비

**Files:**
- Modify: 없음(문제가 발견되면 해당 파일)

- [ ] **Step 1: 전체 실행** — `node --test tests/ && node tests/e2e.mjs` → 모두 PASS, 콘솔 오류 0건
- [ ] **Step 2: 앱 파일 개수 확인**
  - 확인 명령: `git ls-files | grep -v '^tests/' | grep -v '^\.gitignore$' | grep -v '\.md$'`
  - 결과가 정확히 `index.html`, `questions.js`, `script.js`, `style.css` 4개여야 한다.
- [ ] **Step 3: `file://` 수동 확인**
  - Windows에서 `index.html`을 더블클릭해 연다.
  - Chrome과 Edge에서 각각 세 모드를 한 판씩 풀어 보고, 순위표가 새로고침 후에도 남는지 확인한다.
- [ ] **Step 4: 문항 검수 자료 준비**
  - 검수 체크리스트를 대화창으로 사용자에게 전달한다. 항목은 다음과 같다.
    - `superlativeIds` 목록
    - 40문항의 문제, 정답, 출처 표
  - 사용자가 정답이 하나뿐인지, 출처가 정확한지, 기준·시점 표기가 있는지 확인한다.
- [ ] **Step 5: 커밋** — `git commit -m "chore: final verification"`
