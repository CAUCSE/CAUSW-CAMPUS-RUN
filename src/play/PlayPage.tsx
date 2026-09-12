import { CTAButton } from '@causw/core'
import { ErrorColored, Time } from '@causw/icons'
import { ChangeEvent, ClipboardEvent, KeyboardEvent, useEffect, useRef, useState } from 'react'

import { completeGameSession } from '../shared/api'
import { formatDuration } from '../shared/format'
import { clearActiveGame, readActiveGame, saveActiveGame } from '../shared/game-session'
import { completeLocalGame } from '../shared/local-game'
import type { ActiveGame, CompleteSessionRequest } from '../shared/types'
import { calculateTypingSpeed, countCorrectTypingStrokes, createGameState, MAX_TYPING_SPEED, setCurrentInput, submitCurrentInput, type GameState, isCourseComplete } from './game-state'
import { playSound, readMuted, saveMuted } from './sound'
import { useCountdown } from './useCountdown'
import styles from './PlayPage.module.css'

const LAST_RESULT_KEY = 'cau-typing-last-result'
const DEBUG_ENABLED = import.meta.env.VITE_TYPING_GAME_DEBUG === 'true'

export function PlayPage() {
  const [activeGame] = useState(() => readActiveGame())
  const [gameState, setGameState] = useState(() => createResumedGameState(activeGame))
  const [muted, setMuted] = useState(readMuted)
  const [now, setNow] = useState(() => Date.now())
  const [completionPayload, setCompletionPayload] = useState<CompleteSessionRequest | null>(null)
  const [saveError, setSaveError] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const completingRef = useRef(false)
  const expiryClearedRef = useRef(false)
  const typingBaselineRef = useRef(countCorrectTypingStrokes(gameState))
  const { remaining, isPlaying } = useCountdown(activeGame?.startedAtEpochMs ?? now)

  useEffect(() => {
    debug('active-game', activeGame === null ? { found: false } : {
      found: true,
      sessionId: activeGame.sessionId,
      courseLength: activeGame.course.length,
      currentIndex: activeGame.currentIndex ?? 0,
      isTestMode: activeGame.isTestMode === true,
    })
    if (activeGame === null) {
      window.location.replace('/')
      return
    }

    if (!isPlaying) return
    inputRef.current?.focus()
    const interval = window.setInterval(() => setNow(Date.now()), 10)
    return () => window.clearInterval(interval)
  }, [activeGame, isPlaying])

  if (activeGame === null) return null

  const game = activeGame
  const elapsedMilliseconds = completionPayload?.reportedElapsedMilliseconds
    ?? (isPlaying ? Math.max(0, now - game.startedAtEpochMs) : 0)
  const isExpired = now >= game.expiresAtEpochMs
  const isComplete = isCourseComplete(gameState)
  const target = gameState.course[gameState.currentIndex]
  const typingSpeed = calculateTypingSpeed(gameState, elapsedMilliseconds, typingBaselineRef.current)
  const gaugeRatio = Math.min(Math.max(typingSpeed / MAX_TYPING_SPEED, 0), 1)

  function expireSession() {
    if (expiryClearedRef.current) return
    expiryClearedRef.current = true
    debug('session-expired', { elapsedMilliseconds, isComplete })
    clearActiveGame()
  }

  useEffect(() => {
    if (isExpired && !isComplete) expireSession()
  }, [isComplete, isExpired])

  async function saveCompletion(payload: CompleteSessionRequest) {
    if (isSaving) return

    debug('completion-save-start', { ...payload, isTestMode: game.isTestMode === true })
    setIsSaving(true)
    setSaveError(false)
    try {
      const response = game.isTestMode
        ? completeLocalGame(game.nickname, payload)
        : await completeGameSession(game.sessionId, payload)
      sessionStorage.setItem(LAST_RESULT_KEY, JSON.stringify(response))
      debug('completion-save-success', { recordId: response.recordId, rankingStatus: response.rankingStatus })
      clearActiveGame()
      window.location.assign('/result.html')
    } catch (error) {
      debug('completion-save-error', { message: error instanceof Error ? error.message : String(error) })
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
    debug('game-state-persist', { currentIndex: nextState.currentIndex, currentInput: nextState.currentInput, typoCount: nextState.typoCount })
    saveActiveGame({
      ...game,
      currentIndex: nextState.currentIndex,
      currentInput: nextState.currentInput,
      typoCount: nextState.typoCount,
    })
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!isPlaying || event.nativeEvent.isComposing || event.key !== 'Enter' || isSaving) return
    event.preventDefault()
    const result = submitCurrentInput(gameState)
    setGameState(result.state)
    persistGameState(result.state)
    playSound(result.submission === 'failure' ? 'failure' : 'success', muted)
    if (result.submission === 'complete') complete(result.state.typoCount)
    inputRef.current?.focus()
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    if (!isPlaying) return
    const nextState = setCurrentInput(gameState, event.target.value)
    setGameState(nextState)
    persistGameState(nextState)
    playSound('keypress', muted)
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    debug('paste-blocked', { textLength: event.clipboardData.getData('text').length })
    event.preventDefault()
    inputRef.current?.focus()
  }

  function toggleMuted() { const next = !muted; setMuted(next); saveMuted(next) }

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
        <button className={styles.muteButton} type="button" onClick={toggleMuted} aria-pressed={muted} aria-label={muted ? '효과음 켜기' : '효과음 끄기'}>{muted ? '🔇' : '🔊'}</button>
      </header>

      <section className={styles.game} aria-label="캠퍼스 타이핑 게임">
        <div className={styles.statusPanel}>
          <div className={styles.speedometer} aria-label="현재 타수">
            <svg className={styles.gauge} viewBox="0 0 120 72" aria-hidden="true">
              <path className={styles.gaugeTrack} pathLength="100" d="M 12 60 A 48 48 0 0 1 108 60" />
              <path className={styles.gaugeValue} pathLength="100" strokeDasharray={`${gaugeRatio * 100} 100`} d="M 12 60 A 48 48 0 0 1 108 60" />
              <line className={styles.gaugeNeedle} x1="60" y1="60" x2="60" y2="24" style={{ transform: `rotate(${gaugeRatio * 180 - 90}deg)` }} />
              <circle className={styles.gaugeHub} cx="60" cy="60" r="4" />
            </svg>
            <div className={styles.speedValue}><strong>{typingSpeed}</strong><span>타/분</span></div>
          </div>
          <div className={styles.statusDetails}>
            <p className={styles.timer}><span>진행시간</span><strong><Time size={20} aria-hidden="true" /> {formatDuration(elapsedMilliseconds)}</strong></p>
            <div className={styles.statusSummary}>
              <p className={styles.progress}>{Math.min(gameState.currentIndex + 1, gameState.course.length)} / {gameState.course.length}</p>
              <p className={styles.typos}>오타 {gameState.typoCount}회</p>
            </div>
          </div>
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
              <div className={styles.inputWrap}>
                <div className={styles.inputOverlay} aria-hidden="true">{[...gameState.currentInput].map((character, index) => <span key={index} className={character === target?.[index] ? undefined : styles.mistyped}>{character}</span>)}</div>
                <input ref={inputRef} id="place-input" className={styles.input} value={gameState.currentInput} onChange={handleChange} onKeyDown={handleKeyDown} onPaste={handlePaste} disabled={!isPlaying} inputMode="text" autoComplete="off" autoCapitalize="off" spellCheck={false} />
              </div>
              <p className={styles.error} role="status">Enter를 눌러 제출하세요.</p>
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
        {!isPlaying && <div className={styles.countdown} aria-live="assertive"><strong>{remaining > 0 ? remaining : 'START!'}</strong></div>}
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

  if (currentIndex === game.course.length && currentInput !== '') return initial

  return { ...initial, currentIndex, currentInput, typoCount: game.typoCount }
}

function debug(event: string, details: Record<string, unknown>): void {
  if (DEBUG_ENABLED) console.debug(`[CAU Campus Typing] ${event}`, details)
}
