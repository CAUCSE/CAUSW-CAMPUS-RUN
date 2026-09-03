import { describe, expect, test } from 'vitest'

import { createGameState, isCourseComplete, setCurrentInput, submitCurrentInput } from './game-state'

describe('submitted-attempt game state', () => {
  test('keeps a draft unchanged until it is submitted', () => {
    const state = setCurrentInput(createGameState(['본관']), '본브')
    expect(state.currentInput).toBe('본브')
    expect(state.typoCount).toBe(0)
  })

  test('advances exactly one place after an exact submission', () => {
    const result = submitCurrentInput(setCurrentInput(createGameState(['본관', '중앙도서관']), '본관'))
    expect(result.submission).toBe('success')
    expect(result.state).toMatchObject({ currentIndex: 1, currentInput: '', typoCount: 0 })
  })

  test('clears an incorrect submission and counts one typo', () => {
    const result = submitCurrentInput(setCurrentInput(createGameState(['본관']), '본브'))
    expect(result.submission).toBe('failure')
    expect(result.state).toMatchObject({ currentIndex: 0, currentInput: '', typoCount: 1 })
  })

  test('completes only after the final exact submission', () => {
    const result = submitCurrentInput(setCurrentInput(createGameState(['A']), 'A'))
    expect(result.submission).toBe('complete')
    expect(isCourseComplete(result.state)).toBe(true)
  })
})
