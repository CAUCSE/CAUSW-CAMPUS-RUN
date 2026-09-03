# CAU Campus Typing Game Interaction Implementation Plan

**Goal:** Implement the approved countdown, Enter-submission typing interaction, visual typo feedback, and Web Audio effects without changing the game API contract.

**Spec:** `docs/superpowers/specs/2026-09-03-cau-campus-typing-interaction-design.md`

## Task 1: Replace character-by-character progression with submitted-attempt state

**Files:** `src/play/game-state.ts`, `src/play/game-state.test.ts`

1. Write tests for draft text updates, exact Enter submission advancing one place, mismatch submissions clearing the draft and incrementing typo count once, and final-place completion.
2. Replace per-character validation exports with pure draft/submit operations.
3. Run `npm test -- --run src/play/game-state.test.ts`.

## Task 2: Add countdown and Web Audio boundaries

**Files:** `src/play/useCountdown.ts`, `src/play/useCountdown.test.ts`, `src/play/sound.ts`, `src/play/sound.test.ts`

1. Test a 3-second countdown that enables play exactly once and cleans up timers on unmount.
2. Test mute persistence and that muted sound calls do not construct or play Web Audio nodes.
3. Implement `useCountdown` and a no-throw Web Audio sound service with keypress, success, failure, and countdown effects.
4. Run focused tests for both modules.

## Task 3: Build the submitted-attempt input UI and integrate the play page

**Files:** `src/play/TypingInput.tsx`, `src/play/TypingInput.module.css`, `src/play/TypingInput.test.tsx`, `src/play/PlayPage.tsx`, `src/play/PlayPage.module.css`, `src/play/PlayPage.test.tsx`

1. Test that native input preserves IME composition and draft text, blocks paste, renders mismatched positions as red in an aria-hidden display layer, and submits only on Enter.
2. Add the countdown overlay and keep timer/input inactive until it finishes.
3. Integrate the sound toggle and persist its mute state.
4. Preserve active game state after each draft/submit change; only call completion API after the final exact submission.
5. Run `npm test -- --run src/play`.

## Task 4: Update browser coverage and perform final verification

**Files:** `e2e/typing-game.spec.ts`, `README.md` if the play instructions need revision.

1. Update the browser flow for countdown, Enter-based failure/reset, exact success, and mute persistence.
2. Run `npm test -- --run`, `npm run test:e2e`, `npm run build`, and `git diff --check`.
3. Manually check Korean IME and sound behavior in a browser before handoff.
