import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { LobbyPage } from './LobbyPage'

const mocks = vi.hoisted(() => ({
  createGameSession: vi.fn(), createLocalGameSession: vi.fn(), getLeaderboard: vi.fn(), saveActiveGame: vi.fn(),
}))

vi.mock('../shared/api', () => ({ createGameSession: mocks.createGameSession, getLeaderboard: mocks.getLeaderboard }))
vi.mock('../shared/local-game', () => ({ createLocalGameSession: mocks.createLocalGameSession }))
vi.mock('../shared/game-session', () => ({ saveActiveGame: mocks.saveActiveGame }))

const privacyConsent = '개인정보 수집·이용에 동의합니다. (필수)'
const thirdPartyConsent = '센드비를 통한 경품 발송을 위한 개인정보 제공에 동의합니다. (필수)'

describe('LobbyPage', () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('VITE_TYPING_GAME_API_ENABLED', 'true')
    mocks.getLeaderboard.mockResolvedValue([{ rank: 1, nickname: '사자', officialElapsedMilliseconds: 18_420, typoCount: 1 }])
  })

  async function fillValidStartForm(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByLabelText('학번'), '20240001')
    await user.type(screen.getByLabelText('별명'), '청룡')
    await user.type(screen.getByLabelText('이메일'), 'Winner@Example.COM ')
    await user.type(screen.getByLabelText('휴대전화번호'), '01012345678')
    await user.click(screen.getByRole('checkbox', { name: privacyConsent }))
    await user.click(screen.getByRole('checkbox', { name: thirdPartyConsent }))
  }

  test('creates a session with normalized contacts and explicit consents', async () => {
    const assign = vi.fn()
    Object.defineProperty(window, 'location', { configurable: true, value: { assign } })
    mocks.createGameSession.mockResolvedValue({
      sessionId: 'session-1', course: ['영신관'], startedAt: '2026-09-02T01:00:00.000Z', expiresAt: '2026-09-02T01:10:00.000Z',
    })
    const user = userEvent.setup()
    render(<LobbyPage />)

    expect(screen.getByRole('button', { name: '게임 시작' })).toBeDisabled()
    await fillValidStartForm(user)
    expect(screen.getByRole('button', { name: '게임 시작' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: '게임 시작' }))

    expect(mocks.createGameSession).toHaveBeenCalledWith({
      studentNumber: '20240001', nickname: '청룡', email: 'winner@example.com', phoneNumber: '01012345678', privacyConsent: true, thirdPartyConsent: true,
    })
    expect(mocks.saveActiveGame).toHaveBeenCalledWith({
      sessionId: 'session-1', nickname: '청룡', course: ['영신관'], startedAtEpochMs: Date.parse('2026-09-02T01:00:00.000Z'),
      expiresAtEpochMs: Date.parse('2026-09-02T01:10:00.000Z'), typoCount: 0,
    })
    expect(assign).toHaveBeenCalledWith('/play.html')
  })

  test('preserves contact fields and consent after a session API error', async () => {
    mocks.createGameSession.mockRejectedValue(new Error('학번을 확인할 수 없습니다.'))
    const user = userEvent.setup()
    render(<LobbyPage />)
    await fillValidStartForm(user)
    await user.click(screen.getByRole('button', { name: '게임 시작' }))

    expect(await screen.findByText('학번을 확인할 수 없습니다.')).toBeInTheDocument()
    expect(screen.getByLabelText('이메일')).toHaveValue('Winner@Example.COM ')
    expect(screen.getByLabelText('휴대전화번호')).toHaveValue('010-1234-5678')
    expect(screen.getByRole('checkbox', { name: privacyConsent })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: thirdPartyConsent })).toBeChecked()
  })

  test.each([
    ['an invalid email', async (user: ReturnType<typeof userEvent.setup>) => user.type(screen.getByLabelText('이메일'), 'winner@')],
    ['an invalid phone number', async (user: ReturnType<typeof userEvent.setup>) => {
      await user.type(screen.getByLabelText('이메일'), 'winner@example.com')
      await user.type(screen.getByLabelText('휴대전화번호'), '01112345678')
    }],
  ])('keeps the start button disabled with %s', async (_description, fillInvalidField) => {
    const user = userEvent.setup()
    render(<LobbyPage />)
    await user.type(screen.getByLabelText('학번'), '20240001')
    await user.type(screen.getByLabelText('별명'), '청룡')
    await fillInvalidField(user)
    await user.click(screen.getByRole('checkbox', { name: privacyConsent }))
    await user.click(screen.getByRole('checkbox', { name: thirdPartyConsent }))
    expect(screen.getByRole('button', { name: '게임 시작' })).toBeDisabled()
  })

  test.each([
    ['privacy consent', privacyConsent],
    ['third-party consent', thirdPartyConsent],
  ])('keeps the start button disabled without %s', async (_description, uncheckedConsent) => {
    const user = userEvent.setup()
    render(<LobbyPage />)
    await user.type(screen.getByLabelText('학번'), '20240001')
    await user.type(screen.getByLabelText('별명'), '청룡')
    await user.type(screen.getByLabelText('이메일'), 'winner@example.com')
    await user.type(screen.getByLabelText('휴대전화번호'), '01012345678')
    for (const consent of [privacyConsent, thirdPartyConsent]) if (consent !== uncheckedConsent) await user.click(screen.getByRole('checkbox', { name: consent }))
    expect(screen.getByRole('button', { name: '게임 시작' })).toBeDisabled()
  })

  test('shows separate accessible consent disclosures', async () => {
    const user = userEvent.setup()
    render(<LobbyPage />)
    await user.click(screen.getByText('개인정보 수집·이용 동의 전문'))
    await user.click(screen.getByText('개인정보 제공 동의 전문'))
    expect(screen.getAllByText(/ICT 위원회/)).toHaveLength(2)
    expect(screen.getAllByText(/경품 발송 완료 후 30일/)).toHaveLength(2)
    expect(screen.getByText(/㈜윈큐브마케팅\(센드비\)/)).toBeInTheDocument()
  })

  test('keeps the form available when leaderboard loading fails', async () => {
    mocks.getLeaderboard.mockRejectedValue(new Error('offline'))
    render(<LobbyPage />)
    expect(await screen.findByText('리더보드를 불러오지 못했습니다.')).toBeInTheDocument()
    expect(screen.getByLabelText('학번')).toBeEnabled()
  })

  test('starts a local game without sending contacts to the local session', async () => {
    vi.stubEnv('VITE_TYPING_GAME_API_ENABLED', 'false')
    const assign = vi.fn()
    Object.defineProperty(window, 'location', { configurable: true, value: { assign } })
    mocks.createLocalGameSession.mockReturnValue({ sessionId: 'local-1', course: ['영신관'], startedAt: '2026-09-02T01:00:00.000Z', expiresAt: '2026-09-02T01:10:00.000Z' })
    const user = userEvent.setup()
    render(<LobbyPage />)
    await fillValidStartForm(user)
    await user.click(screen.getByRole('button', { name: '게임 시작' }))
    expect(mocks.getLeaderboard).not.toHaveBeenCalled()
    expect(mocks.createGameSession).not.toHaveBeenCalled()
    expect(mocks.createLocalGameSession).toHaveBeenCalledOnce()
    expect(screen.getByText('테스트 모드입니다. 기록은 리더보드에 반영되지 않습니다.')).toBeInTheDocument()
    expect(assign).toHaveBeenCalledWith('/play.html')
  })
})
