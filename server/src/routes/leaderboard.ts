import type { FastifyInstance } from 'fastify'
import type { ServerConfig } from '../config.js'
import type { SessionRecordRepository } from '../database/repositories.js'
import { SlidingWindowRateLimiter } from '../http/rate-limit.js'
import { ipRateLimit } from '../http/ip-rate-limit.js'

const SUCCESS_MESSAGE = 'Request completed successfully.'

interface LeaderboardRoutesOptions {
  readonly config: ServerConfig
  readonly repository: SessionRecordRepository
  readonly now: () => number
  readonly rateLimiter: SlidingWindowRateLimiter
}

export function registerLeaderboardRoutes(app: FastifyInstance, options: LeaderboardRoutesOptions): void {
  app.get('/api/v2/campus-typing/leaderboard', {
    onRequest: ipRateLimit(options, 'leaderboard:ip', 120),
  }, async () => {
    const nowMs = options.now()
    // This endpoint always exposes the same top ten; query parameters are ignored.
    const entries = options.repository.getLeaderboard(10).map((record) => ({
      rank: record.rank,
      nickname: record.nickname,
      officialElapsedMilliseconds: record.officialElapsedMilliseconds,
      typoCount: record.typoCount,
    }))

    return {
      code: 'SUCCESS',
      message: SUCCESS_MESSAGE,
      data: { entries, updatedAt: new Date(nowMs).toISOString() },
    }
  })
}
