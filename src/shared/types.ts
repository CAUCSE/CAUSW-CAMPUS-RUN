export type CreateSessionRequest = { studentNumber: string; nickname: string }

export type CreateSessionResponse = {
  sessionId: string
  course: string[]
  startedAt: string
  expiresAt: string
}

export type CompleteSessionRequest = {
  reportedElapsedMilliseconds: number
  typoCount: number
}

export type LeaderboardEntry = {
  rank: number
  nickname: string
  officialElapsedMilliseconds: number
  typoCount: number
}

export type CompletionResponse = {
  entry: LeaderboardEntry & {
    rankingStatus: 'ELIGIBLE' | 'PENDING_REGISTRATION'
    rank: number | null
  }
  leaderboard: LeaderboardEntry[]
}

export type ActiveGame = {
  sessionId: string
  nickname: string
  course: string[]
  startedAtEpochMs: number
  expiresAtEpochMs: number
  typoCount: number
}
