import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { ServerConfig } from '../config.js'
import { toWinnerCsv, type WinnerRow } from '../csv.js'
import type { SessionRecordRepository } from '../database/repositories.js'
import { HttpError } from '../http/errors.js'
import { SlidingWindowRateLimiter } from '../http/rate-limit.js'
import { decryptContact } from '../security/contact-encryption.js'
import { hasValidAdminBearerToken } from '../security/admin-auth.js'
import { ipRateLimit } from '../http/ip-rate-limit.js'

const SUCCESS_MESSAGE = 'Request completed successfully.'
const ADMIN_LIMIT_PER_MINUTE = 10
const DELETE_CONFIRMATION = 'DELETE ALL CAMPUS TYPING DATA'
const DeleteAllDataSchema = z.object({
  confirmation: z.literal(DELETE_CONFIRMATION),
}).strict()

interface AdminRoutesOptions {
  readonly config: ServerConfig
  readonly repository: SessionRecordRepository
  readonly now: () => number
  readonly rateLimiter: SlidingWindowRateLimiter
}

function requireAdmin(request: FastifyRequest, options: AdminRoutesOptions): void {
  if (!hasValidAdminBearerToken(request.headers.authorization, options.config.adminToken)) {
    throw new HttpError(401, 'TYPING_ADMIN_UNAUTHORIZED', 'Administrator authentication is required.')
  }
}

function toWinnerRow(record: ReturnType<SessionRecordRepository['getBestRecordsWithContacts']>[number], config: ServerConfig): WinnerRow {
  return {
    rank: record.rank,
    studentHash: record.studentHash,
    nickname: record.nickname,
    email: decryptContact(record.email, record.sessionId, 'email', config.emailEncryptionKey),
    phoneNumber: decryptContact(record.phone, record.sessionId, 'phone', config.emailEncryptionKey),
    officialElapsedMilliseconds: record.officialElapsedMilliseconds,
    typoCount: record.typoCount,
    completedAt: new Date(record.completedAtMs).toISOString(),
    privacyConsentVersion: record.privacyConsentVersion,
    thirdPartyConsentVersion: record.thirdPartyConsentVersion,
    consentedAt: new Date(record.consentedAtMs).toISOString(),
  }
}

export function registerAdminRoutes(app: FastifyInstance, options: AdminRoutesOptions): void {
  const onRequest = [
    ipRateLimit(options, 'admin:ip', ADMIN_LIMIT_PER_MINUTE),
    async (request: FastifyRequest) => { requireAdmin(request, options) },
  ]
  app.get('/api/v2/admin/campus-typing/records.csv', { onRequest }, async (_request, reply) => {
    const rows = options.repository.getBestRecordsWithContacts().map((record) => toWinnerRow(record, options.config))

    reply
      .header('cache-control', 'no-store, max-age=0')
      .header('pragma', 'no-cache')
      .header('expires', '0')
      .header('content-disposition', 'attachment; filename="campus-typing-records.csv"')
      .type('text/csv; charset=utf-8')
    return reply.send(toWinnerCsv(rows))
  })

  app.delete('/api/v2/admin/campus-typing/records', { onRequest }, async (request) => {
    DeleteAllDataSchema.parse(request.body)
    const deleted = options.repository.deleteAllData()

    return {
      code: 'SUCCESS',
      message: SUCCESS_MESSAGE,
      data: deleted,
    }
  })
}
