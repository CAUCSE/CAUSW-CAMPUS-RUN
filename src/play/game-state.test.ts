import { describe, expect, test } from 'vitest'

import { calculateTypingSpeed, countTypingStrokes, createGameState, isCourseComplete, setCurrentInput, submitCurrentInput } from './game-state'

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

  test('starts at zero and measures the first correct syllable by its strokes', () => {
    const empty = createGameState(['본관'])
    const oneCorrectCharacter = setCurrentInput(empty, '본')

    expect(calculateTypingSpeed(empty, 0)).toBe(0)
    expect(calculateTypingSpeed(oneCorrectCharacter, 0)).toBe(60)
    expect(calculateTypingSpeed(oneCorrectCharacter, 120_000)).toBe(2)
  })

  test('caps typing speed at 700', () => {
    const target = '가'.repeat(40)
    const state = setCurrentInput(createGameState([target]), target)

    expect(calculateTypingSpeed(state, 3_000)).toBe(700)
  })

  test('counts Korean syllables as two-set keyboard strokes', () => {
    expect(countTypingStrokes('값')).toBe(4)
    expect(countTypingStrokes('과')).toBe(3)
    expect(countTypingStrokes('A 1')).toBe(3)
  })

  test('calculates typing speed from Korean keyboard strokes instead of completed syllables', () => {
    const state = setCurrentInput(createGameState(['값']), '값')

    expect(calculateTypingSpeed(state, 60_000)).toBe(4)
  })
})
