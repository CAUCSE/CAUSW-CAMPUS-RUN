import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { LobbyPage } from './LobbyPage'

const mocks = vi.hoisted(() => ({
  createGameSession: vi.fn(),
  createLocalGameSession: vi.fn(),
  getLeaderboard: vi.fn(),
  saveActiveGame: vi.fn(),
}))

vi.mock('../shared/api', () => ({
  createGameSession: mocks.createGameSession,
  getLeaderboard: mocks.getLeaderboard,
}))

vi.mock('../shared/local-game', () => ({ createLocalGameSession: mocks.createLocalGameSession }))

vi.mock('../shared/game-session', () => ({ saveActiveGame: mocks.saveActiveGame }))

describe('LobbyPage', () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('VITE_TYPING_GAME_API_ENABLED', 'true')
    mocks.getLeaderboard.mockResolvedValue([
      { rank: 1, nickname: '사자', officialElapsedMilliseconds: 18_420, typoCount: 1 },
    ])
  })

  test('enables valid input, creates a session, stores its public game data, and navigates', async () => {
    const assign = vi.fn()
    Object.defineProperty(window, 'location', { configurable: true, value: { assign } })
    mocks.createGameSession.mockResolvedValue({
      sessionId: 'session-1',
      course: ['영신관'],
      startedAt: '2026-09-02T01:00:00.000Z',
      expiresAt: '2026-09-02T01:10:00.000Z',
    })
    const user = userEvent.setup()

    render(<LobbyPage />)

    expect(screen.getByRole('button', { name: '게임 시작' })).toBeDisabled()
    await user.type(screen.getByLabelText('학번'), '20240001')
    await user.type(screen.getByLabelText('별명'), '청룡')
    expect(screen.getByRole('button', { name: '게임 시작' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: '게임 시작' }))

    expect(mocks.createGameSession).toHaveBeenCalledWith({ studentNumber: '20240001', nickname: '청룡' })
    expect(mocks.saveActiveGame).toHaveBeenCalledWith({
      sessionId: 'session-1',
      nickname: '청룡',
      course: ['영신관'],
      startedAtEpochMs: Date.parse('2026-09-02T01:00:00.000Z'),
      expiresAtEpochMs: Date.parse('2026-09-02T01:10:00.000Z'),
      typoCount: 0,
    })
    expect(assign).toHaveBeenCalledWith('/play.html')
  })

  test('shows a session API error', async () => {
    mocks.createGameSession.mockRejectedValue(new Error('학번을 확인할 수 없습니다.'))
    const user = userEvent.setup()
    render(<LobbyPage />)

    await user.type(screen.getByLabelText('학번'), '20240001')
    await user.type(screen.getByLabelText('별명'), '청룡')
    await user.click(screen.getByRole('button', { name: '게임 시작' }))

    expect(await screen.findByText('학번을 확인할 수 없습니다.')).toBeInTheDocument()
  })

  test('keeps the form available when leaderboard loading fails', async () => {
    mocks.getLeaderboard.mockRejectedValue(new Error('offline'))
    render(<LobbyPage />)

    expect(await screen.findByText('리더보드를 불러오지 못했습니다.')).toBeInTheDocument()
    expect(screen.getByLabelText('학번')).toBeEnabled()
  })

  test('starts a local game and does not request the leaderboard in test mode', async () => {
    vi.stubEnv('VITE_TYPING_GAME_API_ENABLED', 'false')
    const assign = vi.fn()
    Object.defineProperty(window, 'location', { configurable: true, value: { assign } })
    mocks.createLocalGameSession.mockReturnValue({
      sessionId: 'local-1', course: ['영신관'], startedAt: '2026-09-02T01:00:00.000Z', expiresAt: '2026-09-02T01:10:00.000Z',
    })
    const user = userEvent.setup()

    render(<LobbyPage />)
    await user.type(screen.getByLabelText('학번'), '20240001')
    await user.type(screen.getByLabelText('별명'), '청룡')
    await user.click(screen.getByRole('button', { name: '게임 시작' }))

    expect(mocks.getLeaderboard).not.toHaveBeenCalled()
    expect(mocks.createGameSession).not.toHaveBeenCalled()
    expect(mocks.createLocalGameSession).toHaveBeenCalledOnce()
    expect(screen.getByText('테스트 모드입니다. 기록은 리더보드에 반영되지 않습니다.')).toBeInTheDocument()
    expect(assign).toHaveBeenCalledWith('/play.html')
  })
})
