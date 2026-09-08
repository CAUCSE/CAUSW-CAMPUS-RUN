import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { runMigrations } from '../src/database/migrations.js'
import {
  createRepository,
  type NewSession,
  type SessionRecordRepository,
} from '../src/database/repositories.js'
import { encryptContact } from '../src/security/contact-encryption.js'

const migrationsDirectory = join(import.meta.dirname, '../migrations')
const encryptionKey = Buffer.alloc(32, 4)
const databases: Database.Database[] = []

function createTestRepository(): { db: Database.Database; repository: SessionRecordRepository } {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db, migrationsDirectory)
  databases.push(db)
  return { db, repository: createRepository(db) }
}

afterEach(() => {
  for (const db of databases.splice(0)) db.close()
})

function newSession(overrides: Partial<NewSession> = {}): NewSession {
  const id = overrides.id ?? randomUUID()
  const email = encryptContact('winner@example.com', id, 'email', encryptionKey)
  const phone = encryptContact('01012345678', id, 'phone', encryptionKey)
  return {
    id,
    studentHash: 'student-1',
    nickname: '청룡',
    email,
    phone,
    privacyConsentVersion: 'privacy-v1',
    thirdPartyConsentVersion: 'third-party-v1',
    consentedAtMs: 1_000,
    course: ['본관', '100주년기념관'],
    startedAtMs: 10_000,
    expiresAtMs: 610_000,
    createdIpHash: 'daily-ip-hash',
    ...overrides,
  }
}

function createAndComplete(
  repository: SessionRecordRepository,
  input: Partial<NewSession> & { elapsedMs: number; typoCount?: number },
) {
  const session = newSession(input)
  repository.createSession(session)
  return repository.completeSession(
    session.id,
    input.elapsedMs,
    input.typoCount ?? 0,
    session.startedAtMs + input.elapsedMs,
  )
}

describe('session and record repository', () => {
  test('persists only encrypted contacts and a server-owned course snapshot', () => {
    const { db, repository } = createTestRepository()
    const created = repository.createSession(newSession())

    expect(created).toMatchObject({
      id: expect.any(String),
      course: ['본관', '100주년기념관'],
      completedAtMs: null,
    })
    const persisted = db.prepare(`
      SELECT email_ciphertext, phone_ciphertext, course_json
      FROM game_sessions WHERE id = ?
    `).get(created.id) as { email_ciphertext: string; phone_ciphertext: string; course_json: string }
    expect(persisted.email_ciphertext).not.toContain('winner@example.com')
    expect(persisted.phone_ciphertext).not.toContain('01012345678')
    expect(persisted.course_json).toBe('["본관","100주년기념관"]')
  })

  test('rejects a missing session without creating a record', () => {
    const { db, repository } = createTestRepository()

    expect(() => repository.completeSession('missing', 10_000, 0, 10_000))
      .toThrow('SESSION_NOT_FOUND')
    expect(db.prepare('SELECT count(*) AS count FROM game_records').get()).toEqual({ count: 0 })
  })

  test('rejects an expired session without marking it completed', () => {
    const { db, repository } = createTestRepository()
    const session = repository.createSession(newSession({ expiresAtMs: 20_000 }))

    expect(() => repository.completeSession(session.id, 10_001, 0, 20_001))
      .toThrow('SESSION_EXPIRED')
    expect(db.prepare('SELECT completed_at_ms FROM game_sessions WHERE id = ?').get(session.id))
      .toEqual({ completed_at_ms: null })
    expect(db.prepare('SELECT count(*) AS count FROM game_records').get()).toEqual({ count: 0 })
  })

  test('uses the server clock instead of the reported duration for the official record', () => {
    const { repository } = createTestRepository()
    const session = repository.createSession(newSession())

    expect(repository.completeSession(session.id, 500_000, 0, session.startedAtMs + 10_000))
      .toMatchObject({
        officialElapsedMilliseconds: 10_000,
        reportedElapsedMilliseconds: 500_000,
      })
  })

  test('rejects official durations outside the inclusive 5 second through 10 minute range atomically', () => {
    const { db, repository } = createTestRepository()
    const short = repository.createSession(newSession({ expiresAtMs: 1_000_000 }))
    const minimum = repository.createSession(newSession({ expiresAtMs: 1_000_000 }))
    const longest = repository.createSession(newSession({ expiresAtMs: 1_000_000 }))
    const tooLong = repository.createSession(newSession({ expiresAtMs: 1_000_000 }))

    expect(() => repository.completeSession(short.id, 4_999, 0, short.startedAtMs + 4_999))
      .toThrow('INVALID_DURATION')
    expect(repository.completeSession(minimum.id, 5_000, 0, minimum.startedAtMs + 5_000))
      .toMatchObject({ officialElapsedMilliseconds: 5_000 })
    expect(repository.completeSession(longest.id, 600_000, 0, longest.startedAtMs + 600_000))
      .toMatchObject({ officialElapsedMilliseconds: 600_000 })
    expect(() => repository.completeSession(tooLong.id, 600_000, 0, tooLong.startedAtMs + 600_001))
      .toThrow('INVALID_DURATION')
    expect(db.prepare('SELECT completed_at_ms FROM game_sessions WHERE id = ?').get(short.id))
      .toEqual({ completed_at_ms: null })
    expect(db.prepare('SELECT completed_at_ms FROM game_sessions WHERE id = ?').get(tooLong.id))
      .toEqual({ completed_at_ms: null })
    expect(db.prepare('SELECT count(*) AS count FROM game_records').get()).toEqual({ count: 2 })
  })

  test('rejects completing the same session twice', () => {
    const { repository } = createTestRepository()
    const session = repository.createSession(newSession())

    expect(() => repository.completeSession(session.id, 10_000, 0, session.startedAtMs + 10_000)).not.toThrow()
    expect(() => repository.completeSession(session.id, 10_000, 0, session.startedAtMs + 11_000))
      .toThrow('SESSION_COMPLETED')
  })

  test('keeps every attempt but ranks one best record per student', () => {
    const { db, repository } = createTestRepository()
    createAndComplete(repository, { studentHash: 'same', elapsedMs: 20_000, typoCount: 2 })
    createAndComplete(repository, { studentHash: 'same', elapsedMs: 18_000, typoCount: 3 })
    createAndComplete(repository, { studentHash: 'other', elapsedMs: 19_000, typoCount: 0 })

    expect(repository.getLeaderboard(10).map(({ studentHash: _, ...entry }) => entry)).toEqual([
      { rank: 1, nickname: '청룡', officialElapsedMilliseconds: 18_000, typoCount: 3 },
      { rank: 2, nickname: '청룡', officialElapsedMilliseconds: 19_000, typoCount: 0 },
    ])
    expect(db.prepare('SELECT count(*) AS count FROM game_records').get()).toEqual({ count: 3 })
  })

  test('orders equal durations by typo count then completion time', () => {
    const { repository } = createTestRepository()
    createAndComplete(repository, {
      studentHash: 'late-low-typos', nickname: '나중', elapsedMs: 18_000, typoCount: 1, startedAtMs: 2_000,
    })
    createAndComplete(repository, {
      studentHash: 'early-low-typos', nickname: '먼저', elapsedMs: 18_000, typoCount: 1, startedAtMs: 1_000,
    })
    createAndComplete(repository, {
      studentHash: 'high-typos', nickname: '오타', elapsedMs: 18_000, typoCount: 2, startedAtMs: 0,
    })

    expect(repository.getLeaderboard(10).map(({ nickname, typoCount, rank }) => ({ nickname, typoCount, rank }))).toEqual([
      { rank: 1, nickname: '먼저', typoCount: 1 },
      { rank: 2, nickname: '나중', typoCount: 1 },
      { rank: 3, nickname: '오타', typoCount: 2 },
    ])
  })

  test('uses the record ID as the final deterministic ranking tie-break', () => {
    const { db, repository } = createTestRepository()
    repository.createSession(newSession({ id: 'session-z', studentHash: 'same', nickname: '나중ID' }))
    repository.createSession(newSession({ id: 'session-a', studentHash: 'same', nickname: '먼저ID' }))
    const insertRecord = db.prepare(`
      INSERT INTO game_records (
        id, session_id, student_hash, nickname, official_elapsed_ms,
        reported_elapsed_ms, typo_count, completed_at_ms
      ) VALUES (?, ?, 'same', ?, 18_000, 18_000, 1, 30_000)
    `)
    insertRecord.run('record-z', 'session-z', '나중ID')
    insertRecord.run('record-a', 'session-a', '먼저ID')

    expect(repository.getLeaderboard(10)).toEqual([
      { rank: 1, studentHash: 'same', nickname: '먼저ID', officialElapsedMilliseconds: 18_000, typoCount: 1 },
    ])
  })

  test('returns encrypted contacts and consent audit data from each winning session', () => {
    const { repository } = createTestRepository()
    createAndComplete(repository, {
      studentHash: 'same', nickname: '느린기록', elapsedMs: 20_000,
      privacyConsentVersion: 'old-privacy', thirdPartyConsentVersion: 'old-third-party',
    })
    const winner = createAndComplete(repository, {
      studentHash: 'same', nickname: '빠른기록', elapsedMs: 18_000,
      privacyConsentVersion: 'new-privacy', thirdPartyConsentVersion: 'new-third-party',
    })

    expect(repository.getBestRecordsWithContacts()).toEqual([
      expect.objectContaining({
        rank: 1,
        recordId: winner.id,
        nickname: '빠른기록',
        privacyConsentVersion: 'new-privacy',
        thirdPartyConsentVersion: 'new-third-party',
        email: expect.objectContaining({ ciphertext: expect.any(String) }),
        phone: expect.objectContaining({ ciphertext: expect.any(String) }),
      }),
    ])
  })

  test('deletes records and sessions as one immediate transaction', () => {
    const { db, repository } = createTestRepository()
    createAndComplete(repository, { studentHash: 'one', elapsedMs: 10_000 })
    createAndComplete(repository, { studentHash: 'two', elapsedMs: 11_000 })

    expect(repository.deleteAllData()).toEqual({ sessionsDeleted: 2, recordsDeleted: 2 })
    expect(db.prepare('SELECT count(*) AS count FROM game_sessions').get()).toEqual({ count: 0 })
    expect(db.prepare('SELECT count(*) AS count FROM game_records').get()).toEqual({ count: 0 })
  })

  test('rolls back record deletion when session deletion fails', () => {
    const { db, repository } = createTestRepository()
    createAndComplete(repository, { studentHash: 'one', elapsedMs: 10_000 })
    db.exec(`
      CREATE TRIGGER refuse_session_delete
      BEFORE DELETE ON game_sessions
      BEGIN
        SELECT RAISE(ABORT, 'session delete refused');
      END
    `)

    expect(() => repository.deleteAllData()).toThrow('session delete refused')
    expect(db.prepare('SELECT count(*) AS count FROM game_sessions').get()).toEqual({ count: 1 })
    expect(db.prepare('SELECT count(*) AS count FROM game_records').get()).toEqual({ count: 1 })
  })
})
