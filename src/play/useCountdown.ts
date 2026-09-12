import { useEffect, useState } from 'react'

export function useCountdown(startsAtEpochMs: number) {
  const [now, setNow] = useState(Date.now)
  const remaining = Math.max(0, Math.ceil((startsAtEpochMs - now) / 1_000))

  useEffect(() => {
    setNow(Date.now())
    const millisecondsUntilStart = startsAtEpochMs - Date.now()
    if (millisecondsUntilStart <= 0) return
    const timer = window.setTimeout(
      () => setNow(Date.now()),
      Math.min(1_000, millisecondsUntilStart),
    )
    return () => window.clearTimeout(timer)
  }, [now, startsAtEpochMs])

  return { remaining, isPlaying: now >= startsAtEpochMs }
}
