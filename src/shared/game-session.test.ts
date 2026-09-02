import { afterEach, describe, expect, test } from 'vitest'

import { clearActiveGame, readActiveGame, saveActiveGame } from './game-session'
import type { ActiveGame } from './types'

const game: ActiveGame = {
  sessionId: 'session-1',
  nickname: '청룡',
  course: ['본관'],
  startedAtEpochMs: 1_000,
  expiresAtEpochMs: 2_000,
  typoCount: 0,
}

afterEach(() => {
  sessionStorage.clear()
})

describe('active game storage', () => {
  test('round-trips an active game', () => {
    saveActiveGame(game)

    expect(readActiveGame()).toEqual(game)
  })

  test('round-trips resumable progress', () => {
    const inProgress = { ...game, currentIndex: 0, currentInput: '본', typoCount: 2 }
    saveActiveGame(inProgress)

    expect(readActiveGame()).toEqual(inProgress)
  })

  test('removes corrupted data', () => {
    sessionStorage.setItem('cau-typing-active-game', '{bad json')

    expect(readActiveGame()).toBeNull()
    expect(sessionStorage.getItem('cau-typing-active-game')).toBeNull()
  })

  test('rejects invalid game data and clears it', () => {
    sessionStorage.setItem('cau-typing-active-game', JSON.stringify({ ...game, sessionId: '', course: [] }))

    expect(readActiveGame()).toBeNull()
    expect(sessionStorage.getItem('cau-typing-active-game')).toBeNull()
  })

  test('clears the active game', () => {
    saveActiveGame(game)
    clearActiveGame()

    expect(readActiveGame()).toBeNull()
  })
})
