import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import type { EncryptedContact } from '../security/contact-encryption.js'

const MIN_OFFICIAL_ELAPSED_MS = 5_000
const MAX_ELAPSED_MS = 600_000

export type RepositoryErrorKind =
  | 'SESSION_NOT_FOUND'
  | 'SESSION_EXPIRED'
  | 'SESSION_COMPLETED'
  | 'INVALID_DURATION'

export class RepositoryError extends Error {
  readonly kind: RepositoryErrorKind

  constructor(kind: RepositoryErrorKind) {
    super(kind)
    this.name = 'RepositoryError'
    this.kind = kind
  }
}

export interface NewSession {
  readonly id: string
  readonly studentHash: string
  readonly nickname: string
  readonly email: EncryptedContact
  readonly phone: EncryptedContact
  readonly privacyConsentVersion: string
  readonly thirdPartyConsentVersion: string
  readonly consentedAtMs: number
  readonly course: readonly string[]
  readonly startedAtMs: number
  readonly expiresAtMs: number
  readonly createdIpHash: string
}

export interface StoredSession extends NewSession {
  readonly completedAtMs: number | null
}

export interface StoredRecord {
  readonly id: string
  readonly sessionId: string
  readonly studentHash: string
  readonly nickname: string
  readonly officialElapsedMilliseconds: number
  readonly reportedElapsedMilliseconds: number
  readonly typoCount: number
  readonly completedAtMs: number
}

export interface RankedRecord {
  readonly rank: number
  readonly studentHash: string
  readonly nickname: string
  readonly officialElapsedMilliseconds: number
  readonly typoCount: number
}

export interface BestRecordWithContacts extends RankedRecord {
  readonly recordId: string
  readonly sessionId: string
  readonly completedAtMs: number
  readonly email: EncryptedContact
  readonly phone: EncryptedContact
  readonly privacyConsentVersion: string
  readonly thirdPartyConsentVersion: string
  readonly consentedAtMs: number
}

interface SessionRow {
  readonly id: string
  readonly student_hash: string
  readonly nickname: string
  readonly email_ciphertext: string
  readonly email_iv: string
  readonly email_auth_tag: string
  readonly phone_ciphertext: string
  readonly phone_iv: string
  readonly phone_auth_tag: string
  readonly privacy_consent_version: string
  readonly third_party_consent_version: string
  readonly consented_at_ms: number
  readonly course_json: string
  readonly started_at_ms: number
  readonly expires_at_ms: number
  readonly completed_at_ms: number | null
  readonly created_ip_hash: string
}

interface RecordRow {
  readonly id: string
  readonly session_id: string
  readonly student_hash: string
  readonly nickname: string
  readonly official_elapsed_ms: number
  readonly reported_elapsed_ms: number
  readonly typo_count: number
  readonly completed_at_ms: number
}

interface RankedRecordRow {
  readonly rank: number
  readonly student_hash: string
  readonly nickname: string
  readonly official_elapsed_ms: number
  readonly typo_count: number
}

interface BestRecordWithContactsRow extends RankedRecordRow {
  readonly record_id: string
  readonly session_id: string
  readonly completed_at_ms: number
  readonly email_ciphertext: string
  readonly email_iv: string
  readonly email_auth_tag: string
  readonly phone_ciphertext: string
  readonly phone_iv: string
  readonly phone_auth_tag: string
  readonly privacy_consent_version: string
  readonly third_party_consent_version: string
  readonly consented_at_ms: number
}

function invalidDuration(): never {
  throw new RepositoryError('INVALID_DURATION')
}

function parseCourse(courseJson: string): readonly string[] {
  const course: unknown = JSON.parse(courseJson)
  if (!Array.isArray(course) || !course.every((place) => typeof place === 'string')) {
    throw new Error('Invalid stored course')
  }
  return course
}

function toStoredSession(row: SessionRow): StoredSession {
  return {
    id: row.id,
    studentHash: row.student_hash,
    nickname: row.nickname,
    email: {
      ciphertext: row.email_ciphertext,
      iv: row.email_iv,
      authTag: row.email_auth_tag,
    },
    phone: {
      ciphertext: row.phone_ciphertext,
      iv: row.phone_iv,
      authTag: row.phone_auth_tag,
    },
    privacyConsentVersion: row.privacy_consent_version,
    thirdPartyConsentVersion: row.third_party_consent_version,
    consentedAtMs: row.consented_at_ms,
    course: parseCourse(row.course_json),
    startedAtMs: row.started_at_ms,
    expiresAtMs: row.expires_at_ms,
    completedAtMs: row.completed_at_ms,
    createdIpHash: row.created_ip_hash,
  }
}

function toStoredRecord(row: RecordRow): StoredRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    studentHash: row.student_hash,
    nickname: row.nickname,
    officialElapsedMilliseconds: row.official_elapsed_ms,
    reportedElapsedMilliseconds: row.reported_elapsed_ms,
    typoCount: row.typo_count,
    completedAtMs: row.completed_at_ms,
  }
}

function toRankedRecord(row: RankedRecordRow): RankedRecord {
  return {
    rank: row.rank,
    studentHash: row.student_hash,
    nickname: row.nickname,
    officialElapsedMilliseconds: row.official_elapsed_ms,
    typoCount: row.typo_count,
  }
}

const bestRecordsCte = `
  WITH student_best AS (
    SELECT
      id,
      session_id,
      student_hash,
      nickname,
      official_elapsed_ms,
      typo_count,
      completed_at_ms,
      ROW_NUMBER() OVER (
        PARTITION BY student_hash
        ORDER BY official_elapsed_ms, typo_count, completed_at_ms, id
      ) AS student_row_number
    FROM game_records
  ),
  ranked_best AS (
    SELECT
      id,
      session_id,
      student_hash,
      nickname,
      official_elapsed_ms,
      typo_count,
      completed_at_ms,
      ROW_NUMBER() OVER (
        ORDER BY official_elapsed_ms, typo_count, completed_at_ms, id
      ) AS rank
    FROM student_best
    WHERE student_row_number = 1
  )
`

export class SessionRecordRepository {
  private readonly insertSession: Database.Statement
  private readonly selectSession: Database.Statement
  private readonly updateSessionCompleted: Database.Statement
  private readonly insertRecord: Database.Statement
  private readonly countRecords: Database.Statement
  private readonly countSessions: Database.Statement
  private readonly deleteRecords: Database.Statement
  private readonly deleteSessions: Database.Statement

  constructor(private readonly db: Database.Database) {
    this.insertSession = db.prepare(`
      INSERT INTO game_sessions (
        id, student_hash, nickname, email_ciphertext, email_iv, email_auth_tag,
        phone_ciphertext, phone_iv, phone_auth_tag, privacy_consent_version,
        third_party_consent_version, consented_at_ms, course_json, started_at_ms,
        expires_at_ms, completed_at_ms, created_ip_hash
      ) VALUES (
        @id, @studentHash, @nickname, @emailCiphertext, @emailIv, @emailAuthTag,
        @phoneCiphertext, @phoneIv, @phoneAuthTag, @privacyConsentVersion,
        @thirdPartyConsentVersion, @consentedAtMs, @courseJson, @startedAtMs,
        @expiresAtMs, NULL, @createdIpHash
      )
    `)
    this.selectSession = db.prepare('SELECT * FROM game_sessions WHERE id = ?')
    this.updateSessionCompleted = db.prepare(`
      UPDATE game_sessions SET completed_at_ms = ? WHERE id = ? AND completed_at_ms IS NULL
    `)
    this.insertRecord = db.prepare(`
      INSERT INTO game_records (
        id, session_id, student_hash, nickname, official_elapsed_ms,
        reported_elapsed_ms, typo_count, completed_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    this.countRecords = db.prepare('SELECT count(*) AS count FROM game_records')
    this.countSessions = db.prepare('SELECT count(*) AS count FROM game_sessions')
    this.deleteRecords = db.prepare('DELETE FROM game_records')
    this.deleteSessions = db.prepare('DELETE FROM game_sessions')
  }

  createSession(input: NewSession): StoredSession {
    this.insertSession.run({
      id: input.id,
      studentHash: input.studentHash,
      nickname: input.nickname,
      emailCiphertext: input.email.ciphertext,
      emailIv: input.email.iv,
      emailAuthTag: input.email.authTag,
      phoneCiphertext: input.phone.ciphertext,
      phoneIv: input.phone.iv,
      phoneAuthTag: input.phone.authTag,
      privacyConsentVersion: input.privacyConsentVersion,
      thirdPartyConsentVersion: input.thirdPartyConsentVersion,
      consentedAtMs: input.consentedAtMs,
      courseJson: JSON.stringify(input.course),
      startedAtMs: input.startedAtMs,
      expiresAtMs: input.expiresAtMs,
      createdIpHash: input.createdIpHash,
    })

    const row = this.selectSession.get(input.id) as SessionRow | undefined
    if (!row) throw new Error('Session was not persisted')
    return toStoredSession(row)
  }

  completeSession(
    sessionId: string,
    reportedElapsedMs: number,
    typoCount: number,
    nowMs: number,
  ): StoredRecord {
    return this.db.transaction(() => {
      const session = this.selectSession.get(sessionId) as SessionRow | undefined
      if (!session) throw new RepositoryError('SESSION_NOT_FOUND')
      if (session.completed_at_ms !== null) throw new RepositoryError('SESSION_COMPLETED')
      if (!Number.isSafeInteger(nowMs) || nowMs > session.expires_at_ms) {
        throw new RepositoryError('SESSION_EXPIRED')
      }

      const officialElapsedMs = nowMs - session.started_at_ms
      if (
        !Number.isSafeInteger(officialElapsedMs)
        || officialElapsedMs < MIN_OFFICIAL_ELAPSED_MS
        || officialElapsedMs > MAX_ELAPSED_MS
        || !Number.isSafeInteger(reportedElapsedMs)
        || reportedElapsedMs < 0
        || reportedElapsedMs > MAX_ELAPSED_MS
        || !Number.isSafeInteger(typoCount)
        || typoCount < 0
      ) {
        return invalidDuration()
      }

      const record: RecordRow = {
        id: randomUUID(),
        session_id: session.id,
        student_hash: session.student_hash,
        nickname: session.nickname,
        official_elapsed_ms: officialElapsedMs,
        reported_elapsed_ms: reportedElapsedMs,
        typo_count: typoCount,
        completed_at_ms: nowMs,
      }
      const updated = this.updateSessionCompleted.run(nowMs, session.id)
      if (updated.changes !== 1) throw new RepositoryError('SESSION_COMPLETED')
      this.insertRecord.run(
        record.id,
        record.session_id,
        record.student_hash,
        record.nickname,
        record.official_elapsed_ms,
        record.reported_elapsed_ms,
        record.typo_count,
        record.completed_at_ms,
      )
      return toStoredRecord(record)
    }).immediate()
  }

  getLeaderboard(limit: number): RankedRecord[] {
    if (!Number.isSafeInteger(limit) || limit <= 0) return []
    const rows = this.db.prepare(`${bestRecordsCte}
      SELECT rank, student_hash, nickname, official_elapsed_ms, typo_count
      FROM ranked_best
      ORDER BY rank
      LIMIT ?
    `).all(limit) as RankedRecordRow[]
    return rows.map(toRankedRecord)
  }

  getBestRecordsWithContacts(): BestRecordWithContacts[] {
    const rows = this.db.prepare(`${bestRecordsCte}
      SELECT
        ranked_best.rank,
        ranked_best.id AS record_id,
        ranked_best.session_id,
        ranked_best.student_hash,
        ranked_best.nickname,
        ranked_best.official_elapsed_ms,
        ranked_best.typo_count,
        ranked_best.completed_at_ms,
        game_sessions.email_ciphertext,
        game_sessions.email_iv,
        game_sessions.email_auth_tag,
        game_sessions.phone_ciphertext,
        game_sessions.phone_iv,
        game_sessions.phone_auth_tag,
        game_sessions.privacy_consent_version,
        game_sessions.third_party_consent_version,
        game_sessions.consented_at_ms
      FROM ranked_best
      JOIN game_sessions ON game_sessions.id = ranked_best.session_id
      ORDER BY ranked_best.rank
    `).all() as BestRecordWithContactsRow[]

    return rows.map((row) => ({
      ...toRankedRecord(row),
      recordId: row.record_id,
      sessionId: row.session_id,
      completedAtMs: row.completed_at_ms,
      email: {
        ciphertext: row.email_ciphertext,
        iv: row.email_iv,
        authTag: row.email_auth_tag,
      },
      phone: {
        ciphertext: row.phone_ciphertext,
        iv: row.phone_iv,
        authTag: row.phone_auth_tag,
      },
      privacyConsentVersion: row.privacy_consent_version,
      thirdPartyConsentVersion: row.third_party_consent_version,
      consentedAtMs: row.consented_at_ms,
    }))
  }

  deleteAllData(): { sessionsDeleted: number; recordsDeleted: number } {
    return this.db.transaction(() => {
      const recordsDeleted = (this.countRecords.get() as { count: number }).count
      const sessionsDeleted = (this.countSessions.get() as { count: number }).count
      this.deleteRecords.run()
      this.deleteSessions.run()
      return { sessionsDeleted, recordsDeleted }
    }).immediate()
  }
}

export function createRepository(db: Database.Database): SessionRecordRepository {
  return new SessionRecordRepository(db)
}
