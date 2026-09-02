import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { ResultPage } from './ResultPage'

const mocks = vi.hoisted(() => ({ getLeaderboard: vi.fn() }))

vi.mock('../shared/api', () => ({ getLeaderboard: mocks.getLeaderboard }))

const result = {
  recordId: 'record-1',
  nickname: '청룡',
  officialElapsedMilliseconds: 18_420,
  typoCount: 2,
  rankingStatus: 'ELIGIBLE' as const,
  rank: 3,
  leaderboard: [{ rank: 1, nickname: '사자', officialElapsedMilliseconds: 15_010, typoCount: 0 }],
}

describe('ResultPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    sessionStorage.setItem('cau-typing-last-result', JSON.stringify(result))
    mocks.getLeaderboard.mockResolvedValue(result.leaderboard)
  })

  afterEach(cleanup)

  test('renders the saved official result and leaderboard', async () => {
    render(<ResultPage />)

    expect(screen.getByText('청룡')).toBeInTheDocument()
    expect(screen.getByText('3위')).toBeInTheDocument()
    expect(screen.getByText('00:18.42')).toBeInTheDocument()
    expect(screen.getByText('오타 2회')).toBeInTheDocument()
    expect(screen.getByText('사자')).toBeInTheDocument()
    await act(async () => {})
    expect(mocks.getLeaderboard).toHaveBeenCalledOnce()
  })

  test('shows the registration notice instead of a rank when pending registration', () => {
    sessionStorage.setItem('cau-typing-last-result', JSON.stringify({ ...result, rankingStatus: 'PENDING_REGISTRATION', rank: null }))

    render(<ResultPage />)

    expect(screen.getByText('CAUSW 가입 후 축제 당일 리더보드에 반영됩니다.')).toBeInTheDocument()
    expect(screen.queryByText('3위')).not.toBeInTheDocument()
  })

  test('returns to the lobby when no saved result exists', () => {
    const replace = vi.fn()
    Object.defineProperty(window, 'location', { configurable: true, value: { replace } })
    sessionStorage.clear()

    render(<ResultPage />)

    expect(replace).toHaveBeenCalledWith('/')
  })

  test('clears the saved result and returns to the lobby when retrying', () => {
    const assign = vi.fn()
    Object.defineProperty(window, 'location', { configurable: true, value: { assign } })
    render(<ResultPage />)

    fireEvent.click(screen.getByRole('button', { name: '다시 도전' }))

    expect(sessionStorage.getItem('cau-typing-last-result')).toBeNull()
    expect(assign).toHaveBeenCalledWith('/')
  })

  test('keeps the saved result visible when the leaderboard refresh fails', async () => {
    mocks.getLeaderboard.mockRejectedValue(new Error('offline'))
    render(<ResultPage />)

    await act(async () => {})
    expect(screen.getByText('청룡')).toBeInTheDocument()
    expect(screen.getByText('최신 리더보드를 불러오지 못했습니다.')).toBeInTheDocument()
  })
})
