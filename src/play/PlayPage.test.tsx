import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { PlayPage } from './PlayPage'

const mocks = vi.hoisted(() => ({ readActiveGame: vi.fn(), clearActiveGame: vi.fn(), saveActiveGame: vi.fn(), completeGameSession: vi.fn(), completeLocalGame: vi.fn() }))
vi.mock('../shared/game-session', () => ({ readActiveGame: mocks.readActiveGame, clearActiveGame: mocks.clearActiveGame, saveActiveGame: mocks.saveActiveGame }))
vi.mock('../shared/api', () => ({ completeGameSession: mocks.completeGameSession }))
vi.mock('../shared/local-game', () => ({ completeLocalGame: mocks.completeLocalGame }))

const game = { sessionId: 'session-1', nickname: '청룡', course: ['본관', '중앙도서관'], startedAtEpochMs: 1_000, expiresAtEpochMs: 60_000, typoCount: 0 }

describe('PlayPage submitted attempts', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(1_000); vi.clearAllMocks(); mocks.readActiveGame.mockReturnValue(game) })
  afterEach(() => { cleanup(); vi.useRealTimers() })

  function start() { for (let index = 0; index < 3; index += 1) act(() => vi.advanceTimersByTime(1_000)) }

  test('locks the input during countdown and enables it afterwards', () => {
    render(<PlayPage />)
    expect(screen.getByLabelText('장소 입력')).toBeDisabled()
    start()
    expect(screen.getByLabelText('장소 입력')).toBeEnabled()
  })

  test('keeps an incorrect draft visible and clears it only after Enter', () => {
    render(<PlayPage />); start()
    const input = screen.getByLabelText('장소 입력')
    fireEvent.change(input, { target: { value: '본브' } })
    expect(input).toHaveValue('본브')
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(input).toHaveValue('')
    expect(screen.getByText('오타 1회')).toBeInTheDocument()
  })

  test('advances only after an exact Enter submission', () => {
    render(<PlayPage />); start()
    const input = screen.getByLabelText('장소 입력')
    fireEvent.change(input, { target: { value: '본관' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByText('중앙도서관')).toBeInTheDocument()
    expect(mocks.saveActiveGame).toHaveBeenLastCalledWith(expect.objectContaining({ currentIndex: 1, currentInput: '' }))
  })

  test('keeps the mute choice for the next game', () => {
    render(<PlayPage />)
    fireEvent.click(screen.getByRole('button', { name: '효과음 끄기' }))
    expect(localStorage.getItem('cau-typing-sound-muted')).toBe('true')
    expect(screen.getByRole('button', { name: '효과음 켜기' })).toBeInTheDocument()
  })
})
