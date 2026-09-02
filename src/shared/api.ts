import type {
  CompleteSessionRequest,
  CompletionResponse,
  CreateSessionRequest,
  CreateSessionResponse,
  LeaderboardEntry,
} from './types'

const NETWORK_ERROR_MESSAGE = '네트워크 연결을 확인한 뒤 다시 시도해 주세요.'
const MALFORMED_RESPONSE_MESSAGE = '서버 응답을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.'
const CAMPUS_COURSE = new Set([
  '영신관', '파이퍼홀', '수림과학관', '학생회관', '본관', '전산정보관', '서라벌홀', '중앙도서관', '봅스트홀',
  '제2공학관', '창업보육관', '중앙문화예술관', '대학원', '법학관', '미디어공연영상관', '글로벌하우스', '블루미르홀', '100주년기념관',
])

export class ApiError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

export async function createGameSession(input: CreateSessionRequest): Promise<CreateSessionResponse> {
  const data = await request('/api/v2/campus-typing/sessions', 'POST', input)
  if (!isCreateSessionResponse(data)) throw new ApiError(MALFORMED_RESPONSE_MESSAGE)
  return data
}

export async function completeGameSession(
  sessionId: string,
  input: CompleteSessionRequest,
): Promise<CompletionResponse> {
  const data = await request(`/api/v2/campus-typing/sessions/${encodeURIComponent(sessionId)}/completion`, 'POST', input)
  if (!isCompletionResponse(data)) throw new ApiError(MALFORMED_RESPONSE_MESSAGE)
  return data
}

export async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  const data = await request('/api/v2/campus-typing/leaderboard', 'GET')
  if (!isRecord(data) || !isLeaderboard(data.entries)) throw new ApiError(MALFORMED_RESPONSE_MESSAGE)
  return data.entries
}

async function request(path: string, method: 'GET' | 'POST', body?: unknown): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(`${apiBaseUrl()}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(NETWORK_ERROR_MESSAGE)
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new ApiError(MALFORMED_RESPONSE_MESSAGE)
  }

  if (!response.ok) {
    throw new ApiError(errorMessage(payload))
  }

  if (!isRecord(payload) || !('data' in payload)) {
    throw new ApiError(MALFORMED_RESPONSE_MESSAGE)
  }
  return payload.data
}

function apiBaseUrl(): string {
  return (import.meta.env.VITE_TYPING_GAME_API_BASE_URL ?? '').replace(/\/+$/, '')
}

function errorMessage(payload: unknown): string {
  return isRecord(payload) && typeof payload.message === 'string' && payload.message.length > 0
    ? payload.message
    : MALFORMED_RESPONSE_MESSAGE
}

function isCreateSessionResponse(value: unknown): value is CreateSessionResponse {
  return isRecord(value)
    && typeof value.sessionId === 'string'
    && Array.isArray(value.course)
    && isCampusCourse(value.course)
    && typeof value.startedAt === 'string'
    && typeof value.expiresAt === 'string'
}

function isCompletionResponse(value: unknown): value is CompletionResponse {
  return isRecord(value)
    && typeof value.recordId === 'string'
    && typeof value.nickname === 'string'
    && typeof value.officialElapsedMilliseconds === 'number'
    && typeof value.typoCount === 'number'
    && (value.rankingStatus === 'ELIGIBLE' || value.rankingStatus === 'PENDING_REGISTRATION')
    && (typeof value.rank === 'number' || value.rank === null)
    && isLeaderboard(value.leaderboard)
}

function isCampusCourse(value: unknown[]): value is string[] {
  return value.length === CAMPUS_COURSE.size
    && value.every((place) => typeof place === 'string' && CAMPUS_COURSE.has(place))
    && new Set(value).size === CAMPUS_COURSE.size
}

function isLeaderboard(value: unknown): value is LeaderboardEntry[] {
  return Array.isArray(value) && value.every(isLeaderboardEntry)
}

function isLeaderboardEntry(value: unknown): value is LeaderboardEntry {
  return isRecord(value)
    && typeof value.rank === 'number'
    && typeof value.nickname === 'string'
    && typeof value.officialElapsedMilliseconds === 'number'
    && typeof value.typoCount === 'number'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
