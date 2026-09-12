import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, test } from 'vitest'
import { buildApp } from '../src/app.js'
import type { ServerConfig } from '../src/config.js'
import { PRIVACY_CONSENT_VERSION, THIRD_PARTY_CONSENT_VERSION } from '../src/consent.js'
import { openDatabase } from '../src/database/connection.js'
import { runMigrations } from '../src/database/migrations.js'
import { createRepository } from '../src/database/repositories.js'

const sessionsUrl = '/api/v2/campus-typing/sessions'
const leaderboardUrl = '/api/v2/campus-typing/leaderboard'
const csvUrl = '/api/v2/admin/campus-typing/records.csv'
const deleteUrl = '/api/v2/admin/campus-typing/records'
const adminEmail = 'admin@example.com'
const adminPassword = 'admin-password-with-at-least-32-bytes!'
const adminAuthorization = `Basic ${Buffer.from(`${adminEmail}:${adminPassword}`).toString('base64')}`

const config: ServerConfig = {
  host: '127.0.0.1',
  port: 0,
  databasePath: ':memory:',
  allowedOrigins: ['https://typing.example'],
  studentHmacKey: 'student-hmac-key-with-at-least-32-bytes',
  emailEncryptionKey: Buffer.alloc(32, 7),
  adminEmail,
  adminPassword,
  trustProxy: 0,
}

const cleanup: Array<() => Promise<void>> = []

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((remove) => remove()))
})

describe('standalone leaderboard server full flow', () => {
  test('keeps only each student best record public while protecting contacts through export and deletion', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cau-typing-full-flow-'))
    const databasePath = join(directory, 'leaderboard.sqlite')
    const db = openDatabase(databasePath)
    runMigrations(db, fileURLToPath(new URL('../migrations/', import.meta.url)))

    let now = Date.UTC(2026, 8, 8, 12, 0, 0)
    const logged: string[] = []
    const app = buildApp({
      config,
      repository: createRepository(db),
      now: () => now,
      logStream: {
        write(message) {
          logged.push(message)
        },
      },
    })
    cleanup.push(async () => {
      await app.close()
      db.close()
      await rm(directory, { recursive: true, force: true })
    })

    const firstAttempt = await createAndComplete(app, {
      studentNumber: '20240001',
      nickname: '청룡',
      email: 'first@example.com',
      phoneNumber: '010-1234-5678',
    }, 20_000, 2, () => { now += 20_000 })
    expect(firstAttempt.statusCode).toBe(200)

    const whiteTiger = await createAndComplete(app, {
      studentNumber: '20240002',
      nickname: '백호',
      email: 'winner@example.com',
      phoneNumber: '010-8765-4321',
    }, 18_000, 1, () => { now += 18_000 })
    expect(whiteTiger.statusCode).toBe(200)

    const retry = await createAndComplete(app, {
      studentNumber: '2024 0001',
      nickname: '청룡-재도전',
      email: 'retry@example.com',
      phoneNumber: '010-1111-2222',
    }, 15_000, 0, () => { now += 15_000 })
    expect(retry.statusCode).toBe(200)

    const leaderboardResponse = await app.inject({ method: 'GET', url: leaderboardUrl })
    expect(leaderboardResponse.statusCode).toBe(200)
    const leaderboard = leaderboardResponse.json().data
    expect(leaderboard.entries.map((entry: { nickname: string }) => entry.nickname))
      .toEqual(['청룡-재도전', '백호'])
    expect(JSON.stringify(leaderboard)).not.toMatch(/studentHash|email|phone|consent/i)

    const sessionRows = db.prepare('SELECT * FROM game_sessions ORDER BY started_at_ms').all()
    const sqliteContents = Buffer.concat([
      db.serialize(),
      Buffer.from(JSON.stringify(sessionRows)),
    ]).toString('utf8')
    for (const privateValue of [
      '20240001',
      '20240002',
      '2024 0001',
      'first@example.com',
      'winner@example.com',
      'retry@example.com',
      '010-1234-5678',
      '010-8765-4321',
      '010-1111-2222',
      '01012345678',
      '01087654321',
      '01011112222',
    ]) {
      expect(sqliteContents).not.toContain(privateValue)
    }

    for (const authorization of [undefined, 'Basic wrong-admin-credentials']) {
      const unauthorizedCsv = await app.inject({
        method: 'GET',
        url: csvUrl,
        headers: authorization === undefined ? {} : { authorization },
      })
      expect(unauthorizedCsv.statusCode).toBe(401)
      expect(unauthorizedCsv.body).not.toContain('winner@example.com')
    }

    const unauthorizedDelete = await app.inject({
      method: 'DELETE',
      url: deleteUrl,
      headers: { authorization: 'Basic wrong-admin-credentials' },
      payload: { confirmation: 'DELETE ALL CAMPUS TYPING DATA' },
    })
    expect(unauthorizedDelete.statusCode).toBe(401)
    expect(db.prepare('SELECT count(*) AS count FROM game_sessions').get()).toEqual({ count: 3 })
    expect(db.prepare('SELECT count(*) AS count FROM game_records').get()).toEqual({ count: 3 })

    const csvResponse = await app.inject({
      method: 'GET',
      url: csvUrl,
      headers: { authorization: adminAuthorization },
    })
    expect(csvResponse.statusCode).toBe(200)
    expect(csvResponse.body).toContain('winner@example.com')
    expect(csvResponse.body).toContain('retry@example.com')
    expect(csvResponse.body).toContain(PRIVACY_CONSENT_VERSION)
    expect(csvResponse.body).toContain(THIRD_PARTY_CONSENT_VERSION)

    const rejectedDelete = await app.inject({
      method: 'DELETE',
      url: deleteUrl,
      headers: { authorization: adminAuthorization },
      payload: { confirmation: 'DELETE ALL CAMPUS TYPING DATA ' },
    })
    expect(rejectedDelete.statusCode).toBe(400)

    const deleted = await app.inject({
      method: 'DELETE',
      url: deleteUrl,
      headers: { authorization: adminAuthorization },
      payload: { confirmation: 'DELETE ALL CAMPUS TYPING DATA' },
    })
    expect(deleted.statusCode).toBe(200)
    expect(deleted.json().data).toEqual({ sessionsDeleted: 3, recordsDeleted: 3 })

    const emptyLeaderboard = await app.inject({ method: 'GET', url: leaderboardUrl })
    expect(emptyLeaderboard.json().data.entries).toEqual([])

    const logOutput = logged.join('')
    expect(logOutput).toContain('reqId')
    // Actual successful completion URLs must be reduced to the route template.
    for (const session of sessionRows as Array<{ id: string }>) {
      expect(logOutput).not.toContain(session.id)
    }
    for (const privateValue of [
      '20240001',
      '20240002',
      '2024 0001',
      'first@example.com',
      'winner@example.com',
      'retry@example.com',
      '010-1234-5678',
      '010-8765-4321',
      '010-1111-2222',
      '01012345678',
      '01087654321',
      '01011112222',
      adminEmail,
      adminPassword,
    ]) {
      expect(logOutput).not.toContain(privateValue)
    }
  })
})

async function createAndComplete(
  app: ReturnType<typeof buildApp>,
  input: {
    studentNumber: string
    nickname: string
    email: string
    phoneNumber: string
  },
  reportedElapsedMilliseconds: number,
  typoCount: number,
  advance: () => void,
) {
  const created = await app.inject({
    method: 'POST',
    url: sessionsUrl,
    payload: {
      ...input,
      privacyConsent: true,
      thirdPartyConsent: true,
    },
  })
  expect(created.statusCode).toBe(200)
  advance()
  return app.inject({
    method: 'POST',
    url: `${sessionsUrl}/${created.json().data.sessionId}/completion`,
    payload: { reportedElapsedMilliseconds, typoCount },
  })
}
