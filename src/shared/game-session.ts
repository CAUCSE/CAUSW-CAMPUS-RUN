import type { ActiveGame } from './types'

const ACTIVE_GAME_KEY = 'cau-typing-active-game'

export function saveActiveGame(game: ActiveGame): void {
  sessionStorage.setItem(ACTIVE_GAME_KEY, JSON.stringify(game))
}

export function readActiveGame(): ActiveGame | null {
  const storedGame = sessionStorage.getItem(ACTIVE_GAME_KEY)
  if (storedGame === null) return null

  try {
    const game: unknown = JSON.parse(storedGame)
    if (!isActiveGame(game)) {
      clearActiveGame()
      return null
    }

    return game
  } catch {
    clearActiveGame()
    return null
  }
}

export function clearActiveGame(): void {
  sessionStorage.removeItem(ACTIVE_GAME_KEY)
}

function isActiveGame(value: unknown): value is ActiveGame {
  if (!isRecord(value)) return false

  return typeof value.sessionId === 'string'
    && value.sessionId.length > 0
    && typeof value.nickname === 'string'
    && Array.isArray(value.course)
    && value.course.length > 0
    && value.course.every((place) => typeof place === 'string')
    && isFiniteNumber(value.startedAtEpochMs)
    && isFiniteNumber(value.expiresAtEpochMs)
    && isFiniteNumber(value.typoCount)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}
