export type GameState = {
  course: string[]
  currentIndex: number
  currentInput: string
  typoCount: number
}

export type Submission = 'success' | 'failure' | 'complete'
export const MAX_TYPING_SPEED = 700

const INITIAL_MEASUREMENT_MILLISECONDS = 3_000
const HANGUL_BASE = 0xAC00
const HANGUL_END = 0xD7A3
const JUNGSEONG_COUNT = 21
const JONGSEONG_COUNT = 28
const DOUBLE_CHOSEONG = new Set([1, 4, 8, 10, 13])
const COMPOUND_JUNGSEONG = new Set([9, 10, 11, 14, 15, 16, 19])
const COMPOUND_JONGSEONG = new Set([2, 3, 5, 6, 9, 10, 11, 12, 13, 14, 15, 18, 20])

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

export function countCorrectTypingStrokes(state: GameState): number {
  const completedStrokeCount = state.course
    .slice(0, state.currentIndex)
    .reduce((total, place) => total + countTypingStrokes(place), 0)
  const targetCharacters = [...(state.course[state.currentIndex] ?? '')]
  const correctCurrentInput = [...state.currentInput]
    .filter((character, index) => character === targetCharacters[index])
    .join('')
  return completedStrokeCount + countTypingStrokes(correctCurrentInput)
}

export function countTypingStrokes(value: string): number {
  return [...value].reduce((total, character) => total + characterStrokeCount(character), 0)
}

export function calculateTypingSpeed(state: GameState, elapsedMilliseconds: number, baselineCharacterCount = 0): number {
  const correctStrokeCount = Math.max(0, countCorrectTypingStrokes(state) - baselineCharacterCount)
  if (correctStrokeCount === 0) return 0

  const measurementMilliseconds = Math.max(elapsedMilliseconds, INITIAL_MEASUREMENT_MILLISECONDS)
  const calculatedSpeed = Math.round(correctStrokeCount * 60_000 / measurementMilliseconds)
  return Math.min(MAX_TYPING_SPEED, calculatedSpeed)
}

function characterStrokeCount(character: string): number {
  const codePoint = character.codePointAt(0)
  if (codePoint === undefined || codePoint < HANGUL_BASE || codePoint > HANGUL_END) return 1

  const syllableIndex = codePoint - HANGUL_BASE
  const choseongIndex = Math.floor(syllableIndex / (JUNGSEONG_COUNT * JONGSEONG_COUNT))
  const jungseongIndex = Math.floor(syllableIndex % (JUNGSEONG_COUNT * JONGSEONG_COUNT) / JONGSEONG_COUNT)
  const jongseongIndex = syllableIndex % JONGSEONG_COUNT
  return 2
    + Number(DOUBLE_CHOSEONG.has(choseongIndex))
    + Number(COMPOUND_JUNGSEONG.has(jungseongIndex))
    + Number(jongseongIndex > 0)
    + Number(COMPOUND_JONGSEONG.has(jongseongIndex))
}
