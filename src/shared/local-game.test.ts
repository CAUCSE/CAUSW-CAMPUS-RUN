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

test('starts after the three-second countdown and expires ten minutes later', () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-12T03:00:00.000Z'))

  const session = createLocalGameSession()

  expect(session.startedAt).toBe('2026-09-12T03:00:03.000Z')
  expect(session.expiresAt).toBe('2026-09-12T03:10:03.000Z')
  vi.useRealTimers()
})
