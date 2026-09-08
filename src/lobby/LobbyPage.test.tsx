import { cleanup, render, screen, within } from '@testing-library/react'
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
    const notices = [
      {
        summary: '개인정보 수집·이용 동의 전문',
        checkbox: privacyConsent,
        paragraphs: [
          'ICT 위원회는 CAU Campus Typing Game 운영을 위해 아래와 같이 개인정보를 수집·이용합니다.',
          '수집·이용 목적: 게임 참여자 식별 및 중복 기록 관리, 리더보드 운영, 경품 추첨, 당첨 안내 및 경품 발송',
          '수집 항목: 학번, 별명, 이메일 주소, 휴대전화번호, 게임 기록(완료 시간 및 오타 수)',
          '보유·이용 기간: 경품 발송 완료 후 30일까지 보관한 뒤 지체 없이 파기',
          '공개 항목: 리더보드에는 별명, 완료 시간 및 오타 수만 공개되며 학번과 연락처는 공개되지 않습니다.',
          '귀하는 개인정보 수집·이용 동의를 거부할 권리가 있습니다. 다만 필수 정보 수집에 동의하지 않으면 게임 참여와 경품 추첨 대상 등록이 제한됩니다.',
        ],
      },
      {
        summary: '개인정보 제공 동의 전문',
        checkbox: thirdPartyConsent,
        paragraphs: [
          'ICT 위원회는 모바일 경품 발송을 위해 아래와 같이 개인정보를 제공합니다.',
          '제공받는 자: ㈜윈큐브마케팅(센드비)',
          '제공 목적: 당첨자 모바일 쿠폰 발송 및 발송 관련 고객지원',
          '제공 항목: 별명, 휴대전화번호',
          '제공받는 자의 보유·이용 기간: 경품 발송 및 관련 고객지원 목적 달성 후 지체 없이 파기. 단, 관계 법령에 따라 보존할 의무가 있는 경우 해당 법정 기간 동안 보관',
          '귀하는 개인정보 제공 동의를 거부할 권리가 있습니다. 다만 필수 제공에 동의하지 않으면 게임 참여와 경품 추첨 대상 등록이 제한됩니다.',
        ],
      },
    ]
    for (const notice of notices) {
      const summary = screen.getByText(notice.summary)
      const details = summary.closest('details')!
      expect(details).not.toHaveAttribute('open')
      expect(screen.getByRole('checkbox', { name: notice.checkbox })).not.toBeChecked()
      await user.click(summary)
      expect(details).toHaveAttribute('open')
      for (const paragraph of notice.paragraphs) {
        expect(within(details).getByText(paragraph, { exact: true })).toBeVisible()
      }
      expect(screen.getByRole('checkbox', { name: notice.checkbox })).not.toBeChecked()
    }
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
