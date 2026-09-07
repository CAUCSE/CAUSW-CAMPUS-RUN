import { beforeEach, describe, expect, test, vi } from 'vitest'

describe('playSound', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  test('reuses one AudioContext across repeated game sounds', async () => {
    const { AudioContext, constructed } = createAudioContextFake()
    vi.stubGlobal('AudioContext', AudioContext)
    const { playSound } = await import('./sound')

    for (let index = 0; index < 10; index += 1) playSound('keypress', false)
    playSound('success', false)

    expect(constructed()).toBe(1)
  })

  test('resumes the shared AudioContext when the browser suspends it', async () => {
    const { AudioContext, resume } = createAudioContextFake('suspended')
    vi.stubGlobal('AudioContext', AudioContext)
    const { playSound } = await import('./sound')

    playSound('keypress', false)

    expect(resume).toHaveBeenCalledOnce()
  })
})

function createAudioContextFake(initialState: AudioContextState = 'running') {
  let constructionCount = 0
  const resume = vi.fn().mockResolvedValue(undefined)
  const connect = vi.fn().mockReturnThis()

  class FakeAudioContext {
    currentTime = 0
    destination = {}
    state = initialState

    constructor() { constructionCount += 1 }
    resume = resume
    createOscillator() {
      return { frequency: { value: 0 }, connect, start: vi.fn(), stop: vi.fn() }
    }
    createGain() {
      return {
        gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        connect,
      }
    }
  }

  return {
    AudioContext: FakeAudioContext as unknown as typeof window.AudioContext,
    constructed: () => constructionCount,
    resume,
  }
}
