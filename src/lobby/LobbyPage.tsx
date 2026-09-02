import { CTAButton, Field, TextInput } from '@causw/core'
import { BuildingColored } from '@causw/icons'
import { FormEvent, useEffect, useId, useRef, useState } from 'react'

import { createGameSession, getLeaderboard } from '../shared/api'
import { formatDuration } from '../shared/format'
import { saveActiveGame } from '../shared/game-session'
import type { LeaderboardEntry } from '../shared/types'
import styles from './LobbyPage.module.css'

const STUDENT_NUMBER_PATTERN = /^\d{8}(\d{2})?$/

export function LobbyPage() {
  const studentNumberId = useId()
  const nicknameId = useId()
  const studentNumberInput = useRef<HTMLInputElement>(null)
  const [studentNumber, setStudentNumber] = useState('')
  const [nickname, setNickname] = useState('')
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [leaderboardError, setLeaderboardError] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const normalizedStudentNumber = studentNumber.trim()
  const normalizedNickname = nickname.trim()
  const isStudentNumberValid = STUDENT_NUMBER_PATTERN.test(normalizedStudentNumber)
  const isNicknameValid = normalizedNickname.length >= 1 && normalizedNickname.length <= 12
  const canStart = isStudentNumberValid && isNicknameValid && !isSubmitting

  useEffect(() => {
    studentNumberInput.current?.focus()

    void getLeaderboard()
      .then(setLeaderboard)
      .catch(() => setLeaderboardError(true))
  }, [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canStart) return

    setIsSubmitting(true)
    setSubmitError('')
    try {
      const response = await createGameSession({
        studentNumber: normalizedStudentNumber,
        nickname: normalizedNickname,
      })
      saveActiveGame({
        sessionId: response.sessionId,
        nickname: normalizedNickname,
        course: response.course,
        startedAtEpochMs: Date.parse(response.startedAt),
        expiresAtEpochMs: Date.parse(response.expiresAt),
        typoCount: 0,
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
          {leaderboardError ? (
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
