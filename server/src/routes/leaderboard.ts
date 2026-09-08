import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { ServerConfig } from '../config.js'
import type { SessionRecordRepository } from '../database/repositories.js'
import { HttpError } from '../http/errors.js'
import { SlidingWindowRateLimiter } from '../http/rate-limit.js'
import { dailyIpHash } from '../security/identity.js'

const SUCCESS_MESSAGE = 'Request completed successfully.'
const LeaderboardQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
}).strict()

interface LeaderboardRoutesOptions {
  readonly config: ServerConfig
  readonly repository: SessionRecordRepository
  readonly now: () => number
  readonly rateLimiter: SlidingWindowRateLimiter
}

export function registerLeaderboardRoutes(app: FastifyInstance, options: LeaderboardRoutesOptions): void {
  app.get('/api/v2/campus-typing/leaderboard', async (request) => {
    const nowMs = options.now()
    const ipHash = dailyIpHash(request.ip, nowMs, options.config.studentHmacKey)
    if (!options.rateLimiter.check('leaderboard:ip', ipHash, 120, nowMs)) {
      throw new HttpError(429, 'TYPING_RATE_LIMITED', 'Too many requests. Please try again later.')
    }

    const { limit = 10 } = LeaderboardQuerySchema.parse(request.query)
    const entries = options.repository.getLeaderboard(limit).map((record) => ({
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
