import type { FastifyRequest } from 'fastify'
import type { ServerConfig } from '../config.js'
import { dailyIpHash } from '../security/identity.js'
import { HttpError } from './errors.js'
import type { SlidingWindowRateLimiter } from './rate-limit.js'

interface IpRateLimitOptions {
  readonly config: Pick<ServerConfig, 'studentHmacKey'>
  readonly now: () => number
  readonly rateLimiter: SlidingWindowRateLimiter
}

// Attach to onRequest: parser failures and rejected credentials consume the
// same IP allowance as successful requests, before any body or database work.
export function ipRateLimit(options: IpRateLimitOptions, scope: string, limit: number) {
  return async (request: FastifyRequest): Promise<void> => {
    const nowMs = options.now()
    const ipHash = dailyIpHash(request.ip, nowMs, options.config.studentHmacKey)
    if (!options.rateLimiter.check(scope, ipHash, limit, nowMs)) {
      throw new HttpError(429, 'TYPING_RATE_LIMITED', 'Too many requests. Please try again later.')
    }
  }
}
