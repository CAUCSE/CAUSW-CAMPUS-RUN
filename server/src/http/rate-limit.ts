const WINDOW_MS = 60_000

interface Bucket {
  readonly timestamps: number[]
}

interface Expiry {
  readonly bucketKey: string
  readonly expiresAtMs: number
}

export class SlidingWindowRateLimiter {
  private readonly buckets = new Map<string, Bucket>()
  private readonly expirations: Expiry[] = []

  get bucketCount(): number {
    return this.buckets.size
  }

  check(scope: string, key: string, limit: number, nowMs: number): boolean {
    if (!Number.isSafeInteger(limit) || limit <= 0) return false
    if (!Number.isSafeInteger(nowMs)) return false

    this.evictExpired(nowMs)

    const bucketKey = `${scope}:${key}`
    const threshold = nowMs - WINDOW_MS
    const current = (this.buckets.get(bucketKey)?.timestamps ?? [])
      .filter((timestamp) => timestamp > threshold)

    if (current.length >= limit) {
      this.buckets.set(bucketKey, { timestamps: current })
      return false
    }

    current.push(nowMs)
    this.buckets.set(bucketKey, { timestamps: current })
    this.pushExpiry({ bucketKey, expiresAtMs: nowMs + WINDOW_MS })
    return true
  }

  private evictExpired(nowMs: number): void {
    while (this.expirations[0]?.expiresAtMs <= nowMs) {
      const expired = this.popExpiry()
      if (!expired) return

      const bucket = this.buckets.get(expired.bucketKey)
      if (!bucket) continue

      const active = bucket.timestamps.filter((timestamp) => timestamp > nowMs - WINDOW_MS)
      if (active.length === 0) {
        this.buckets.delete(expired.bucketKey)
      } else {
        this.buckets.set(expired.bucketKey, { timestamps: active })
      }
    }
  }

  private pushExpiry(expiry: Expiry): void {
    this.expirations.push(expiry)
    let index = this.expirations.length - 1
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2)
      if (this.expirations[parent].expiresAtMs <= expiry.expiresAtMs) break
      this.expirations[index] = this.expirations[parent]
      index = parent
    }
    this.expirations[index] = expiry
  }

  private popExpiry(): Expiry | undefined {
    const first = this.expirations[0]
    const last = this.expirations.pop()
    if (!first || !last || this.expirations.length === 0) return first

    let index = 0
    while (true) {
      const left = index * 2 + 1
      const right = left + 1
      if (left >= this.expirations.length) break
      const child = right < this.expirations.length
        && this.expirations[right].expiresAtMs < this.expirations[left].expiresAtMs
        ? right
        : left
      if (this.expirations[child].expiresAtMs >= last.expiresAtMs) break
      this.expirations[index] = this.expirations[child]
      index = child
    }
    this.expirations[index] = last
    return first
  }
}
