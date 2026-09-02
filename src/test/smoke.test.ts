import { expect, test } from 'vitest'

test('the test environment is configured', () => {
  expect(import.meta.env.MODE).toBe('test')
})
