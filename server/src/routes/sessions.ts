import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { PRIVACY_CONSENT_VERSION, THIRD_PARTY_CONSENT_VERSION } from '../consent.js'
import { CAMPUS_COURSE } from '../course.js'
import type { ServerConfig } from '../config.js'
import type { SessionRecordRepository } from '../database/repositories.js'
import { HttpError } from '../http/errors.js'
import { SlidingWindowRateLimiter } from '../http/rate-limit.js'
import { encryptContact } from '../security/contact-encryption.js'
import { dailyIpHash, studentHash } from '../security/identity.js'
import { CompleteSessionInputSchema, CreateSessionInputSchema } from '../validation.js'

const SESSION_TTL_MS = 600_000
const SUCCESS_MESSAGE = 'Request completed successfully.'

interface SessionRoutesOptions {
  readonly config: ServerConfig
  readonly repository: SessionRecordRepository
  readonly now: () => number
  readonly rateLimiter: SlidingWindowRateLimiter
}

function rejectWhenLimited(
  rateLimiter: SlidingWindowRateLimiter,
  scope: string,
  key: string,
  limit: number,
  nowMs: number,
): void {
  if (!rateLimiter.check(scope, key, limit, nowMs)) {
    throw new HttpError(429, 'TYPING_RATE_LIMITED', 'Too many requests. Please try again later.')
  }
}

export function registerSessionRoutes(app: FastifyInstance, options: SessionRoutesOptions): void {
  app.post('/api/v2/campus-typing/sessions', async (request) => {
    const input = CreateSessionInputSchema.parse(request.body)
    const nowMs = options.now()
    const ipHash = dailyIpHash(request.ip, nowMs, options.config.studentHmacKey)
    const normalizedStudentHash = studentHash(input.studentNumber, options.config.studentHmacKey)

    rejectWhenLimited(options.rateLimiter, 'session:create:ip', ipHash, 10, nowMs)
    rejectWhenLimited(options.rateLimiter, 'session:create:student', normalizedStudentHash, 3, nowMs)

    const sessionId = randomUUID()
    const expiresAtMs = nowMs + SESSION_TTL_MS
    options.repository.createSession({
      id: sessionId,
      studentHash: normalizedStudentHash,
      nickname: input.nickname,
      email: encryptContact(input.email, sessionId, 'email', options.config.emailEncryptionKey),
      phone: encryptContact(input.phoneNumber, sessionId, 'phone', options.config.emailEncryptionKey),
      privacyConsentVersion: PRIVACY_CONSENT_VERSION,
      thirdPartyConsentVersion: THIRD_PARTY_CONSENT_VERSION,
      consentedAtMs: nowMs,
      course: CAMPUS_COURSE,
      startedAtMs: nowMs,
      expiresAtMs,
      createdIpHash: ipHash,
    })

    return {
      code: 'SUCCESS',
      message: SUCCESS_MESSAGE,
      data: {
        sessionId,
        course: CAMPUS_COURSE,
        startedAt: new Date(nowMs).toISOString(),
        expiresAt: new Date(expiresAtMs).toISOString(),
      },
    }
  })

  app.post('/api/v2/campus-typing/sessions/:sessionId/completion', async (request) => {
    const input = CompleteSessionInputSchema.parse(request.body)
    const nowMs = options.now()
    const ipHash = dailyIpHash(request.ip, nowMs, options.config.studentHmacKey)
    rejectWhenLimited(options.rateLimiter, 'session:completion:ip', ipHash, 30, nowMs)

    const sessionId = (request.params as { sessionId: string }).sessionId
    const record = options.repository.completeSession(
      sessionId,
      input.reportedElapsedMilliseconds,
      input.typoCount,
      nowMs,
    )
    const leaderboard = options.repository.getLeaderboard(10).map(toPublicEntry)

    return {
      code: 'SUCCESS',
      message: SUCCESS_MESSAGE,
      data: {
        recordId: record.id,
        nickname: record.nickname,
        officialElapsedMilliseconds: record.officialElapsedMilliseconds,
        typoCount: record.typoCount,
        rankingStatus: 'ELIGIBLE' as const,
        rank: options.repository.getStudentRank(record.studentHash),
        leaderboard,
      },
    }
  })
}

function toPublicEntry(record: {
  rank: number
  nickname: string
  officialElapsedMilliseconds: number
  typoCount: number
}) {
  return {
    rank: record.rank,
    nickname: record.nickname,
    officialElapsedMilliseconds: record.officialElapsedMilliseconds,
    typoCount: record.typoCount,
  }
}
