import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { openDatabase } from '../src/database/connection.js'
import { runMigrations } from '../src/database/migrations.js'

const temporaryDirectories: string[] = []
const migrationsDirectory = join(import.meta.dirname, '../migrations')

function createTemporaryDatabasePath(): string {
  const directory = mkdtempSync(join(tmpdir(), 'cau-typy-database-'))
  temporaryDirectories.push(directory)
  return join(directory, 'nested', 'leaderboard.sqlite')
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

test('creates the session, record, and migration tables idempotently', () => {
  const databasePath = createTemporaryDatabasePath()
  const db = openDatabase(databasePath)

  try {
    runMigrations(db, migrationsDirectory)
    runMigrations(db, migrationsDirectory)

    const names = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()
    expect(names).toEqual(expect.arrayContaining([
      { name: 'game_sessions' },
      { name: 'game_records' },
      { name: 'schema_migrations' },
    ]))
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
    expect(db.pragma('busy_timeout', { simple: true })).toBe(5_000)
    expect(db.pragma('journal_mode', { simple: true })).toBe('wal')
    expect(db.prepare('SELECT version FROM schema_migrations').all()).toEqual([{ version: 1 }])
  } finally {
    db.close()
  }
})

test('creates indexes for session identity and leaderboard ordering', () => {
  const db = openDatabase(createTemporaryDatabasePath())

  try {
    runMigrations(db, migrationsDirectory)

    const recordIndexes = db.pragma('index_list(game_records)') as Array<{ name: string }>
    const sessionIndexes = db.pragma('index_list(game_sessions)') as Array<{ name: string }>
    expect(recordIndexes.map(({ name }) => name)).toEqual(expect.arrayContaining([
      'idx_game_records_student_hash',
      'idx_game_records_official_elapsed_ms',
      'idx_game_records_completed_at_ms',
    ]))
    expect(sessionIndexes.map(({ name }) => name)).toContain('idx_game_sessions_student_hash')
  } finally {
    db.close()
  }
})

test('rejects record typo counts and durations outside their allowed ranges', () => {
  const db = openDatabase(createTemporaryDatabasePath())

  try {
    runMigrations(db, migrationsDirectory)

    expect(() => db.prepare(`
      INSERT INTO game_records (
        id, session_id, student_hash, nickname, official_elapsed_ms,
        reported_elapsed_ms, typo_count, completed_at_ms
      ) VALUES ('record-1', 'missing-session', 'student', 'nickname', 5_000, 0, -1, 5_000)
    `).run()).toThrow(/CHECK constraint failed/)

    expect(() => db.prepare(`
      INSERT INTO game_records (
        id, session_id, student_hash, nickname, official_elapsed_ms,
        reported_elapsed_ms, typo_count, completed_at_ms
      ) VALUES ('record-2', 'missing-session', 'student', 'nickname', 4_999, 0, 0, 5_000)
    `).run()).toThrow(/CHECK constraint failed/)
  } finally {
    db.close()
  }
})

test('allows only one record per session and cascades it when the session is deleted', () => {
  const db = openDatabase(createTemporaryDatabasePath())

  try {
    runMigrations(db, migrationsDirectory)
    db.prepare(`
      INSERT INTO game_sessions (
        id, student_hash, nickname, email_ciphertext, email_iv, email_auth_tag,
        phone_ciphertext, phone_iv, phone_auth_tag, privacy_consent_version,
        third_party_consent_version, consented_at_ms, course_json, started_at_ms,
        expires_at_ms, completed_at_ms, created_ip_hash
      ) VALUES (
        'session-1', 'student', 'nickname', 'email', 'email-iv', 'email-tag',
        'phone', 'phone-iv', 'phone-tag', 'privacy-v1', 'third-party-v1', 0,
        '["본관"]', 0, 600000, NULL, 'ip-hash'
      )
    `).run()
    const insertRecord = db.prepare(`
      INSERT INTO game_records (
        id, session_id, student_hash, nickname, official_elapsed_ms,
        reported_elapsed_ms, typo_count, completed_at_ms
      ) VALUES (?, 'session-1', 'student', 'nickname', 5_000, 0, 0, 5_000)
    `)
    insertRecord.run('record-1')

    expect(() => insertRecord.run('record-2')).toThrow(/UNIQUE constraint failed/)
    db.prepare("DELETE FROM game_sessions WHERE id = 'session-1'").run()
    expect(db.prepare('SELECT count(*) AS count FROM game_records').get()).toEqual({ count: 0 })
  } finally {
    db.close()
  }
})

test('refuses a database whose migration version is newer than the bundled migrations', () => {
  const db = openDatabase(createTemporaryDatabasePath())

  try {
    runMigrations(db, migrationsDirectory)
    db.prepare('INSERT INTO schema_migrations (version, applied_at_ms) VALUES (?, ?)').run(999, 0)

    expect(() => runMigrations(db, migrationsDirectory)).toThrow(/newer than bundled migrations/i)
  } finally {
    db.close()
  }
})

test('opens an in-memory database when WAL is unavailable', () => {
  const db = openDatabase(':memory:')

  try {
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
    expect(db.pragma('busy_timeout', { simple: true })).toBe(5_000)
    expect(['memory', 'wal']).toContain(db.pragma('journal_mode', { simple: true }))
  } finally {
    db.close()
  }
})
