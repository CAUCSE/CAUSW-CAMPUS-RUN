import { CTAButton } from '@causw/core'
import { ErrorColored, Time } from '@causw/icons'
import { ClipboardEvent, CompositionEvent, FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react'

import { completeGameSession } from '../shared/api'
import { formatDuration } from '../shared/format'
import { clearActiveGame, readActiveGame, saveActiveGame } from '../shared/game-session'
import { completeLocalGame } from '../shared/local-game'
import type { ActiveGame, CompleteSessionRequest } from '../shared/types'
import { applyCharacter, createGameState, deleteCharacter, type GameState, isCourseComplete } from './game-state'
import styles from './PlayPage.module.css'

const LAST_RESULT_KEY = 'cau-typing-last-result'
const DEBUG_ENABLED = import.meta.env.VITE_TYPING_GAME_DEBUG === 'true'

export function PlayPage() {
  const [activeGame] = useState(() => readActiveGame())
  const [gameState, setGameState] = useState(() => createResumedGameState(activeGame))
  const [inputValue, setInputValue] = useState(() => createResumedGameState(activeGame).currentInput)
  const [now, setNow] = useState(() => Date.now())
  const [completionPayload, setCompletionPayload] = useState<CompleteSessionRequest | null>(null)
  const [saveError, setSaveError] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const completingRef = useRef(false)
  const composingRef = useRef(false)
  const compositionCommitRef = useRef<string | null>(null)
  const expiryClearedRef = useRef(false)

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
    debug('game-state-persist', stateSnapshot(nextState))
    saveActiveGame({
      ...game,
      currentIndex: nextState.currentIndex,
      currentInput: nextState.currentInput,
      typoCount: nextState.typoCount,
    })
  }

  function applyCommittedText(text: string) {
    debug('committed-text-received', { text, ...stateSnapshot(gameState), isSaving, isExpired })
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

    debug('committed-text-applied', { text, before: stateSnapshot(gameState), after: stateSnapshot(nextState) })
    setGameState(nextState)
    setInputValue(nextState.currentInput)

    // IME 조합(composition)은 React의 재렌더를 기다리지 않고 DOM에 직접 글자를
    // 그려버릴 수 있다. 오타일 경우 nextState.currentInput이 이전 값과 동일해서
    // React가 값이 안 바뀌었다고 보고 DOM 동기화를 건너뛸 수 있으므로,
    // 여기서 즉시(같은 tick 안에서) 실제 <input> DOM 값을 강제로 되돌려서
    // 오타 글자가 화면에 그려지는 것 자체를 막는다.
    if (inputRef.current) {
      inputRef.current.value = nextState.currentInput
    }

    persistGameState(nextState)
    inputRef.current?.focus()
    if (isCourseComplete(nextState)) complete(nextState.typoCount)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    debug('keydown', {
      key: event.key,
      code: event.code,
      isComposing: event.nativeEvent.isComposing,
      composingRef: composingRef.current,
      inputValue: event.currentTarget.value,
    })
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
      setInputValue(nextState.currentInput)
      persistGameState(nextState)
      inputRef.current?.focus()
    } else if (isHangulJamo(event.key)) {
      // Korean IMEs can emit the first jamo before compositionstart. Let the
      // browser finish composing it; handleCompositionEnd receives the final syllable.
      debug('keydown-hangul-jamo-deferred', { key: event.key })
      return
    } else if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault()
      applyCommittedText(event.key)
    } else {
      return
    }
  }

  function handleCompositionStart() {
    debug('composition-start', { inputValue: inputRef.current?.value ?? '' })
    composingRef.current = true
  }

  function handleCompositionEnd(event: CompositionEvent<HTMLInputElement>) {
    composingRef.current = false
    const committedText = event.data
    debug('composition-end', { data: committedText, inputValue: event.currentTarget.value })
    if (committedText.length === 0) return

    compositionCommitRef.current = committedText
    queueMicrotask(() => { compositionCommitRef.current = null })
    applyCommittedText(committedText)
  }

  function handleInput(event: FormEvent<HTMLInputElement>) {
    const committedText = (event.nativeEvent as InputEvent).data
    debug('input', {
      data: committedText,
      inputType: (event.nativeEvent as InputEvent).inputType,
      isComposing: (event.nativeEvent as InputEvent).isComposing,
      composingRef: composingRef.current,
      inputValue: event.currentTarget.value,
    })
    if (composingRef.current) return
    if (typeof committedText === 'string' && committedText.length > 0) {
      if (compositionCommitRef.current === committedText) return
      applyCommittedText(committedText)
      return
    }
    applyCommittedText(committedSuffix(event.currentTarget.value, gameState.currentInput))
  }

  function handleChange(event: FormEvent<HTMLInputElement>) {
    debug('change', { inputValue: event.currentTarget.value, composingRef: composingRef.current })
    setInputValue(event.currentTarget.value)
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    debug('paste-blocked', { textLength: event.clipboardData.getData('text').length })
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
                value={inputValue}
                onChange={handleChange}
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

function isHangulJamo(key: string): boolean {
  return key.length === 1 && /[\u1100-\u11ff\u3130-\u318f]/u.test(key)
}

function stateSnapshot(state: GameState) {
  return {
    currentIndex: state.currentIndex,
    currentInput: state.currentInput,
    typoCount: state.typoCount,
    lastMistypedCharacter: state.lastMistypedCharacter,
  }
}

function debug(event: string, details: Record<string, unknown>): void {
  if (DEBUG_ENABLED) console.debug(`[CAU Campus Typing] ${event}`, details)
}
