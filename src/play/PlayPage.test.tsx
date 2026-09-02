import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { PlayPage } from './PlayPage'

const mocks = vi.hoisted(() => ({
  readActiveGame: vi.fn(),
  clearActiveGame: vi.fn(),
  completeGameSession: vi.fn(),
}))

vi.mock('../shared/game-session', () => ({
  readActiveGame: mocks.readActiveGame,
  clearActiveGame: mocks.clearActiveGame,
}))

vi.mock('../shared/api', () => ({ completeGameSession: mocks.completeGameSession }))

const activeGame = {
  sessionId: 'session-1',
  nickname: '청룡',
  course: ['본관', '중앙도서관'],
  startedAtEpochMs: 1_000,
  expiresAtEpochMs: 60_000,
  typoCount: 0,
}

const completion = {
  recordId: 'record-1',
  nickname: '청룡',
  officialElapsedMilliseconds: 2_500,
  typoCount: 1,
  rankingStatus: 'ELIGIBLE' as const,
  rank: 3,
  leaderboard: [{ rank: 1, nickname: '사자', officialElapsedMilliseconds: 1_234, typoCount: 0 }],
}

describe('PlayPage', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
    vi.clearAllMocks()
    sessionStorage.clear()
    mocks.readActiveGame.mockReturnValue(activeGame)
    mocks.completeGameSession.mockResolvedValue(completion)
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  test('returns to the lobby when no active game is stored', () => {
    const replace = vi.fn()
    Object.defineProperty(window, 'location', { configurable: true, value: { replace } })
    mocks.readActiveGame.mockReturnValue(null)

    render(<PlayPage />)

    expect(replace).toHaveBeenCalledWith('/')
  })

  test('counts wrong keys, advances correct input, and updates elapsed time', () => {
    render(<PlayPage />)
    const input = screen.getByLabelText('장소 입력')

    expect(screen.getByText('1 / 2')).toBeInTheDocument()
    expect(screen.getByText('00:00.00')).toBeInTheDocument()
    fireEvent.keyDown(input, { key: '브' })
    expect(screen.getByText('오타 1회')).toBeInTheDocument()
    expect(screen.getByText('브')).toBeInTheDocument()
    expect(input).toHaveValue('')

    fireEvent.keyDown(input, { key: '본' })
    fireEvent.keyDown(input, { key: '관' })
    expect(screen.getByText('2 / 2')).toBeInTheDocument()
    expect(screen.getByText('중앙도서관')).toBeInTheDocument()

    act(() => vi.advanceTimersByTime(340))
    expect(screen.getByText('00:00.34')).toBeInTheDocument()
  })

  test('submits a fixed completion payload, preserves the full response, then navigates', async () => {
    const assign = vi.fn()
    Object.defineProperty(window, 'location', { configurable: true, value: { assign } })
    render(<PlayPage />)

    act(() => vi.advanceTimersByTime(2_500))
    const input = screen.getByLabelText('장소 입력')
    for (const character of '본관중앙도서관') fireEvent.keyDown(input, { key: character })

    expect(mocks.completeGameSession).toHaveBeenCalledWith('session-1', {
      reportedElapsedMilliseconds: 2_500,
      typoCount: 0,
    })
    await act(async () => {})
    expect(JSON.parse(sessionStorage.getItem('cau-typing-last-result')!)).toEqual({
      entry: completion,
      leaderboard: completion.leaderboard,
    })
    expect(mocks.clearActiveGame).toHaveBeenCalledOnce()
    expect(assign).toHaveBeenCalledWith('/result.html')
  })

  test('keeps the completed result visible and retries the identical payload after a save error', async () => {
    mocks.completeGameSession.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(completion)
    render(<PlayPage />)

    act(() => vi.advanceTimersByTime(800))
    const input = screen.getByLabelText('장소 입력')
    for (const character of '본관중앙도서관') fireEvent.keyDown(input, { key: character })

    await act(async () => {})
    expect(screen.getByText('기록 저장에 실패했습니다. 다시 시도해 주세요.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '다시 저장' })).toBeInTheDocument()
    expect(screen.getByText('완주했습니다')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '다시 저장' }))
    expect(mocks.completeGameSession).toHaveBeenNthCalledWith(1, 'session-1', {
      reportedElapsedMilliseconds: 800,
      typoCount: 0,
    })
    expect(mocks.completeGameSession).toHaveBeenNthCalledWith(2, 'session-1', {
      reportedElapsedMilliseconds: 800,
      typoCount: 0,
    })
  })

  test('blocks paste input', () => {
    render(<PlayPage />)
    const event = fireEvent.paste(screen.getByLabelText('장소 입력'), { clipboardData: { getData: () => '본관' } })

    expect(event).toBe(false)
  })
})
