# Task 4 report: pure character-validation game state

Implemented `src/play/game-state.ts` with immutable helpers:

- `createGameState` clones the course and initializes progress/error state.
- `applyCharacter` accepts exactly one character, rejects paste/multi-character input, records typos without changing accepted input, and advances automatically after each completed course item.
- `deleteCharacter` removes the last accepted character and clears the mistyped-character indicator.
- `isCourseComplete` detects completion after the final course item.

Added focused tests covering correct input and advancement, typo handling, deletion after an error, paste rejection, and final completion.

Verification:

- `npm test -- --run src/play/game-state.test.ts` — 5 tests passed.
- `npm run build` — passed.
