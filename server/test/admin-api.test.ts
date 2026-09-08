import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, test } from 'vitest'
import Database from 'better-sqlite3'
import { buildApp } from '../src/app.js'
import { CAMPUS_COURSE } from '../src/course.js'
import type { ServerConfig } from '../src/config.js'
import { escapeCsvCell, toWinnerCsv } from '../src/csv.js'
import { runMigrations } from '../src/database/migrations.js'
import { createRepository, type SessionRecordRepository } from '../src/database/repositories.js'
import { SlidingWindowRateLimiter } from '../src/http/rate-limit.js'
import { encryptContact } from '../src/security/contact-encryption.js'

const csvUrl = '/api/v2/admin/campus-typing/records.csv'
const deleteUrl = '/api/v2/admin/campus-typing/records'
const adminToken = 'admin-token-with-at-least-32-bytes!'
const config: ServerConfig = {
  host: '127.0.0.1',
  port: 0,
  databasePath: ':memory:',
  allowedOrigins: ['https://typing.example'],
  studentHmacKey: 'student-hmac-key-with-at-least-32-bytes',
  emailEncryptionKey: Buffer.alloc(32, 7),
  adminToken,
  trustProxy: 0,
}

const apps: Array<{ app: ReturnType<typeof buildApp>; db: Database.Database }> = []

function createApp(now: () => number = () => Date.UTC(2026, 8, 8, 12, 0, 0)) {
  const db = new Database(':memory:')
  runMigrations(db, fileURLToPath(new URL('../migrations/', import.meta.url)))
  const repository = createRepository(db)
  const app = buildApp({
    config,
    repository,
    now,
    rateLimiter: new SlidingWindowRateLimiter(),
  })
  apps.push({ app, db })
  return { app, repository, db }
}

function seedWinningRecord(repository: SessionRecordRepository, overrides: {
  studentHash?: string
  nickname?: string
  email?: string
  phone?: string
  startedAtMs?: number
  completedAtMs?: number
} = {}) {
  const sessionId = randomUUID()
  const startedAtMs = overrides.startedAtMs ?? Date.UTC(2026, 8, 8, 12, 0, 0)
  const completedAtMs = overrides.completedAtMs ?? startedAtMs + 18_000
  repository.createSession({
    id: sessionId,
    studentHash: overrides.studentHash ?? 'student-hash-for-admin-test',
    nickname: overrides.nickname ?? 'winner',
    email: encryptContact(overrides.email ?? 'winner@example.com', sessionId, 'email', config.emailEncryptionKey),
    phone: encryptContact(overrides.phone ?? '01012345678', sessionId, 'phone', config.emailEncryptionKey),
    privacyConsentVersion: '2026-09-08',
    thirdPartyConsentVersion: '2026-09-08',
    consentedAtMs: startedAtMs,
    course: CAMPUS_COURSE,
    startedAtMs,
    expiresAtMs: startedAtMs + 600_000,
    createdIpHash: 'daily-ip-hash',
  })
  repository.completeSession(sessionId, 18_000, 2, completedAtMs)
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map(async ({ app, db }) => {
    await app.close()
    db.close()
  }))
})

describe('admin records API', () => {
  test('escapes formula-leading and delimiter-containing CSV cells', () => {
    for (const value of ['=1+1', '+1', '-1', '@name', '\tformula']) {
      expect(escapeCsvCell(value)).toBe(`'${value}`)
    }
    expect(escapeCsvCell('\rformula')).toBe("\"'\rformula\"")
    expect(escapeCsvCell('one,two')).toBe('"one,two"')
    expect(escapeCsvCell('say "yes"')).toBe('"say ""yes"""')
    expect(toWinnerCsv([])).toBe('\uFEFFrank,studentHash,nickname,email,phoneNumber,officialElapsedMilliseconds,typoCount,completedAt,privacyConsentVersion,thirdPartyConsentVersion,consentedAt\r\n')
  })

  test('exports authenticated best records with decrypted contacts and consent audit data', async () => {
    const { app, repository } = createApp()
    seedWinningRecord(repository)

    const response = await app.inject({
      method: 'GET',
      url: csvUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    })

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toContain('text/csv')
    expect(response.headers['content-disposition']).toBe('attachment; filename="campus-typing-records.csv"')
    expect(response.headers['cache-control']).toContain('no-store')
    expect(response.body.startsWith('\uFEFFrank,studentHash,nickname,email,phoneNumber')).toBe(true)
    expect(response.body).toContain('winner@example.com')
    expect(response.body).toContain('01012345678')
    expect(response.body).toContain('2026-09-08')
  })

  test('rejects missing, malformed, and wrong tokens before attempting to decrypt contacts', async () => {
    const { app, repository, db } = createApp()
    seedWinningRecord(repository)
    db.prepare("UPDATE game_sessions SET email_ciphertext = 'not-valid-ciphertext'").run()

    for (const authorization of [undefined, 'Basic credentials', 'Bearer', 'Bearer wrong-token', `Bearer ${adminToken} extra`]) {
      const response = await app.inject({
        method: 'GET',
        url: csvUrl,
        headers: authorization === undefined ? {} : { authorization },
      })
      expect(response.statusCode).toBe(401)
      expect(response.json()).toEqual({
        code: 'TYPING_ADMIN_UNAUTHORIZED',
        message: expect.any(String),
        data: null,
      })
      expect(response.body).not.toContain('winner@example.com')
    }
  })

  test('escapes CSV formula cells and CSV delimiters without exporting cryptographic metadata', async () => {
    const { app, repository } = createApp()
    seedWinningRecord(repository, {
      nickname: '=sum(1,1)',
      email: '+winner@example.com',
      phone: '-01012345678',
    })
    seedWinningRecord(repository, {
      studentHash: 'other-student',
      nickname: '@"\t\r\n,x',
      email: 'other@example.com',
      phone: '01087654321',
      startedAtMs: Date.UTC(2026, 8, 8, 11, 0, 0),
      completedAtMs: Date.UTC(2026, 8, 8, 11, 0, 0) + 17_000,
    })

    const response = await app.inject({
      method: 'GET',
      url: csvUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    })

    expect(response.body).toContain("'=sum(1,1)")
    expect(response.body).toContain("'+winner@example.com")
    expect(response.body).toContain("'-01012345678")
    expect(response.body).toContain("'@\"\"\t\r\n,x")
    expect(response.body).toContain('\r\n')
    expect(response.body).not.toContain('email_iv')
    expect(response.body).not.toContain('email_auth_tag')
    expect(response.body).not.toContain('email_ciphertext')
  })

  test('does not delete without the exact confirmation', async () => {
    const { app, repository } = createApp()
    seedWinningRecord(repository)

    const response = await app.inject({
      method: 'DELETE',
      url: deleteUrl,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { confirmation: 'DELETE' },
    })

    expect(response.statusCode).toBe(400)
    expect(repository.getLeaderboard(10)).toHaveLength(1)
  })

  test('cannot delete with a missing or wrong token even with exact confirmation', async () => {
    const { app, repository } = createApp()
    seedWinningRecord(repository)

    for (const authorization of [undefined, 'Bearer wrong-token']) {
      const response = await app.inject({
        method: 'DELETE',
        url: deleteUrl,
        headers: authorization === undefined ? {} : { authorization },
        payload: { confirmation: 'DELETE ALL CAMPUS TYPING DATA' },
      })
      expect(response.statusCode).toBe(401)
      expect(repository.getLeaderboard(10)).toHaveLength(1)
    }
  })

  test('deletes all sessions and records atomically with an exact confirmation', async () => {
    const { app, repository } = createApp()
    seedWinningRecord(repository)

    const deleted = await app.inject({
      method: 'DELETE',
      url: deleteUrl,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { confirmation: 'DELETE ALL CAMPUS TYPING DATA' },
    })
    const csv = await app.inject({
      method: 'GET',
      url: csvUrl,
      headers: { authorization: `Bearer ${adminToken}` },
    })

    expect(deleted.statusCode).toBe(200)
    expect(deleted.json()).toMatchObject({
      code: 'SUCCESS',
      data: { sessionsDeleted: 1, recordsDeleted: 1 },
    })
    expect(repository.getLeaderboard(10)).toEqual([])
    expect(csv.body).toBe('\uFEFFrank,studentHash,nickname,email,phoneNumber,officialElapsedMilliseconds,typoCount,completedAt,privacyConsentVersion,thirdPartyConsentVersion,consentedAt\r\n')
  })

  test('limits authenticated admin requests to ten per minute', async () => {
    let now = Date.UTC(2026, 8, 8, 12, 0, 0)
    const { app } = createApp(() => now)
    const headers = { authorization: `Bearer ${adminToken}` }

    for (let index = 0; index < 10; index += 1) {
      expect((await app.inject({ method: 'GET', url: csvUrl, headers })).statusCode).toBe(200)
    }
    expect((await app.inject({ method: 'GET', url: csvUrl, headers })).statusCode).toBe(429)

    now += 60_001
    expect((await app.inject({ method: 'GET', url: csvUrl, headers })).statusCode).toBe(200)
  })
})
