import { describe, expect, test } from 'vitest'

import { formatDuration } from './format'

describe('formatDuration', () => {
  test('formats milliseconds as minutes, seconds, and centiseconds', () => {
    expect(formatDuration(18_420)).toBe('00:18.42')
    expect(formatDuration(0)).toBe('00:00.00')
  })
})
