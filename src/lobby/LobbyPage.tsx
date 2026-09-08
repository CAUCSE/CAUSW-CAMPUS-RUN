import { CTAButton, Field, TextInput } from '@causw/core'
import { BuildingColored } from '@causw/icons'
import { FormEvent, useEffect, useId, useRef, useState } from 'react'

import { createGameSession, getLeaderboard } from '../shared/api'
import { isApiEnabled } from '../shared/game-config'
import { formatDuration } from '../shared/format'
import { saveActiveGame } from '../shared/game-session'
import { createLocalGameSession } from '../shared/local-game'
import type { LeaderboardEntry } from '../shared/types'
import styles from './LobbyPage.module.css'

const STUDENT_NUMBER_PATTERN = /^\d{8}(\d{2})?$/
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+$/
const PHONE_NUMBER_PATTERN = /^010\d{8}$/

export function LobbyPage() {
  const apiEnabled = isApiEnabled()
  const studentNumberId = useId()
  const nicknameId = useId()
  const emailId = useId()
  const phoneNumberId = useId()
  const privacyConsentId = useId()
  const thirdPartyConsentId = useId()
  const studentNumberInput = useRef<HTMLInputElement>(null)
  const [studentNumber, setStudentNumber] = useState('')
  const [nickname, setNickname] = useState('')
  const [email, setEmail] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [privacyConsent, setPrivacyConsent] = useState(false)
  const [thirdPartyConsent, setThirdPartyConsent] = useState(false)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [leaderboardError, setLeaderboardError] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const normalizedStudentNumber = studentNumber.trim()
  const normalizedNickname = nickname.trim()
  const normalizedEmail = email.trim().toLowerCase()
  const normalizedPhoneNumber = phoneNumber.replace(/\D/g, '')
  const isStudentNumberValid = STUDENT_NUMBER_PATTERN.test(normalizedStudentNumber)
  const isNicknameValid = normalizedNickname.length >= 1 && normalizedNickname.length <= 12
  const isEmailValid = EMAIL_PATTERN.test(normalizedEmail) && normalizedEmail.length <= 254
  const isPhoneNumberValid = PHONE_NUMBER_PATTERN.test(normalizedPhoneNumber)
  const canStart = isStudentNumberValid && isNicknameValid && isEmailValid && isPhoneNumberValid && privacyConsent && thirdPartyConsent && !isSubmitting

  useEffect(() => {
    studentNumberInput.current?.focus()

    if (apiEnabled) {
      void getLeaderboard()
        .then(setLeaderboard)
        .catch(() => setLeaderboardError(true))
    }
  }, [apiEnabled])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canStart) return

    setIsSubmitting(true)
    setSubmitError('')
    try {
      const response = apiEnabled
        ? await createGameSession({
          studentNumber: normalizedStudentNumber,
          nickname: normalizedNickname,
          email: normalizedEmail,
          phoneNumber: normalizedPhoneNumber,
          privacyConsent: true,
          thirdPartyConsent: true,
        })
        : createLocalGameSession()
      saveActiveGame({
        sessionId: response.sessionId,
        nickname: normalizedNickname,
        course: response.course,
        startedAtEpochMs: Date.parse(response.startedAt),
        expiresAtEpochMs: Date.parse(response.expiresAt),
        typoCount: 0,
        ...(!apiEnabled ? { isTestMode: true } : {}),
      })
      window.location.assign('/play.html')
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : '게임을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.')
      setIsSubmitting(false)
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <img className={styles.logo} src="/images/ccssaa-logo.png" alt="CAUSW" width="224" height="34" />
        <span className={styles.headerDivider} aria-hidden="true" />
        <span className={styles.wordmark}>CAU CAMPUS RUN</span>
      </header>

      <section className={styles.content} aria-label="캠퍼스 타이핑 게임 대기 화면">
        <article className={styles.startCard}>
            <div className={styles.introduction}>
            <BuildingColored size={48} aria-hidden="true" />
            <div>
              <p className={styles.eyebrow}>CENTRAL UNIVERSITY</p>
              <h1>캠퍼스를 빠르게 달려보세요</h1>
              <p>18개의 캠퍼스 장소를 가장 빠르게 입력해 Top 10에 도전하세요.</p>
            </div>
            {!apiEnabled && <p className={styles.testMode} role="status">테스트 모드입니다. 기록은 리더보드에 반영되지 않습니다.</p>}
          </div>

          <form className={styles.form} onSubmit={handleSubmit} noValidate>
            <Field disabled={isSubmitting} error={studentNumber.length > 0 && !isStudentNumberValid}>
              <Field.Label htmlFor={studentNumberId}>학번</Field.Label>
              <TextInput
                ref={studentNumberInput}
                id={studentNumberId}
                value={studentNumber}
                onChange={(event) => setStudentNumber(event.target.value)}
                inputMode="numeric"
                autoComplete="off"
                placeholder="8자리 또는 10자리 숫자"
                disabled={isSubmitting}
                aria-describedby={studentNumber.length > 0 && !isStudentNumberValid ? `${studentNumberId}-error` : undefined}
              />
              {studentNumber.length > 0 && !isStudentNumberValid && (
                <Field.ErrorDescription id={`${studentNumberId}-error`}>학번은 8자리 또는 10자리 숫자로 입력해 주세요.</Field.ErrorDescription>
              )}
            </Field>

            <Field disabled={isSubmitting} error={nickname.length > 0 && !isNicknameValid}>
              <Field.Label htmlFor={nicknameId}>별명</Field.Label>
              <TextInput
                id={nicknameId}
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
                autoComplete="off"
                maxLength={12}
                placeholder="리더보드에 표시될 이름"
                disabled={isSubmitting}
                aria-describedby={nickname.length > 0 && !isNicknameValid ? `${nicknameId}-error` : undefined}
              />
              {nickname.length > 0 && !isNicknameValid && (
                <Field.ErrorDescription id={`${nicknameId}-error`}>별명은 1자 이상 12자 이하로 입력해 주세요.</Field.ErrorDescription>
              )}
            </Field>

            <Field disabled={isSubmitting} error={email.length > 0 && !isEmailValid}>
              <Field.Label htmlFor={emailId}>이메일</Field.Label>
              <TextInput
                id={emailId}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                inputMode="email"
                placeholder="winner@example.com"
                disabled={isSubmitting}
                aria-describedby={email.length > 0 && !isEmailValid ? `${emailId}-error` : undefined}
              />
              {email.length > 0 && !isEmailValid && (
                <Field.ErrorDescription id={`${emailId}-error`}>올바른 이메일 주소를 입력해 주세요.</Field.ErrorDescription>
              )}
            </Field>

            <Field disabled={isSubmitting} error={phoneNumber.length > 0 && !isPhoneNumberValid}>
              <Field.Label htmlFor={phoneNumberId}>휴대전화번호</Field.Label>
              <TextInput
                id={phoneNumberId}
                value={formatPhoneNumber(phoneNumber)}
                onChange={(event) => setPhoneNumber(event.target.value.replace(/\D/g, '').slice(0, 11))}
                autoComplete="tel"
                inputMode="numeric"
                placeholder="010-1234-5678"
                disabled={isSubmitting}
                aria-describedby={phoneNumber.length > 0 && !isPhoneNumberValid ? `${phoneNumberId}-error` : undefined}
              />
              {phoneNumber.length > 0 && !isPhoneNumberValid && (
                <Field.ErrorDescription id={`${phoneNumberId}-error`}>010으로 시작하는 11자리 번호를 입력해 주세요.</Field.ErrorDescription>
              )}
            </Field>

            <div className={styles.consents} aria-label="개인정보 동의">
              <details className={styles.disclosure}>
                <summary>개인정보 수집·이용 동의 전문</summary>
                <div>
                  <p>ICT 위원회는 경품 추첨 및 경품 발송을 위해 개인정보를 수집·이용합니다.</p>
                  <p>수집 항목: 성명, 학번, 이메일 주소, 휴대전화번호, 경품 정보</p>
                  <p>보유·이용 기간: 경품 발송 완료 후 30일</p>
                  <p>동의를 거부할 권리가 있으나, 거부하면 경품 참여가 불가능합니다.</p>
                </div>
              </details>
              <label className={styles.consentLabel} htmlFor={privacyConsentId}>
                <input id={privacyConsentId} type="checkbox" checked={privacyConsent} onChange={(event) => setPrivacyConsent(event.target.checked)} disabled={isSubmitting} />
                개인정보 수집·이용에 동의합니다. (필수)
              </label>

              <details className={styles.disclosure}>
                <summary>개인정보 제공 동의 전문</summary>
                <div>
                  <p>ICT 위원회는 경품 발송을 위해 아래와 같이 개인정보를 제공합니다.</p>
                  <p>제공받는 자: ㈜윈큐브마케팅(센드비)</p>
                  <p>제공 목적: 경품 추첨 및 경품 발송</p>
                  <p>제공 항목: 성명, 학번, 이메일 주소, 휴대전화번호, 경품 정보</p>
                  <p>보유·이용 기간: 경품 발송 완료 후 30일</p>
                  <p>동의를 거부할 권리가 있으나, 거부하면 경품 참여가 불가능합니다.</p>
                </div>
              </details>
              <label className={styles.consentLabel} htmlFor={thirdPartyConsentId}>
                <input id={thirdPartyConsentId} type="checkbox" checked={thirdPartyConsent} onChange={(event) => setThirdPartyConsent(event.target.checked)} disabled={isSubmitting} />
                센드비를 통한 경품 발송을 위한 개인정보 제공에 동의합니다. (필수)
              </label>
            </div>

            {submitError && <p className={styles.submitError} role="alert">{submitError}</p>}
            <CTAButton className={styles.startButton} type="submit" disabled={!canStart} fullWidth>
              {isSubmitting ? '게임 준비 중...' : '게임 시작'}
            </CTAButton>
          </form>
        </article>

        <aside className={styles.leaderboard} aria-labelledby="leaderboard-title">
          <div className={styles.leaderboardHeading}>
            <p className={styles.eyebrow}>TODAY'S BEST</p>
            <h2 id="leaderboard-title">Top 10</h2>
          </div>
          {!apiEnabled ? (
            <p className={styles.empty}>테스트 모드에서는 리더보드를 표시하지 않습니다.</p>
          ) : leaderboardError ? (
            <p className={styles.leaderboardError} role="status">리더보드를 불러오지 못했습니다.</p>
          ) : (
            <table>
              <thead><tr><th scope="col">순위</th><th scope="col">별명</th><th scope="col">기록</th><th scope="col">오타</th></tr></thead>
              <tbody>
                {leaderboard.slice(0, 10).map((entry) => (
                  <tr key={`${entry.rank}-${entry.nickname}`}>
                    <td>{entry.rank}</td><td>{entry.nickname}</td><td>{formatDuration(entry.officialElapsedMilliseconds)}</td><td>{entry.typoCount}</td>
                  </tr>
                ))}
                {leaderboard.length === 0 && <tr><td colSpan={4} className={styles.empty}>아직 등록된 기록이 없습니다.</td></tr>}
              </tbody>
            </table>
          )}
        </aside>
      </section>
    </main>
  )
}

function formatPhoneNumber(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  if (digits.length <= 3) return digits
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
}
