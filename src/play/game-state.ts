export type GameState = {
  course: string[]
  currentIndex: number
  currentInput: string
  typoCount: number
  lastMistypedCharacter: string | null
}

export function createGameState(course: string[]): GameState {
  return {
    course: [...course],
    currentIndex: 0,
    currentInput: '',
    typoCount: 0,
    lastMistypedCharacter: null,
  }
}

export function applyCharacter(state: GameState, character: string): GameState {
  // Keyboard input is handled one character at a time. This also rejects paste.
  if (character.length !== 1 || isCourseComplete(state)) return state

  const target = state.course[state.currentIndex]
  const expectedCharacter = target?.[state.currentInput.length]

  if (character !== expectedCharacter) {
    return {
      ...state,
      typoCount: state.typoCount + 1,
      lastMistypedCharacter: character,
    }
  }

  const nextInput = state.currentInput + character
  if (nextInput.length === target.length) {
    return {
      ...state,
      currentIndex: state.currentIndex + 1,
      currentInput: '',
      lastMistypedCharacter: null,
    }
  }

  return {
    ...state,
    currentInput: nextInput,
    lastMistypedCharacter: null,
  }
}

export function deleteCharacter(state: GameState): GameState {
  return {
    ...state,
    currentInput: state.currentInput.slice(0, -1),
    lastMistypedCharacter: null,
  }
}

export function isCourseComplete(state: GameState): boolean {
  return state.currentIndex >= state.course.length
}
