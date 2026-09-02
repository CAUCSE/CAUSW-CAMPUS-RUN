import { CTAButton } from '@causw/core'
import { ErrorColored, Time } from '@causw/icons'
import { ClipboardEvent, CompositionEvent, FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react'

import { completeGameSession } from '../shared/api'
import { formatDuration } from '../shared/format'
import { clearActiveGame, readActiveGame, saveActiveGame } from '../shared/game-session'
import type { ActiveGame, CompleteSessionRequest } from '../shared/types'
import { applyCharacter, createGameState, deleteCharacter, type GameState, isCourseComplete } from './game-state'
import styles from './PlayPage.module.css'

const LAST_RESULT_KEY = 'cau-typing-last-result'

export function PlayPage() {
  const [activeGame] = useState(() => readActiveGame())
  const [gameState, setGameState] = useState(() => createResumedGameState(activeGame))
  const [now, setNow] = useState(() => Date.now())
  const [completionPayload, setCompletionPayload] = useState<CompleteSessionRequest | null>(null)
  const [saveError, setSaveError] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const completingRef = useRef(false)
  const composingRef = useRef(false)
  const expiryClearedRef = useRef(false)

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

  function expireSession() {
    if (expiryClearedRef.current) return
    expiryClearedRef.current = true
    clearActiveGame()
  }

  useEffect(() => {
    if (isExpired && !isComplete) expireSession()
  }, [isComplete, isExpired])

  async function saveCompletion(payload: CompleteSessionRequest) {
    if (isSaving) return

    setIsSaving(true)
    setSaveError(false)
    try {
      const response = await completeGameSession(game.sessionId, payload)
      sessionStorage.setItem(LAST_RESULT_KEY, JSON.stringify(response))
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

  function persistGameState(nextState: GameState) {
    saveActiveGame({
      ...game,
      currentIndex: nextState.currentIndex,
      currentInput: nextState.currentInput,
      typoCount: nextState.typoCount,
    })
  }

  function applyCommittedText(text: string) {
    if (isComplete || isExpired || Date.now() >= game.expiresAtEpochMs || isSaving) {
      if (Date.now() >= game.expiresAtEpochMs) {
        expireSession()
        setNow(Date.now())
      }
      return
    }

    let nextState = gameState
    for (const character of text) {
      if (character.length !== 1 || isCourseComplete(nextState)) break
      nextState = applyCharacter(nextState, character)
    }
    if (nextState === gameState) return

    setGameState(nextState)
    persistGameState(nextState)
    inputRef.current?.focus()
    if (isCourseComplete(nextState)) complete(nextState.typoCount)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing || composingRef.current) return
    if (isComplete || isExpired || Date.now() >= game.expiresAtEpochMs || isSaving) {
      if (Date.now() >= game.expiresAtEpochMs) {
        expireSession()
        setNow(Date.now())
      }
      return
    }

    if (event.key === 'Backspace') {
      event.preventDefault()
      const nextState = deleteCharacter(gameState)
      setGameState(nextState)
      persistGameState(nextState)
      inputRef.current?.focus()
    } else if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault()
      applyCommittedText(event.key)
    } else {
      return
    }
  }

  function handleCompositionStart() {
    composingRef.current = true
  }

  function handleCompositionEnd(event: CompositionEvent<HTMLInputElement>) {
    composingRef.current = false
    applyCommittedText(committedSuffix(event.currentTarget.value, gameState.currentInput))
  }

  function handleInput(event: FormEvent<HTMLInputElement>) {
    if (composingRef.current) return
    applyCommittedText(committedSuffix(event.currentTarget.value, gameState.currentInput))
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    event.preventDefault()
    inputRef.current?.focus()
  }

  function startNewGame() {
    clearActiveGame()
    window.location.assign('/')
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
              <CTAButton className={styles.newGameButton} type="button" onClick={startNewGame}>새 게임 시작</CTAButton>
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
                onInput={handleInput}
                onCompositionStart={handleCompositionStart}
                onCompositionEnd={handleCompositionEnd}
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
              <ErrorColored size={40} title="기록 저장 실패" />
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

function createResumedGameState(game: ActiveGame | null): GameState {
  const initial = createGameState(game?.course ?? [])
  const currentIndex = game?.currentIndex
  const currentInput = game?.currentInput
  if (game === null || typeof currentIndex !== 'number' || !Number.isInteger(currentIndex) || currentIndex < 0 || currentIndex > game.course.length
    || typeof currentInput !== 'string' || !Number.isFinite(game.typoCount) || game.typoCount < 0) return initial

  const target = game.course[currentIndex]
  if ((target === undefined && currentInput !== '') || (target !== undefined && !target.startsWith(currentInput))) return initial

  return { ...initial, currentIndex, currentInput, typoCount: game.typoCount }
}

function committedSuffix(value: string, acceptedInput: string): string {
  return value.startsWith(acceptedInput) ? value.slice(acceptedInput.length) : ''
}
