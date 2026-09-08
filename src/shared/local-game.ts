import { CAMPUS_COURSE } from './course'
import type { CompleteSessionRequest, CompletionResponse, CreateSessionResponse } from './types'

const LOCAL_SESSION_DURATION_MS = 10 * 60 * 1_000

export function createLocalGameSession(): CreateSessionResponse {
  const startedAt = new Date()
  return {
    sessionId: `local-${crypto.randomUUID()}`,
    course: [...CAMPUS_COURSE],
    startedAt: startedAt.toISOString(),
    expiresAt: new Date(startedAt.getTime() + LOCAL_SESSION_DURATION_MS).toISOString(),
  }
}

export function completeLocalGame(nickname: string, input: CompleteSessionRequest): CompletionResponse {
  return {
    recordId: `local-${crypto.randomUUID()}`,
    nickname,
    officialElapsedMilliseconds: input.reportedElapsedMilliseconds,
    typoCount: input.typoCount,
    rankingStatus: 'PENDING_REGISTRATION',
    rank: null,
    leaderboard: [],
    isTestMode: true,
  }
}
