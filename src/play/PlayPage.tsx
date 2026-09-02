import { CTAButton } from '@causw/core'
import { Time } from '@causw/icons'
import { KeyboardEvent, useEffect, useRef, useState } from 'react'

import { completeGameSession } from '../shared/api'
import { formatDuration } from '../shared/format'
import { clearActiveGame, readActiveGame } from '../shared/game-session'
import type { CompleteSessionRequest, CompletionResponse } from '../shared/types'
import { applyCharacter, createGameState, deleteCharacter, isCourseComplete } from './game-state'
import styles from './PlayPage.module.css'

const LAST_RESULT_KEY = 'cau-typing-last-result'

type LastResult = {
  // The completion response remains intact here because the result page needs
  // its official score, nullable rank, and registration status.
  entry: CompletionResponse
  leaderboard: CompletionResponse['leaderboard']
}

export function PlayPage() {
  const [activeGame] = useState(() => readActiveGame())
  const [gameState, setGameState] = useState(() => createGameState(activeGame?.course ?? []))
  const [now, setNow] = useState(() => Date.now())
  const [completionPayload, setCompletionPayload] = useState<CompleteSessionRequest | null>(null)
  const [saveError, setSaveError] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const completingRef = useRef(false)

  useEffect(() => {
    if (activeGame === null) {
      window.location.replace('/')
      return
    }

    inputRef.current?.focus()
    const interval = window.setInterval(() => setNow(Date.now()), 10)
    return () => window.clearInterval(interval)
  }, [activeGame])

  if (activeGame === null) return null

  const game = activeGame
  const elapsedMilliseconds = Math.max(0, now - game.startedAtEpochMs)
  const isExpired = now >= game.expiresAtEpochMs
  const isComplete = isCourseComplete(gameState)
  const target = gameState.course[gameState.currentIndex]

  async function saveCompletion(payload: CompleteSessionRequest) {
    if (isSaving) return

    setIsSaving(true)
    setSaveError(false)
    try {
      const response = await completeGameSession(game.sessionId, payload)
      const result: LastResult = { entry: response, leaderboard: response.leaderboard }
      sessionStorage.setItem(LAST_RESULT_KEY, JSON.stringify(result))
      clearActiveGame()
      window.location.assign('/result.html')
    } catch {
      setSaveError(true)
      setIsSaving(false)
    }
  }

  function complete(nextTypoCount: number) {
    if (completingRef.current) return
    completingRef.current = true
    const payload = {
      reportedElapsedMilliseconds: Math.max(0, Date.now() - game.startedAtEpochMs),
      typoCount: nextTypoCount,
    }
    setCompletionPayload(payload)
    void saveCompletion(payload)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (isComplete || isExpired || isSaving) return

    let nextState = gameState
    if (event.key === 'Backspace') {
      event.preventDefault()
      nextState = deleteCharacter(gameState)
    } else if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault()
      nextState = applyCharacter(gameState, event.key)
    } else {
      return
    }

    setGameState(nextState)
    inputRef.current?.focus()
    if (isCourseComplete(nextState)) complete(nextState.typoCount)
  }

  function handlePaste(event: React.ClipboardEvent<HTMLInputElement>) {
    event.preventDefault()
    inputRef.current?.focus()
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <img className={styles.logo} src="/images/ccssaa-logo.png" alt="CAUSW" width="224" height="34" />
        <span className={styles.headerDivider} aria-hidden="true" />
        <span className={styles.wordmark}>CAU CAMPUS RUN</span>
      </header>

      <section className={styles.game} aria-label="캠퍼스 타이핑 게임">
        <div className={styles.statusBar}>
          <p className={styles.progress}>{Math.min(gameState.currentIndex + 1, gameState.course.length)} / {gameState.course.length}</p>
          <p className={styles.timer}><Time size={24} aria-hidden="true" /> {formatDuration(elapsedMilliseconds)}</p>
          <p className={styles.typos}>오타 {gameState.typoCount}회</p>
        </div>

        <article className={styles.typingCard}>
          {isComplete ? (
            <>
              <p className={styles.eyebrow}>CAMPUS RUN COMPLETE</p>
              <h1>완주했습니다</h1>
              <p className={styles.completedDescription}>기록을 저장하고 있습니다.</p>
            </>
          ) : isExpired ? (
            <>
              <p className={styles.eyebrow}>SESSION EXPIRED</p>
              <h1>게임 시간이 만료되었습니다</h1>
              <p className={styles.completedDescription}>새 게임을 시작해 다시 도전해 주세요.</p>
            </>
          ) : (
            <>
              <p className={styles.eyebrow}>NEXT PLACE</p>
              <h1>{target}</h1>
              <label className={styles.inputLabel} htmlFor="place-input">장소 입력</label>
              <input
                ref={inputRef}
                id="place-input"
                className={styles.input}
                value={gameState.currentInput}
                onChange={() => undefined}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                inputMode="text"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                aria-describedby={gameState.lastMistypedCharacter ? 'typing-error' : undefined}
              />
              {gameState.lastMistypedCharacter && <p id="typing-error" className={styles.error} role="alert">{gameState.lastMistypedCharacter}</p>}
            </>
          )}

          {saveError && (
            <div className={styles.saveError} role="alert">
              <p>기록 저장에 실패했습니다. 다시 시도해 주세요.</p>
              <CTAButton type="button" onClick={() => completionPayload && void saveCompletion(completionPayload)} disabled={isSaving}>
                다시 저장
              </CTAButton>
            </div>
          )}
        </article>
      </section>
    </main>
  )
}
