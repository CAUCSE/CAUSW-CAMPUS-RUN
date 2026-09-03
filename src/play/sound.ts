const MUTE_KEY = 'cau-typing-sound-muted'
export type SoundName = 'keypress' | 'success' | 'failure' | 'countdown'

export function readMuted(): boolean { return localStorage.getItem(MUTE_KEY) === 'true' }
export function saveMuted(muted: boolean): void { localStorage.setItem(MUTE_KEY, String(muted)) }

export function playSound(name: SoundName, muted: boolean): void {
  if (muted) return
  try {
    const Context = window.AudioContext
    if (!Context) return
    const context = new Context()
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    const [frequency, duration] = name === 'success' ? [880, 0.12] : name === 'failure' ? [160, 0.16] : name === 'countdown' ? [520, 0.08] : [420, 0.035]
    oscillator.frequency.value = frequency
    gain.gain.setValueAtTime(0.06, context.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration)
    oscillator.connect(gain).connect(context.destination)
    oscillator.start()
    oscillator.stop(context.currentTime + duration)
  } catch { /* sound must never interrupt play */ }
}
