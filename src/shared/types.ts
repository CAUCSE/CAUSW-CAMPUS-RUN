export type CreateSessionRequest = {
  studentNumber: string
  nickname: string
  email: string
  phoneNumber: string
  privacyConsent: true
  thirdPartyConsent: true
}

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
  recordId: string
  nickname: string
  officialElapsedMilliseconds: number
  typoCount: number
  rankingStatus: 'ELIGIBLE' | 'PENDING_REGISTRATION'
  rank: number | null
  leaderboard: LeaderboardEntry[]
  isTestMode?: boolean
}

export type ActiveGame = {
  sessionId: string
  nickname: string
  course: string[]
  startedAtEpochMs: number
  expiresAtEpochMs: number
  typoCount: number
  isTestMode?: boolean
  currentIndex?: number
  currentInput?: string
}
