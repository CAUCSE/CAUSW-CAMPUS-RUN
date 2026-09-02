import { describe, expect, test } from 'vitest'

import { applyCharacter, createGameState, deleteCharacter, isCourseComplete } from './game-state'

describe('character validation game state', () => {
  test('accepts correct characters and advances to the next course item', () => {
    let state = createGameState(['본관', '중앙도서관'])

    state = applyCharacter(state, '본')
    expect(state.currentInput).toBe('본')
    state = applyCharacter(state, '관')

    expect(state.currentIndex).toBe(1)
    expect(state.currentInput).toBe('')
  })

  test('counts a wrong character without accepting it', () => {
    const initial = createGameState(['본관'])
    const state = applyCharacter(applyCharacter(initial, '본'), '브')

    expect(state.currentInput).toBe('본')
    expect(state.typoCount).toBe(1)
    expect(state.lastMistypedCharacter).toBe('브')
    expect(initial).toEqual(createGameState(['본관']))
  })

  test('deletes the last accepted character and clears the error indicator', () => {
    let state = createGameState(['본관'])
    state = applyCharacter(applyCharacter(state, '본'), '브')
    state = deleteCharacter(state)

    expect(state.currentInput).toBe('')
    expect(state.lastMistypedCharacter).toBeNull()
    expect(state.typoCount).toBe(1)
  })

  test('clears an error indicator when the replacement character is correct', () => {
    let state = createGameState(['본관'])
    state = applyCharacter(state, '브')
    state = applyCharacter(state, '본')

    expect(state.currentInput).toBe('본')
    expect(state.lastMistypedCharacter).toBeNull()
  })

  test('ignores multi-character paste input', () => {
    const initial = createGameState(['본관'])

    expect(applyCharacter(initial, '본관')).toEqual(initial)
    expect(applyCharacter(initial, '')).toEqual(initial)
  })

  test('reports completion only after the final course item', () => {
    let state = createGameState(['A'])
    expect(isCourseComplete(state)).toBe(false)

    state = applyCharacter(state, 'A')

    expect(state.currentIndex).toBe(1)
    expect(isCourseComplete(state)).toBe(true)
  })
})
