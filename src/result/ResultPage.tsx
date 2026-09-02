import { CTAButton } from '@causw/core'
import { Check } from '@causw/icons'
import { useEffect, useState } from 'react'

import { getLeaderboard } from '../shared/api'
import { formatDuration } from '../shared/format'
import type { CompletionResponse, LeaderboardEntry } from '../shared/types'
import styles from './ResultPage.module.css'

const LAST_RESULT_KEY = 'cau-typing-last-result'

export function ResultPage() {
  const [result] = useState(readLastResult)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>(() => result?.leaderboard ?? [])
  const [leaderboardError, setLeaderboardError] = useState(false)

  useEffect(() => {
    if (result === null) {
      window.location.replace('/')
      return
    }

    void getLeaderboard()
      .then(setLeaderboard)
      .catch(() => setLeaderboardError(true))
  }, [result])

  if (result === null) return null

  function retry() {
    sessionStorage.removeItem(LAST_RESULT_KEY)
    window.location.assign('/')
  }

  const isEligible = result.rankingStatus === 'ELIGIBLE'

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <img className={styles.logo} src="/images/ccssaa-logo.png" alt="CAUSW" width="224" height="34" />
        <span className={styles.headerDivider} aria-hidden="true" />
        <span className={styles.wordmark}>CAU CAMPUS RUN</span>
      </header>

      <section className={styles.content} aria-label="캠퍼스 타이핑 게임 결과">
        <article className={styles.resultCard}>
          <div className={styles.completeIcon}><Check size={32} aria-hidden="true" /></div>
          <p className={styles.eyebrow}>CAMPUS RUN COMPLETE</p>
          <h1>완주 기록 저장 완료</h1>
          <p className={styles.nickname}>{result.nickname}</p>
          <p className={styles.nicknameDescription}>님의 기록</p>

          {isEligible ? (
            <div className={styles.rank} aria-label={`현재 순위 ${result.rank}위`}>
              <span>현재 순위</span>
              <strong>{result.rank}위</strong>
            </div>
          ) : (
            <p className={styles.pending} role="status">CAUSW 가입 후 축제 당일 리더보드에 반영됩니다.</p>
          )}

          <dl className={styles.stats}>
            <div><dt>공식 기록</dt><dd>{formatDuration(result.officialElapsedMilliseconds)}</dd></div>
            <div><dt>오타</dt><dd>오타 {result.typoCount}회</dd></div>
          </dl>

          <CTAButton className={styles.retryButton} type="button" fullWidth onClick={retry}>다시 도전</CTAButton>
        </article>

        <aside className={styles.leaderboard} aria-labelledby="leaderboard-title">
          <div className={styles.leaderboardHeading}>
            <p className={styles.eyebrow}>TODAY'S BEST</p>
            <h2 id="leaderboard-title">Top 10</h2>
          </div>
          {leaderboardError && <p className={styles.leaderboardError} role="status">최신 리더보드를 불러오지 못했습니다.</p>}
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
        </aside>
      </section>
    </main>
  )
}

function readLastResult(): CompletionResponse | null {
  const stored = sessionStorage.getItem(LAST_RESULT_KEY)
  if (stored === null) return null

  try {
    const value: unknown = JSON.parse(stored)
    return isCompletionResponse(value) ? value : null
  } catch {
    return null
  }
}

function isCompletionResponse(value: unknown): value is CompletionResponse {
  if (!isRecord(value)
    || typeof value.recordId !== 'string'
    || typeof value.nickname !== 'string'
    || !isNonNegativeNumber(value.officialElapsedMilliseconds)
    || !isNonNegativeNumber(value.typoCount)
    || !isLeaderboard(value.leaderboard)) return false

  return (value.rankingStatus === 'ELIGIBLE' && typeof value.rank === 'number')
    || (value.rankingStatus === 'PENDING_REGISTRATION' && value.rank === null)
}

function isLeaderboard(value: unknown): value is LeaderboardEntry[] {
  return Array.isArray(value) && value.every((entry) => isRecord(entry)
    && isNonNegativeNumber(entry.rank)
    && typeof entry.nickname === 'string'
    && isNonNegativeNumber(entry.officialElapsedMilliseconds)
    && isNonNegativeNumber(entry.typoCount))
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
