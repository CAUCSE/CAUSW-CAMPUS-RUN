import { afterEach, describe, expect, test } from 'vitest'
import Database from 'better-sqlite3'
import { fileURLToPath } from 'node:url'
import { buildApp } from '../src/app.js'
import type { ServerConfig } from '../src/config.js'
import { CAMPUS_COURSE } from '../src/course.js'
import { PRIVACY_CONSENT_VERSION, THIRD_PARTY_CONSENT_VERSION } from '../src/consent.js'
import { runMigrations } from '../src/database/migrations.js'
import { createRepository } from '../src/database/repositories.js'

const config: ServerConfig = {
  host: '127.0.0.1',
  port: 0,
  databasePath: ':memory:',
  allowedOrigins: ['https://typing.example'],
  studentHmacKey: 'student-hmac-key-with-at-least-32-bytes',
  emailEncryptionKey: Buffer.alloc(32, 7),
  adminEmail: 'admin@example.com',
  adminPassword: 'admin-password-with-at-least-32-bytes!',
  trustProxy: 0,
}

const apps: { app: ReturnType<typeof buildApp>; db: Database.Database }[] = []
const sessionsUrl = '/api/v2/campus-typing/sessions'
const leaderboardUrl = '/api/v2/campus-typing/leaderboard'

function createApp() {
  const db = new Database(':memory:')
  runMigrations(db, fileURLToPath(new URL('../migrations/', import.meta.url)))
  let now = 1_700_000_000_000
  const app = buildApp({
    config,
    repository: createRepository(db),
    now: () => now,
  })
  apps.push({ app, db })
  return {
    app,
    db,
    advance(milliseconds: number) { now += milliseconds },
  }
}

function createInput(overrides: Record<string, unknown> = {}) {
  return {
    studentNumber: '20240001',
    nickname: '청룡',
    email: 'Winner@Example.com ',
    phoneNumber: '010-1234-5678',
    privacyConsent: true,
    thirdPartyConsent: true,
    ...overrides,
  }
}

async function createSession(app: ReturnType<typeof buildApp>, overrides: Record<string, unknown> = {}, remoteAddress?: string) {
  return app.inject({
    method: 'POST',
    url: sessionsUrl,
    payload: createInput(overrides),
    ...(remoteAddress === undefined ? {} : { remoteAddress }),
  })
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map(async ({ app, db }) => {
    await app.close()
    db.close()
  }))
})

describe('public campus typing API', () => {
  test('creates, completes, and publicly ranks a private session', async () => {
    const { app, db, advance } = createApp()

    const created = await createSession(app)

    expect(created.statusCode).toBe(200)
    expect(created.json()).toEqual({
      code: 'SUCCESS',
      message: expect.any(String),
      data: {
        sessionId: expect.any(String),
        course: CAMPUS_COURSE,
        startedAt: '2023-11-14T22:13:23.000Z',
        expiresAt: '2023-11-14T22:23:23.000Z',
      },
    })
    expect(created.body).not.toContain('Winner@Example.com')
    expect(created.body).not.toContain('010-1234-5678')
    expect(created.body).not.toContain('20240001')
    const stored = db.prepare(`
      SELECT student_hash, email_ciphertext, phone_ciphertext,
        privacy_consent_version, third_party_consent_version, consented_at_ms, course_json
      FROM game_sessions
    `).get() as {
      student_hash: string
      email_ciphertext: string
      phone_ciphertext: string
      privacy_consent_version: string
      third_party_consent_version: string
      consented_at_ms: number
      course_json: string
    }
    expect(stored.student_hash).not.toContain('20240001')
    expect(stored.email_ciphertext).not.toContain('winner@example.com')
    expect(stored.phone_ciphertext).not.toContain('01012345678')
    expect(stored).toMatchObject({
      privacy_consent_version: PRIVACY_CONSENT_VERSION,
      third_party_consent_version: THIRD_PARTY_CONSENT_VERSION,
      consented_at_ms: 1_700_000_000_000,
      course_json: JSON.stringify(CAMPUS_COURSE),
    })

    advance(21_000)
    const completed = await app.inject({
      method: 'POST',
      url: `${sessionsUrl}/${created.json().data.sessionId}/completion`,
      payload: { reportedElapsedMilliseconds: 18_000, typoCount: 1 },
    })

    expect(completed.statusCode).toBe(200)
    expect(completed.json().data).toEqual({
      recordId: expect.any(String),
      nickname: '청룡',
      officialElapsedMilliseconds: 18_000,
      typoCount: 1,
      rankingStatus: 'ELIGIBLE',
      rank: 1,
      leaderboard: [{ rank: 1, nickname: '청룡', officialElapsedMilliseconds: 18_000, typoCount: 1 }],
    })

    const leaderboard = await app.inject({ method: 'GET', url: leaderboardUrl })

    expect(leaderboard.statusCode).toBe(200)
    expect(leaderboard.json()).toEqual({
      code: 'SUCCESS',
      message: expect.any(String),
      data: {
        entries: [{ rank: 1, nickname: '청룡', officialElapsedMilliseconds: 18_000, typoCount: 1 }],
        updatedAt: '2023-11-14T22:13:41.000Z',
      },
    })
    expect(leaderboard.body).not.toMatch(/studentHash|email|phone|consent|20240001/i)
  })

  test('rejects invalid contacts and missing mandatory consent without reflecting private input', async () => {
    const { app, db } = createApp()
    const response = await createSession(app, {
      email: 'private@example.com',
      phoneNumber: '011-1234-5678',
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({
      code: 'TYPING_INVALID_INPUT',
      message: expect.any(String),
      data: null,
    })
    expect(response.body).not.toContain('private@example.com')
    expect(response.body).not.toContain('011-1234-5678')
    expect(db.prepare('SELECT count(*) AS count FROM game_sessions').get()).toEqual({ count: 0 })
  })

  test.each([
    ['privacy consent', { privacyConsent: false }],
    ['third-party consent', { thirdPartyConsent: false }],
  ])('requires explicit %s before creating a session', async (_name, consent) => {
    const { app, db } = createApp()
    const response = await createSession(app, consent)

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({
      code: 'TYPING_INVALID_INPUT',
      message: expect.any(String),
      data: null,
    })
    expect(db.prepare('SELECT count(*) AS count FROM game_sessions').get()).toEqual({ count: 0 })
  })

  test('maps an unsupported request media type to the stable private-safe input error', async () => {
    const { app } = createApp()
    const response = await app.inject({
      method: 'POST',
      url: sessionsUrl,
      headers: { 'content-type': 'application/xml' },
      payload: '<session><email>private@example.com</email></session>',
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({
      code: 'TYPING_INVALID_INPUT',
      message: expect.any(String),
      data: null,
    })
    expect(response.body).not.toContain('private@example.com')
    expect(response.body).not.toContain('FST_ERR_CTP_INVALID_MEDIA_TYPE')
  })

  test('uses server time for plausibility, expiration, and replay protection', async () => {
    const { app, advance } = createApp()
    const tooFast = await createSession(app)
    advance(7_999)
    const tooFastCompletion = await app.inject({
      method: 'POST',
      url: `${sessionsUrl}/${tooFast.json().data.sessionId}/completion`,
      payload: { reportedElapsedMilliseconds: 600_000, typoCount: 0 },
    })
    expect(tooFastCompletion.statusCode).toBe(422)
    expect(tooFastCompletion.json()).toMatchObject({ code: 'TYPING_INVALID_DURATION', data: null })

    const valid = await createSession(app, { studentNumber: '20240002' })
    advance(8_000)
    const completed = await app.inject({
      method: 'POST',
      url: `${sessionsUrl}/${valid.json().data.sessionId}/completion`,
      payload: { reportedElapsedMilliseconds: 1, typoCount: 0 },
    })
    expect(completed.statusCode).toBe(200)
    expect(completed.json().data.officialElapsedMilliseconds).toBe(5_000)

    const replay = await app.inject({
      method: 'POST',
      url: `${sessionsUrl}/${valid.json().data.sessionId}/completion`,
      payload: { reportedElapsedMilliseconds: 5_000, typoCount: 0 },
    })
    expect(replay.statusCode).toBe(409)
    expect(replay.json()).toMatchObject({ code: 'TYPING_SESSION_COMPLETED', data: null })

    const expired = await createSession(app, { studentNumber: '20240003' })
    advance(603_001)
    const expiredCompletion = await app.inject({
      method: 'POST',
      url: `${sessionsUrl}/${expired.json().data.sessionId}/completion`,
      payload: { reportedElapsedMilliseconds: 600_000, typoCount: 0 },
    })
    expect(expiredCompletion.statusCode).toBe(410)
    expect(expiredCompletion.json()).toMatchObject({ code: 'TYPING_SESSION_EXPIRED', data: null })
  })

  test('shows one best record per normalized HMAC identity and returns the exact current rank', async () => {
    const { app, advance } = createApp()
    const first = await createSession(app, { studentNumber: '20240001', nickname: '느림' })
    advance(23_000)
    await app.inject({
      method: 'POST',
      url: `${sessionsUrl}/${first.json().data.sessionId}/completion`,
      payload: { reportedElapsedMilliseconds: 20_000, typoCount: 0 },
    })
    const second = await createSession(app, { studentNumber: '2024 0001', nickname: '빠름' })
    advance(21_000)
    await app.inject({
      method: 'POST',
      url: `${sessionsUrl}/${second.json().data.sessionId}/completion`,
      payload: { reportedElapsedMilliseconds: 18_000, typoCount: 1 },
    })

    for (let index = 1; index <= 10; index += 1) {
      const created = await createSession(app, {
        studentNumber: `20241${String(index).padStart(3, '0')}`,
        nickname: `선수${index}`,
      }, `198.51.100.${index}`)
      advance(8_000 + index)
      await app.inject({
        method: 'POST',
        url: `${sessionsUrl}/${created.json().data.sessionId}/completion`,
        payload: { reportedElapsedMilliseconds: 5_000, typoCount: 0 },
        remoteAddress: `203.0.113.${index}`,
      })
    }

    const leaderboard = await app.inject({ method: 'GET', url: leaderboardUrl })
    expect(leaderboard.json().data.entries).toHaveLength(10)
    expect(leaderboard.json().data.entries.filter((entry: { nickname: string }) => entry.nickname === '빠름')).toHaveLength(0)

    // No client query can expand or shrink the fixed public top ten.
    for (const query of ['limit=50', 'limit=1', 'limit=0', 'limit=-1', 'limit=garbage', 'limit=10&limit=50', 'private=value']) {
      const queried = await app.inject({ method: 'GET', url: `${leaderboardUrl}?${query}` })
      expect(queried.statusCode).toBe(200)
      expect(queried.json().data.entries).toEqual(leaderboard.json().data.entries)
    }

    const exactRankSession = await createSession(app, { studentNumber: '20249999', nickname: '현재' }, '198.51.100.99')
    advance(33_000)
    const completion = await app.inject({
      method: 'POST',
      url: `${sessionsUrl}/${exactRankSession.json().data.sessionId}/completion`,
      payload: { reportedElapsedMilliseconds: 30_000, typoCount: 0 },
      remoteAddress: '203.0.113.99',
    })
    expect(completion.json().data.rank).toBe(12)
  })

  test('applies separate public route limits using daily IP hashes', async () => {
    const { app } = createApp()

    for (let index = 0; index < 10; index += 1) {
      expect((await createSession(app, { studentNumber: `20242${String(index).padStart(3, '0')}` })).statusCode).toBe(200)
    }
    const sessionLimited = await createSession(app, { studentNumber: '20242999' })
    expect(sessionLimited.statusCode).toBe(429)
    expect(sessionLimited.json()).toEqual({
      code: 'TYPING_RATE_LIMITED',
      message: expect.any(String),
      data: null,
    })

    for (let index = 0; index < 3; index += 1) {
      expect((await createSession(
        app,
        { studentNumber: '20249998' },
        `203.0.113.${index + 1}`,
      )).statusCode).toBe(200)
    }
    const studentLimited = await createSession(app, { studentNumber: '20249998' }, '203.0.113.9')
    expect(studentLimited.statusCode).toBe(429)
    expect(studentLimited.json()).toMatchObject({ code: 'TYPING_RATE_LIMITED', data: null })

    for (let index = 0; index < 120; index += 1) {
      expect((await app.inject({ method: 'GET', url: leaderboardUrl, remoteAddress: '198.51.100.4' })).statusCode).toBe(200)
    }
    const leaderboardLimited = await app.inject({ method: 'GET', url: leaderboardUrl, remoteAddress: '198.51.100.4' })
    expect(leaderboardLimited.statusCode).toBe(429)
    expect(leaderboardLimited.json()).toMatchObject({ code: 'TYPING_RATE_LIMITED', data: null })

    const completion = createApp()
    const sessionIds: string[] = []
    for (let index = 0; index < 31; index += 1) {
      const created = await createSession(
        completion.app,
        { studentNumber: `20243${String(index).padStart(3, '0')}` },
        `198.51.100.${index + 1}`,
      )
      expect(created.statusCode).toBe(200)
      sessionIds.push(created.json().data.sessionId)
    }
    completion.advance(8_000)
    for (const sessionId of sessionIds.slice(0, 30)) {
      expect((await completion.app.inject({
        method: 'POST',
        url: `${sessionsUrl}/${sessionId}/completion`,
        payload: { reportedElapsedMilliseconds: 5_000, typoCount: 0 },
        remoteAddress: '203.0.113.250',
      })).statusCode).toBe(200)
    }
    const completionLimited = await completion.app.inject({
      method: 'POST',
      url: `${sessionsUrl}/${sessionIds[30]}/completion`,
      payload: { reportedElapsedMilliseconds: 5_000, typoCount: 0 },
      remoteAddress: '203.0.113.250',
    })
    expect(completionLimited.statusCode).toBe(429)
    expect(completionLimited.json()).toMatchObject({ code: 'TYPING_RATE_LIMITED', data: null })
  })

  test.each([
    ['session creation', sessionsUrl, 10],
    ['session completion', `${sessionsUrl}/missing-session/completion`, 30],
  ])('counts invalid bodies and parser failures toward the %s IP limit', async (_name, url, limit) => {
    const { app, db, advance } = createApp()
    const invalidRequests = [
      { payload: {} },
      { headers: { 'content-type': 'application/json' }, payload: '{"email":' },
      { headers: { 'content-type': 'application/xml' }, payload: '<private />' },
      { payload: { padding: 'x'.repeat(16 * 1024) } },
    ]
    for (let index = 0; index < limit; index += 1) {
      const response = await app.inject({ method: 'POST', url, ...invalidRequests[index % invalidRequests.length] })
      expect(response.statusCode).toBe(400)
    }
    for (const invalid of invalidRequests) {
      const response = await app.inject({ method: 'POST', url, ...invalid })
      expect(response.statusCode).toBe(429)
      expect(response.json()).toMatchObject({ code: 'TYPING_RATE_LIMITED', data: null })
    }
    expect((await app.inject({ method: 'POST', url, payload: {}, remoteAddress: '198.51.100.99' })).statusCode).toBe(400)
    advance(59_999)
    expect((await app.inject({ method: 'POST', url, payload: {} })).statusCode).toBe(429)
    advance(1)
    expect((await app.inject({ method: 'POST', url, payload: {} })).statusCode).toBe(400)
    expect(db.prepare('SELECT count(*) AS count FROM game_sessions').get()).toEqual({ count: 0 })
    expect(db.prepare('SELECT count(*) AS count FROM game_records').get()).toEqual({ count: 0 })
  })
})
