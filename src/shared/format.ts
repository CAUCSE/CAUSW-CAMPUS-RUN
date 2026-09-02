export function formatDuration(milliseconds: number): string {
  const safeMilliseconds = Number.isFinite(milliseconds) ? Math.max(0, milliseconds) : 0
  const totalCentiseconds = Math.floor(safeMilliseconds / 10)
  const minutes = Math.floor(totalCentiseconds / 6_000)
  const seconds = Math.floor(totalCentiseconds / 100) % 60
  const centiseconds = totalCentiseconds % 100

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`
}
