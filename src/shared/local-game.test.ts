import { afterEach, expect, test, vi } from 'vitest'
import { CAMPUS_COURSE } from './course'
import { createLocalGameSession } from './local-game'

afterEach(() => {
  vi.restoreAllMocks()
})

test('returns the fixed course ending at 100주년기념관', () => {
  vi.spyOn(Math, 'random').mockReturnValue(0)

  const course = createLocalGameSession().course

  expect(course).toEqual(CAMPUS_COURSE)
  expect(course.at(-1)).toBe('100주년기념관')
})
