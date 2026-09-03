import { useEffect, useState } from 'react'

export function useCountdown() {
  const [remaining, setRemaining] = useState(3)
  useEffect(() => {
    if (remaining === 0) return
    const timer = window.setTimeout(() => setRemaining((value) => value - 1), 1_000)
    return () => window.clearTimeout(timer)
  }, [remaining])
  return { remaining, isPlaying: remaining === 0 }
}
