const WINDOW_MS = 60_000

export class SlidingWindowRateLimiter {
  private readonly buckets = new Map<string, number[]>()

  check(scope: string, key: string, limit: number, nowMs: number): boolean {
    if (!Number.isSafeInteger(limit) || limit <= 0) return false
    if (!Number.isSafeInteger(nowMs)) return false

    const bucketKey = `${scope}:${key}`
    const threshold = nowMs - WINDOW_MS
    const current = (this.buckets.get(bucketKey) ?? []).filter((timestamp) => timestamp > threshold)

    if (current.length >= limit) {
      this.replaceOrDelete(bucketKey, current)
      return false
    }

    current.push(nowMs)
    this.buckets.set(bucketKey, current)
    return true
  }

  private replaceOrDelete(bucketKey: string, timestamps: number[]): void {
    if (timestamps.length === 0) {
      this.buckets.delete(bucketKey)
      return
    }
    this.buckets.set(bucketKey, timestamps)
  }
}
