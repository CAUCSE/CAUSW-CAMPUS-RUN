import { afterEach, describe, expect, test, vi } from 'vitest'

import { ApiError, completeGameSession, createGameSession, getLeaderboard } from './api'

const session = {
  sessionId: 'session-1',
  course: Array.from({ length: 18 }, (_, index) => `장소 ${index + 1}`),
  startedAt: '2026-09-02T14:00:00+09:00',
  expiresAt: '2026-09-02T14:10:00+09:00',
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

function mockJsonResponse(data: unknown, ok = true, status = 200): Response {
  return { ok, status, json: vi.fn().mockResolvedValue(data) } as unknown as Response
}

describe('campus typing API client', () => {
  test('creates a session using the configured API base URL', async () => {
    vi.stubEnv('VITE_TYPING_GAME_API_BASE_URL', 'https://api.example.test/')
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse({ code: 'OK', message: '성공', data: session }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(createGameSession({ studentNumber: '20240001', nickname: '청룡' })).resolves.toEqual(session)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/api/v2/campus-typing/sessions',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentNumber: '20240001', nickname: '청룡' }),
      }),
    )
  })

  test('completes a session and reads the leaderboard', async () => {
    vi.stubEnv('VITE_TYPING_GAME_API_BASE_URL', 'https://api.example.test')
    const entry = { rank: 1, nickname: '청룡', officialElapsedMilliseconds: 18_420, typoCount: 1 }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(mockJsonResponse({ code: 'OK', message: '성공', data: { entry: { ...entry, rankingStatus: 'ELIGIBLE' }, leaderboard: [entry] } }))
      .mockResolvedValueOnce(mockJsonResponse({ code: 'OK', message: '성공', data: { entries: [entry] } }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(completeGameSession('session-1', { reportedElapsedMilliseconds: 18_420, typoCount: 1 }))
      .resolves.toEqual({ entry: { ...entry, rankingStatus: 'ELIGIBLE' }, leaderboard: [entry] })
    await expect(getLeaderboard()).resolves.toEqual([entry])
    expect(fetchMock).toHaveBeenNthCalledWith(1,
      'https://api.example.test/api/v2/campus-typing/sessions/session-1/completion',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ reportedElapsedMilliseconds: 18_420, typoCount: 1 }) }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(2,
      'https://api.example.test/api/v2/campus-typing/leaderboard',
      expect.objectContaining({ method: 'GET', headers: { 'Content-Type': 'application/json' } }),
    )
  })

  test('uses a server error message for non-success responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockJsonResponse({ message: '학번을 확인할 수 없습니다.' }, false, 400)))

    await expect(createGameSession({ studentNumber: '20240001', nickname: '청룡' }))
      .rejects.toMatchObject({ name: 'ApiError', message: '학번을 확인할 수 없습니다.' })
  })

  test('normalizes network failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    await expect(getLeaderboard())
      .rejects.toMatchObject({ name: 'ApiError', message: '네트워크 연결을 확인한 뒤 다시 시도해 주세요.' })
  })

  test('rejects malformed successful responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockJsonResponse({ code: 'OK', message: '성공', data: { course: [] } })))

    await expect(createGameSession({ studentNumber: '20240001', nickname: '청룡' })).rejects.toBeInstanceOf(ApiError)
  })
})
