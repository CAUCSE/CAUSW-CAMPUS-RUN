export type GameState = {
  course: string[]
  currentIndex: number
  currentInput: string
  typoCount: number
}

export type Submission = 'success' | 'failure' | 'complete'

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
