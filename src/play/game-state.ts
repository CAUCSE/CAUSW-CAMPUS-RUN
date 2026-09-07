export type GameState = {
  course: string[]
  currentIndex: number
  currentInput: string
  typoCount: number
}

export type Submission = 'success' | 'failure' | 'complete'
export const MAX_TYPING_SPEED = 700

const MIN_ACTIVE_TYPING_SPEED = 20
const INITIAL_MEASUREMENT_MILLISECONDS = 3_000

export function createGameState(course: string[]): GameState {
  return {
    course: [...course],
    currentIndex: 0,
    currentInput: '',
    typoCount: 0,
  }
}

export function setCurrentInput(state: GameState, currentInput: string): GameState {
  return isCourseComplete(state) ? state : { ...state, currentInput }
}

export function submitCurrentInput(state: GameState): { state: GameState; submission: Submission } {
  if (isCourseComplete(state)) return { state, submission: 'complete' }
  if (state.currentInput !== state.course[state.currentIndex]) {
    return { state: { ...state, currentInput: '', typoCount: state.typoCount + 1 }, submission: 'failure' }
  }

  const nextState = { ...state, currentIndex: state.currentIndex + 1, currentInput: '' }
  return { state: nextState, submission: isCourseComplete(nextState) ? 'complete' : 'success' }
}

export function isCourseComplete(state: GameState): boolean {
  return state.currentIndex >= state.course.length
}

export function countCorrectCharacters(state: GameState): number {
  const completedCharacterCount = state.course
    .slice(0, state.currentIndex)
    .reduce((total, place) => total + [...place].length, 0)
  const targetCharacters = [...(state.course[state.currentIndex] ?? '')]
  const correctCurrentCharacterCount = [...state.currentInput]
    .reduce((total, character, index) => total + Number(character === targetCharacters[index]), 0)
  return completedCharacterCount + correctCurrentCharacterCount
}

export function calculateTypingSpeed(state: GameState, elapsedMilliseconds: number, baselineCharacterCount = 0): number {
  const correctCharacterCount = Math.max(0, countCorrectCharacters(state) - baselineCharacterCount)
  if (correctCharacterCount === 0) return 0

  const measurementMilliseconds = Math.max(elapsedMilliseconds, INITIAL_MEASUREMENT_MILLISECONDS)
  const calculatedSpeed = Math.round(correctCharacterCount * 60_000 / measurementMilliseconds)
  return Math.min(MAX_TYPING_SPEED, Math.max(MIN_ACTIVE_TYPING_SPEED, calculatedSpeed))
}
