# CAU Campus Typing Game Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a React-based multi-page web game for a Central University campus typing booth that validates a student number, records a 12-place completion run through CAUSW backend APIs, and displays a daily leaderboard.

**Architecture:** Vite builds three independent HTML entry points: the lobby, play, and result pages. Each entry mounts its own React root; navigation uses normal browser URLs rather than client-side routing. Shared TypeScript modules own API calls, session persistence, domain types, and time formatting; the play page owns deterministic character validation and elapsed-time measurement.

**Tech Stack:** React, TypeScript, Vite multi-page build, CSS Modules, Vitest, React Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-02-cau-campus-typing-design.md`

## Global Constraints

- Build a multi-page application: `/`, `/play.html`, and `/result.html` must be normal document navigations; do not add React Router.
- Use React only inside each individual page.
- Require a valid academic number and a public nickname before starting a session.
- Display only nicknames in all public game and leaderboard views; never render or return academic numbers from public leaderboard data.
- Use the backend-issued 12-place course and store only the active `sessionId`, nickname, course, start timestamp, and local typo count in `sessionStorage`.
- Require character-level typo correction before advancing and rank by elapsed time, then typo count.
- Keep the play screen usable on a 16:9 public PC and retain input focus while playing.
- Use the API paths in the approved spec: `POST /typing-game/sessions`, `POST /typing-game/sessions/{sessionId}/complete`, and `GET /typing-game/leaderboard`.
- Use Node.js 22.12 or later for the current Vite/Vitest toolchain.

---

## File Structure

| Path | Responsibility |
| --- | --- |
| `index.html`, `play.html`, `result.html` | Three Vite HTML entries corresponding to browser URLs. |
| `vite.config.ts` | Multi-page Rollup inputs and test configuration. |
| `src/shared/types.ts` | API payloads, leaderboard records, and stored game-session types. |
| `src/shared/api.ts` | Typed `fetch` client and API-error normalization. |
| `src/shared/game-session.ts` | Read, write, clear, and validate ephemeral `sessionStorage` game state. |
| `src/shared/format.ts` | Safe duration formatting and public nickname normalization. |
| `src/lobby/LobbyPage.tsx` | Academic number/nickname form, leaderboard, and session creation. |
| `src/play/game-state.ts` | Pure character-validation reducer and game-state helpers. |
| `src/play/PlayPage.tsx` | Timer, input focus, course progression, and completion submission. |
| `src/result/ResultPage.tsx` | Saved result, rank, refreshed leaderboard, retry navigation. |
| `src/styles/*.module.css` | Page-scoped responsive styling. |
| `src/**/*.test.ts(x)` | Unit and component tests colocated with their subject. |
| `e2e/typing-game.spec.ts` | Browser-level lobby-to-result happy path and failure flows. |

## Task 1: Scaffold the Vite React MPA and test harness

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `play.html`
- Create: `result.html`
- Create: `src/lobby/main.tsx`
- Create: `src/play/main.tsx`
- Create: `src/result/main.tsx`
- Create: `src/test/setup.ts`
- Create: `src/test/smoke.test.ts`
- Create: `.gitignore`

**Interfaces:**
- Produces Vite build entries named `lobby`, `play`, and `result` and scripts `dev`, `build`, `test`, `test:watch`, and `test:e2e`.
- Produces page mount elements `#lobby-root`, `#play-root`, and `#result-root`.

- [ ] **Step 1: Create a failing build smoke test**

```ts
import { expect, test } from 'vitest'

test('the test environment is configured', () => {
  expect(import.meta.env.MODE).toBe('test')
})
```

- [ ] **Step 2: Run the test to verify the project is not configured**

Run: `npm test -- --run src/test/smoke.test.ts`

Expected: FAIL because `package.json` and the Vitest configuration do not exist.

- [ ] **Step 3: Add dependencies and scripts**

Create `package.json` with React runtime dependencies and development dependencies for `@vitejs/plugin-react`, TypeScript, Vite, Vitest, jsdom, React Testing Library, `@testing-library/jest-dom`, and Playwright. Add scripts:

```json
{
  "dev": "vite",
  "build": "tsc -b && vite build",
  "test": "vitest",
  "test:watch": "vitest --watch",
  "test:e2e": "playwright test"
}
```

Configure `vite.config.ts` with `root: '.'`, the React plugin, and these explicit inputs:

```ts
build: {
  rollupOptions: {
    input: {
      lobby: resolve(__dirname, 'index.html'),
      play: resolve(__dirname, 'play.html'),
      result: resolve(__dirname, 'result.html'),
    },
  },
}
```

Configure Vitest to use `jsdom`, load `src/test/setup.ts`, and clear mocks between tests. In setup, import `@testing-library/jest-dom/vitest`.

- [ ] **Step 4: Add minimal independent HTML entries**

Each HTML file must include its own root and TypeScript module. For example, `play.html` contains:

```html
<div id="play-root"></div>
<script type="module" src="/src/play/main.tsx"></script>
```

Create temporary main files that mount a distinct heading to their matching root. Add `.gitignore` entries for `node_modules/`, `dist/`, `playwright-report/`, `test-results/`, and `.superpowers/`.

- [ ] **Step 5: Run tests and production build**

Run: `npm test -- --run src/test/smoke.test.ts && npm run build`

Expected: PASS; `dist/index.html`, `dist/play.html`, and `dist/result.html` exist.

- [ ] **Step 6: Commit the scaffold**

```bash
git add .gitignore package.json tsconfig.json vite.config.ts index.html play.html result.html src
git commit -m "chore: scaffold React multi-page typing game"
```

## Task 2: Add shared domain types, API client, and stored-session boundary

**Files:**
- Create: `src/shared/types.ts`
- Create: `src/shared/api.ts`
- Create: `src/shared/game-session.ts`
- Create: `src/shared/format.ts`
- Test: `src/shared/api.test.ts`
- Test: `src/shared/game-session.test.ts`
- Test: `src/shared/format.test.ts`

**Interfaces:**
- Consumes: `VITE_TYPING_GAME_API_BASE_URL`, Vitest browser environment.
- Produces: `createGameSession(input)`, `completeGameSession(sessionId, input)`, `getLeaderboard()`, `saveActiveGame(game)`, `readActiveGame()`, `clearActiveGame()`, and `formatDuration(milliseconds)`.

- [ ] **Step 1: Write failing formatter and storage tests**

```ts
expect(formatDuration(18_420)).toBe('00:18.42')
expect(formatDuration(0)).toBe('00:00.00')

saveActiveGame(game)
expect(readActiveGame()).toEqual(game)
sessionStorage.setItem('cau-typing-active-game', '{bad json')
expect(readActiveGame()).toBeNull()
```

- [ ] **Step 2: Run the shared-module tests to verify they fail**

Run: `npm test -- --run src/shared/format.test.ts src/shared/game-session.test.ts`

Expected: FAIL because the functions do not exist.

- [ ] **Step 3: Define exact API and session types**

Add these exported types to `src/shared/types.ts`:

```ts
export type CreateSessionRequest = { studentNumber: string; nickname: string }
export type CreateSessionResponse = { sessionId: string; course: string[] }
export type CompleteSessionRequest = { elapsedMilliseconds: number; typoCount: number }
export type LeaderboardEntry = {
  rank: number; nickname: string; elapsedMilliseconds: number; typoCount: number
}
export type CompletionResponse = { entry: LeaderboardEntry; leaderboard: LeaderboardEntry[] }
export type ActiveGame = {
  sessionId: string; nickname: string; course: string[]; startedAtEpochMs: number; typoCount: number
}
```

Store `ActiveGame` under `cau-typing-active-game`. Reject corrupted JSON, an empty course, or an empty session ID by returning `null` and removing the key. Format non-negative duration values as `MM:SS.CC`.

- [ ] **Step 4: Write failing API-client tests**

Mock `fetch` and assert the exact endpoint, method, headers, and JSON body:

```ts
await createGameSession({ studentNumber: '20240001', nickname: '청룡' })
expect(fetch).toHaveBeenCalledWith(
  'https://api.example.test/typing-game/sessions',
  expect.objectContaining({ method: 'POST' }),
)
```

Also test that a non-2xx JSON response `{ "message": "학번을 확인할 수 없습니다." }` becomes `ApiError` with that message, and that a network rejection becomes `ApiError('네트워크 연결을 확인한 뒤 다시 시도해 주세요.')`.

- [ ] **Step 5: Implement the typed API client**

Read `VITE_TYPING_GAME_API_BASE_URL`, remove its trailing slash, and call `fetch` with `Content-Type: application/json`. Implement:

```ts
createGameSession(input: CreateSessionRequest): Promise<CreateSessionResponse>
completeGameSession(sessionId: string, input: CompleteSessionRequest): Promise<CompletionResponse>
getLeaderboard(): Promise<LeaderboardEntry[]>
```

Throw `ApiError` for malformed responses, non-2xx responses, and network failures. Do not persist the student number in `sessionStorage`.

- [ ] **Step 6: Run shared-module tests**

Run: `npm test -- --run src/shared`

Expected: PASS.

- [ ] **Step 7: Commit the shared boundary**

```bash
git add src/shared
git commit -m "feat: add typing game API and session helpers"
```

## Task 3: Implement the lobby page and session creation

**Files:**
- Create: `src/lobby/LobbyPage.tsx`
- Create: `src/lobby/LobbyPage.module.css`
- Modify: `src/lobby/main.tsx`
- Test: `src/lobby/LobbyPage.test.tsx`

**Interfaces:**
- Consumes: `createGameSession`, `getLeaderboard`, `saveActiveGame`, `formatDuration`.
- Produces: a normal navigation to `/play.html` after a successfully stored `ActiveGame`.

- [ ] **Step 1: Write failing lobby tests**

Test all of the following with mocked shared API functions:

```ts
expect(screen.getByRole('button', { name: '게임 시작' })).toBeDisabled()
await user.type(screen.getByLabelText('학번'), '20240001')
await user.type(screen.getByLabelText('별명'), '청룡')
expect(screen.getByRole('button', { name: '게임 시작' })).toBeEnabled()
```

On submit, assert the session request is made, `saveActiveGame` receives a start timestamp and the returned course, and navigation targets `/play.html`. Test API failure text and a leaderboard request failure message without preventing the form from loading.

- [ ] **Step 2: Run the lobby test to verify it fails**

Run: `npm test -- --run src/lobby/LobbyPage.test.tsx`

Expected: FAIL because `LobbyPage` does not exist.

- [ ] **Step 3: Implement lobby form and leaderboard**

Render labeled academic-number and nickname inputs, a submit button, game explanation, and Top 10 table. Trim input; require a non-empty academic number and 1–12 character nickname. On submit, disable controls, call `createGameSession`, save `{ sessionId, nickname, course, startedAtEpochMs: Date.now(), typoCount: 0 }`, then call `window.location.assign('/play.html')`.

Load the leaderboard on mount. Render only `rank`, `nickname`, formatted elapsed time, and `typoCount`. If leaderboard loading fails, render `리더보드를 불러오지 못했습니다.` and keep game start usable.

- [ ] **Step 4: Add 16:9 lobby styling**

Use `LobbyPage.module.css` for a centered maximum-width layout, keyboard-friendly inputs, a high-contrast start button, and a readable Top 10 table. Do not include the academic number in any visible markup after form entry.

- [ ] **Step 5: Run page tests and build**

Run: `npm test -- --run src/lobby/LobbyPage.test.tsx && npm run build`

Expected: PASS.

- [ ] **Step 6: Commit the lobby page**

```bash
git add src/lobby
git commit -m "feat: add lobby session creation and leaderboard"
```

## Task 4: Implement pure character-validation game state

**Files:**
- Create: `src/play/game-state.ts`
- Test: `src/play/game-state.test.ts`

**Interfaces:**
- Consumes: `course: string[]` and user input events.
- Produces: `createGameState(course)`, `applyCharacter(state, character)`, `deleteCharacter(state)`, and `isCourseComplete(state)`.

- [ ] **Step 1: Write failing reducer tests**

```ts
let state = createGameState(['본관', '중앙도서관'])
state = applyCharacter(state, '본')
expect(state.currentInput).toBe('본')
state = applyCharacter(state, '브')
expect(state.currentInput).toBe('본')
expect(state.typoCount).toBe(1)
state = applyCharacter(state, '관')
expect(state.currentIndex).toBe(1)
expect(state.currentInput).toBe('')
```

Also cover deletion after an error, automatic advancement, final completion, and ignoring multi-character paste input.

- [ ] **Step 2: Run the reducer test to verify it fails**

Run: `npm test -- --run src/play/game-state.test.ts`

Expected: FAIL because the game-state exports do not exist.

- [ ] **Step 3: Implement immutable validation helpers**

Use this shape:

```ts
export type GameState = {
  course: string[]; currentIndex: number; currentInput: string; typoCount: number; lastMistypedCharacter: string | null
}
```

`applyCharacter` accepts exactly one character. If it differs from `course[currentIndex][currentInput.length]`, increment `typoCount`, set `lastMistypedCharacter`, and leave `currentInput` unchanged. When the final correct character is entered, clear `currentInput` and increment `currentIndex`. `deleteCharacter` removes one accepted character and clears the error indicator.

- [ ] **Step 4: Run the reducer test**

Run: `npm test -- --run src/play/game-state.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit game logic**

```bash
git add src/play/game-state.ts src/play/game-state.test.ts
git commit -m "feat: add character-level typing validation"
```

## Task 5: Build the play page, timer, and completion retry path

**Files:**
- Create: `src/play/PlayPage.tsx`
- Create: `src/play/PlayPage.module.css`
- Modify: `src/play/main.tsx`
- Test: `src/play/PlayPage.test.tsx`

**Interfaces:**
- Consumes: `readActiveGame`, `clearActiveGame`, `completeGameSession`, `GameState`, `formatDuration`.
- Produces: a `sessionStorage` value named `cau-typing-last-result` and a normal navigation to `/result.html` only after successful completion.

- [ ] **Step 1: Write failing play-page tests**

Mock a stored game with a two-place course. Test that a missing stored game calls `window.location.replace('/')`, a wrong key increments displayed typo count without changing accepted text, and correct characters advance the place counter. Use fake timers to assert elapsed time changes. After completion, assert `completeGameSession` receives elapsed milliseconds and typo count.

Test an API failure: the result remains visible with `기록 저장에 실패했습니다. 다시 시도해 주세요.` and a `다시 저장` button that resends the same payload.

- [ ] **Step 2: Run the play-page test to verify it fails**

Run: `npm test -- --run src/play/PlayPage.test.tsx`

Expected: FAIL because `PlayPage` does not exist.

- [ ] **Step 3: Implement play lifecycle and controlled input**

On mount, read `ActiveGame`; when absent, call `window.location.replace('/')`. Set an interval that updates elapsed display every 10 ms from `Date.now() - startedAtEpochMs`. Focus the input on mount and after every accepted or rejected keyboard event.

Handle `keydown`: `Backspace` calls `deleteCharacter`, single printable keys call `applyCharacter`, and all paste events call `preventDefault()`. Render the target name in large text, accepted characters, a red one-character error feedback, ordinal `currentIndex + 1 / course.length`, elapsed time, and typo count.

On final completion, calculate elapsed milliseconds once, call `completeGameSession`, then store this exact value:

```ts
type LastResult = { entry: LeaderboardEntry; leaderboard: LeaderboardEntry[] }
```

under `cau-typing-last-result`, clear the active game, and use `window.location.assign('/result.html')`.

- [ ] **Step 4: Add robust public-PC styling**

Use a large target label, 48px-or-larger input text, a visible focus ring, and a layout that remains within a 1280×720 viewport without scrolling. Set `inputMode="text"`, `autoComplete="off"`, `autoCapitalize="off"`, and `spellCheck={false}`.

- [ ] **Step 5: Run play tests and build**

Run: `npm test -- --run src/play/PlayPage.test.tsx && npm run build`

Expected: PASS.

- [ ] **Step 6: Commit the play page**

```bash
git add src/play
git commit -m "feat: add timed typing gameplay"
```

## Task 6: Implement the result page and public retry flow

**Files:**
- Create: `src/result/ResultPage.tsx`
- Create: `src/result/ResultPage.module.css`
- Modify: `src/result/main.tsx`
- Test: `src/result/ResultPage.test.tsx`

**Interfaces:**
- Consumes: `cau-typing-last-result`, `getLeaderboard`, `formatDuration`.
- Produces: normal navigation to `/` when retrying or when no saved result exists.

- [ ] **Step 1: Write failing result-page tests**

Test rendering a saved entry's nickname, rank, elapsed time, typo count, and leaderboard. Test that no `cau-typing-last-result` invokes `window.location.replace('/')`. Test the `다시 도전` button removes the stored result and calls `window.location.assign('/')`. Test that a refresh failure retains the saved result and shows `최신 리더보드를 불러오지 못했습니다.`.

- [ ] **Step 2: Run the result-page test to verify it fails**

Run: `npm test -- --run src/result/ResultPage.test.tsx`

Expected: FAIL because `ResultPage` does not exist.

- [ ] **Step 3: Implement result loading and leaderboard refresh**

Read and validate `LastResult` from `sessionStorage`. Redirect to `/` if it is absent or malformed. Render the server-returned rank and score first, then show its leaderboard immediately. Request `getLeaderboard()` once to replace that table with current data; preserve the completed entry when the request fails. Never access or render a student number.

- [ ] **Step 4: Style the result page**

Make the achieved rank the primary visual element, followed by elapsed time and typo count. Keep retry and home actions large enough for public-PC touch/mouse use.

- [ ] **Step 5: Run result tests and build**

Run: `npm test -- --run src/result/ResultPage.test.tsx && npm run build`

Expected: PASS.

- [ ] **Step 6: Commit the result page**

```bash
git add src/result
git commit -m "feat: add game result and retry page"
```

## Task 7: Add end-to-end coverage and deployment documentation

**Files:**
- Create: `playwright.config.ts`
- Create: `e2e/typing-game.spec.ts`
- Create: `.env.example`
- Create: `README.md`

**Interfaces:**
- Consumes: production-equivalent Vite server and mocked CAUSW API responses.
- Produces: repeatable browser verification for normal document navigation across all three URLs.

- [ ] **Step 1: Write the failing browser scenario**

Create Playwright route handlers for all three API paths. The scenario must fill the lobby, start the session, assert the browser URL ends in `/play.html`, type the returned two-place test course character by character, assert `/result.html`, and verify the nickname and rank. Add a second scenario that returns HTTP 503 from completion and asserts the retry UI remains on `/play.html`.

- [ ] **Step 2: Run browser tests to verify the missing configuration fails**

Run: `npm run test:e2e -- e2e/typing-game.spec.ts`

Expected: FAIL because Playwright configuration does not exist.

- [ ] **Step 3: Configure Playwright**

Configure Chromium with a `1280 × 720` viewport and a `webServer` command of `npm run dev -- --host 127.0.0.1`, using the Vite URL as `baseURL`. Make all route handlers assert that no leaderboard response contains `studentNumber`.

- [ ] **Step 4: Document local configuration and deployment output**

Create `.env.example`:

```dotenv
VITE_TYPING_GAME_API_BASE_URL=https://api.example.com
```

In `README.md`, document Node.js 22.12+, installation, copying `.env.example` to `.env.local`, `npm run dev`, `npm test -- --run`, `npm run test:e2e`, and `npm run build`. State that deployment must serve `index.html`, `play.html`, and `result.html` as independent files and proxy CORS requests to the CAUSW backend as necessary.

- [ ] **Step 5: Run the complete verification suite**

Run: `npm test -- --run && npm run build && npm run test:e2e`

Expected: all unit, component, build, and browser tests PASS.

- [ ] **Step 6: Commit end-to-end verification and docs**

```bash
git add playwright.config.ts e2e .env.example README.md
git commit -m "test: cover multi-page typing game flow"
```

## Plan Self-Review

- Spec coverage: Tasks 3–6 cover academic-number/alias start, 12-place typing, correction, timing, result handling, and public leaderboard. Task 2 covers API boundaries and privacy. Task 7 covers public-PC flow. Admin record management remains a CAUSW backend deliverable and is intentionally outside this frontend repository.
- Placeholder scan: no deferred implementation markers remain.
- Type consistency: `CreateSessionResponse`, `ActiveGame`, `CompleteSessionRequest`, `CompletionResponse`, and `LeaderboardEntry` are defined in Task 2 and used consistently in later tasks.
