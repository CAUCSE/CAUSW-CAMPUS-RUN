# Standalone Leaderboard Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Fastify and SQLite server inside this repository that securely stores typing-game records, exposes one best leaderboard entry per student, exports protected winner contacts, and collects required email, phone, and privacy consent from the lobby.

**Architecture:** A standalone `server/` TypeScript package owns HTTP, validation, privacy transforms, SQLite migrations, repositories, and public/admin routes. The React frontend keeps its existing API boundary and adds contact and consent fields; both packages consume one fixed campus-course JSON file. Server integration tests use Fastify `inject` and a temporary SQLite database so no live port or persistent data is required.

**Tech Stack:** Node.js 22.12+, TypeScript, Fastify, `@fastify/cors`, `@fastify/helmet`, `better-sqlite3`, Zod, Vitest, React 19, Testing Library

**Spec:** `docs/superpowers/specs/2026-09-08-standalone-leaderboard-server-design.md`

## Global Constraints

- Keep the server in an independently runnable `server/` package; it must not serve frontend assets.
- Deployment, TLS, reverse proxy, domain, and tunnel configuration are outside this implementation.
- Store no plaintext student number; identify students with HMAC-SHA-256 using `STUDENT_NUMBER_HMAC_KEY`.
- Encrypt email and phone independently with AES-256-GCM using `EMAIL_ENCRYPTION_KEY`, a random 12-byte IV, and `${sessionId}:${field}` as additional authenticated data.
- Require both privacy consent flags and persist server-owned consent versions plus server receipt time.
- Never include student hash, email, phone, consent audit values, ciphertext, request bodies, or authorization headers in public responses or logs.
- Use fixed course order ending in `100주년기념관`; do not shuffle server or local-test courses.
- Official duration is server completion time minus server session start time; accept 5,000 through 600,000 milliseconds inclusive.
- Public ranking selects one best record per student by duration, typo count, completion time, then record ID.
- Admin CSV and delete endpoints require a timing-safe Bearer token check.
- All feature and bugfix implementation follows red-green-refactor; every task runs its focused tests before its commit.
- Preserve unrelated existing changes in `e2e/typing-game.spec.ts`, `src/lobby/LobbyPage.module.css`, `public/images/campus-map.png`, and the campus-map planning note unless a later task explicitly needs the first two files.

---

### Task 1: Shared fixed course and server package foundation

**Files:**
- Create: `shared/campus-course.json`
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `server/src/course.ts`
- Create: `server/src/config.ts`
- Create: `server/test/config.test.ts`
- Modify: `src/shared/course.ts`
- Modify: `src/shared/local-game.ts`
- Modify: `src/shared/local-game.test.ts`
- Modify: `.gitignore`
- Modify: `package.json`

**Interfaces:**
- Produces: `CAMPUS_COURSE: readonly string[]` in both frontend and server from `shared/campus-course.json`.
- Produces: `loadConfig(env?: NodeJS.ProcessEnv): ServerConfig` where `ServerConfig` contains `host`, `port`, `databasePath`, `allowedOrigins`, `studentHmacKey`, `emailEncryptionKey`, `adminToken`, and `trustProxy`.
- Produces: root scripts `server:dev`, `server:test`, `server:build`, and `verify`.

- [ ] **Step 1: Write failing fixed-course and config tests**

Add tests proving the local course is no longer shuffled and config rejects weak secrets:

```ts
test('returns the fixed course ending at 100주년기념관', () => {
  expect(createLocalGameSession().course).toEqual(CAMPUS_COURSE)
  expect(createLocalGameSession().course.at(-1)).toBe('100주년기념관')
})

test('loads validated server configuration', () => {
  expect(loadConfig(validEnv)).toMatchObject({ host: '127.0.0.1', port: 3001, trustProxy: 0 })
})

test('rejects an encryption key that is not 32 decoded bytes', () => {
  expect(() => loadConfig({ ...validEnv, EMAIL_ENCRYPTION_KEY: Buffer.from('short').toString('base64') }))
    .toThrow('EMAIL_ENCRYPTION_KEY')
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run src/shared/local-game.test.ts && npm --prefix server test -- --run test/config.test.ts`

Expected: frontend fixed-order assertion fails because `shuffleCourse()` changes order; the server command fails because the package and `loadConfig` do not exist.

- [ ] **Step 3: Add shared course JSON and server scaffold**

Move the 18 literal course names into `shared/campus-course.json`. Import it from both course modules and export a copied readonly array. Remove `shuffleCourse()` and return `[...CAMPUS_COURSE]` from `createLocalGameSession()`.

Create `server/package.json` with ESM mode and scripts:

```json
{
  "name": "cau-typy-server",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22.12.0" },
  "scripts": {
    "dev": "tsx watch src/main.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/main.js",
    "test": "vitest"
  }
}
```

Install runtime dependencies with `npm install --prefix server fastify @fastify/cors @fastify/helmet better-sqlite3 zod` and development dependencies with `npm install --prefix server -D @types/better-sqlite3 @types/node tsx typescript vitest`.

Implement config validation with Zod. Decode `EMAIL_ENCRYPTION_KEY` and require 32 bytes; require HMAC key and admin token to be at least 32 UTF-8 bytes; split and trim `ALLOWED_ORIGINS`; parse `PORT` as 0–65535 (`0` requests an OS-assigned test port) and `TRUST_PROXY` as a non-negative integer.

Add these root scripts:

```json
{
  "server:dev": "npm --prefix server run dev",
  "server:test": "npm --prefix server test -- --run",
  "server:build": "npm --prefix server run build",
  "verify": "npm test -- --run && npm run server:test && npm run build && npm run server:build"
}
```

Ignore `data/`, `*.sqlite`, `*.sqlite-shm`, `*.sqlite-wal`, `server/dist/`, and `server/.env`.

- [ ] **Step 4: Run focused tests and builds**

Run: `npm test -- --run src/shared/local-game.test.ts && npm --prefix server test -- --run test/config.test.ts && npm --prefix server run build`

Expected: all focused tests pass and server TypeScript emits `server/dist` without diagnostics.

- [ ] **Step 5: Commit**

```bash
git add .gitignore package.json package-lock.json shared/campus-course.json src/shared/course.ts src/shared/local-game.ts src/shared/local-game.test.ts server/package.json server/package-lock.json server/tsconfig.json server/src/course.ts server/src/config.ts server/test/config.test.ts
git commit -m "feat: 독립 저장 서버 기반 구성"
```

### Task 2: SQLite migrations and database lifecycle

**Files:**
- Create: `server/migrations/001_initial.sql`
- Create: `server/src/database/connection.ts`
- Create: `server/src/database/migrations.ts`
- Create: `server/test/database.test.ts`

**Interfaces:**
- Consumes: `ServerConfig.databasePath` from Task 1.
- Produces: `openDatabase(path: string): Database.Database` configured with foreign keys, WAL where supported, and a 5,000 ms busy timeout.
- Produces: `runMigrations(db: Database.Database, directory: string): void`.

- [ ] **Step 1: Write failing migration tests**

Use a temporary directory and assert schema, pragmas, idempotency, and future-version refusal:

```ts
test('creates the session, record, and migration tables idempotently', () => {
  const db = openDatabase(databasePath)
  runMigrations(db, migrationsDirectory)
  runMigrations(db, migrationsDirectory)
  const names = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()
  expect(names).toEqual(expect.arrayContaining([
    { name: 'game_sessions' }, { name: 'game_records' }, { name: 'schema_migrations' },
  ]))
  expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix server test -- --run test/database.test.ts`

Expected: FAIL because database connection and migration functions are missing.

- [ ] **Step 3: Implement the initial schema and migration runner**

Create the exact columns and constraints from the spec. Add indexes on session student hash, record student hash, official duration, and completion time. Define `game_records.session_id` as unique with `ON DELETE CASCADE`. Use `INTEGER NOT NULL CHECK (typo_count >= 0)` and duration checks. The migration runner must sort `NNN_name.sql`, apply each file once in a transaction, and throw if the DB contains a migration number higher than the highest bundled file.

`openDatabase()` must create the parent directory, execute:

```sql
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
PRAGMA journal_mode = WAL;
```

Allow `:memory:` in tests without directory creation and accept SQLite's memory journal mode.

- [ ] **Step 4: Run database tests**

Run: `npm --prefix server test -- --run test/database.test.ts`

Expected: PASS with temporary files removed by test cleanup.

- [ ] **Step 5: Commit**

```bash
git add server/migrations/001_initial.sql server/src/database/connection.ts server/src/database/migrations.ts server/test/database.test.ts
git commit -m "feat: SQLite 스키마와 마이그레이션 추가"
```

### Task 3: Identity, encrypted contacts, consent, and input validation

**Files:**
- Create: `server/src/security/identity.ts`
- Create: `server/src/security/contact-encryption.ts`
- Create: `server/src/validation.ts`
- Create: `server/src/consent.ts`
- Create: `server/test/privacy.test.ts`
- Create: `server/test/validation.test.ts`

**Interfaces:**
- Produces: `studentHash(studentNumber: string, key: string): string`.
- Produces: `dailyIpHash(ip: string, nowMs: number, key: string): string` using a UTC date and an `ip:` domain separator.
- Produces: `encryptContact(value: string, sessionId: string, field: 'email' | 'phone', key: Buffer): EncryptedContact` and matching `decryptContact`.
- Produces: `normalizePhone(value: string): string` and `normalizeEmail(value: string): string`.
- Produces: `CreateSessionInputSchema` requiring `studentNumber`, `nickname`, `email`, `phoneNumber`, `privacyConsent: true`, and `thirdPartyConsent: true`.
- Produces: `PRIVACY_CONSENT_VERSION = '2026-09-08'` and `THIRD_PARTY_CONSENT_VERSION = '2026-09-08'`.

- [ ] **Step 1: Write failing privacy and validation tests**

```ts
test('encrypts email and phone with field-bound authenticated data', () => {
  const encrypted = encryptContact('01012345678', 'session-1', 'phone', key)
  expect(encrypted.ciphertext).not.toContain('01012345678')
  expect(decryptContact(encrypted, 'session-1', 'phone', key)).toBe('01012345678')
  expect(() => decryptContact(encrypted, 'session-1', 'email', key)).toThrow()
})

test('requires normalized contact data and both explicit consents', () => {
  expect(CreateSessionInputSchema.safeParse(validInput).success).toBe(true)
  expect(CreateSessionInputSchema.safeParse({ ...validInput, phoneNumber: '011-123-4567' }).success).toBe(false)
  expect(CreateSessionInputSchema.safeParse({ ...validInput, privacyConsent: false }).success).toBe(false)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --prefix server test -- --run test/privacy.test.ts test/validation.test.ts`

Expected: FAIL because security and validation modules do not exist.

- [ ] **Step 3: Implement privacy primitives and schemas**

Use `createHmac('sha256', key)` over the digits-only student number with a `student:` domain separator. Hash IP audit values as `ip:${YYYY-MM-DD}:${ip}` with the UTC server date so stored IP correlation expires daily. Use `randomBytes(12)`, `createCipheriv('aes-256-gcm', key, iv)`, `setAAD(Buffer.from(`${sessionId}:${field}`))`, and the corresponding decipher operations. Serialize ciphertext, IV, and auth tag as Base64.

Normalize email with `trim().toLowerCase()`. Normalize phone by removing spaces and hyphens, then require `/^010\d{8}$/`. Require student number `/^\d{8}(\d{2})?$/`, nickname trim length 1–12, email maximum 254 with one `@` and non-empty domain, reported duration integer 0–600,000, and typo count non-negative integer.

- [ ] **Step 4: Run privacy and validation tests**

Run: `npm --prefix server test -- --run test/privacy.test.ts test/validation.test.ts`

Expected: all tests pass, including authentication failure on altered tag, session ID, field, and key.

- [ ] **Step 5: Commit**

```bash
git add server/src/security/identity.ts server/src/security/contact-encryption.ts server/src/validation.ts server/src/consent.ts server/test/privacy.test.ts server/test/validation.test.ts
git commit -m "feat: 개인정보 암호화와 동의 검증 추가"
```

### Task 4: Session and record repository

**Files:**
- Create: `server/src/database/repositories.ts`
- Create: `server/test/repositories.test.ts`

**Interfaces:**
- Consumes: migrated `Database.Database`, encrypted contact values, fixed course.
- Produces: `createSession(input: NewSession): StoredSession`.
- Produces: `completeSession(sessionId: string, reportedElapsedMs: number, typoCount: number, nowMs: number): StoredRecord`.
- Produces: `getLeaderboard(limit: number): RankedRecord[]`.
- Produces: `getBestRecordsWithContacts(): BestRecordWithContacts[]`.
- Produces: `deleteAllData(): { sessionsDeleted: number; recordsDeleted: number }`.

- [ ] **Step 1: Write failing repository tests**

Cover atomic completion and deterministic best-record selection:

```ts
test('keeps every attempt but ranks one best record per student', () => {
  seedCompletedRecord({ studentHash: 'same', elapsedMs: 20_000, typoCount: 2 })
  seedCompletedRecord({ studentHash: 'same', elapsedMs: 18_000, typoCount: 3 })
  seedCompletedRecord({ studentHash: 'other', elapsedMs: 19_000, typoCount: 0 })
  expect(repository.getLeaderboard(10).map(({ studentHash: _, ...entry }) => entry)).toMatchObject([
    { rank: 1, officialElapsedMilliseconds: 18_000 },
    { rank: 2, officialElapsedMilliseconds: 19_000 },
  ])
  expect(db.prepare('SELECT count(*) AS count FROM game_records').get()).toEqual({ count: 3 })
})

test('rejects completing the same session twice', () => {
  expect(() => repository.completeSession(id, 10_000, 0, startedAt + 10_000)).not.toThrow()
  expect(() => repository.completeSession(id, 10_000, 0, startedAt + 11_000)).toThrow('SESSION_COMPLETED')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix server test -- --run test/repositories.test.ts`

Expected: FAIL because repository operations are missing.

- [ ] **Step 3: Implement repository transactions and ranking SQL**

Use one transaction to load a session, reject missing/expired/completed sessions, calculate `nowMs - started_at_ms`, insert a record, and set `completed_at_ms`. Represent domain failures with stable error kinds `SESSION_NOT_FOUND`, `SESSION_EXPIRED`, `SESSION_COMPLETED`, and `INVALID_DURATION`.

Use `ROW_NUMBER() OVER (PARTITION BY student_hash ORDER BY official_elapsed_ms, typo_count, completed_at_ms, id)` to pick one record per student, then assign public rank with the same ordering. Keep contact decryption outside SQL; the admin query returns encrypted fields and consent audit columns from the winning record's session.

Delete records then sessions inside one immediate transaction and return both pre-delete counts.

- [ ] **Step 4: Run repository tests**

Run: `npm --prefix server test -- --run test/repositories.test.ts`

Expected: all missing, expired, duplicate, duration boundary, ranking tie-break, and delete transaction tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/src/database/repositories.ts server/test/repositories.test.ts
git commit -m "feat: 세션 기록과 최고 순위 저장소 구현"
```

### Task 5: Fastify application boundary and request protection

**Files:**
- Create: `server/src/http/errors.ts`
- Create: `server/src/http/rate-limit.ts`
- Create: `server/src/app.ts`
- Create: `server/test/app.test.ts`

**Interfaces:**
- Consumes: `ServerConfig`, repository, CORS origins.
- Produces: `buildApp(options: AppOptions): FastifyInstance` with request logging redaction, CORS, security headers, 16 KiB body limit, and stable response envelopes.
- Produces: `SlidingWindowRateLimiter.check(scope: string, key: string, limit: number, nowMs: number): boolean`.

- [ ] **Step 1: Write failing app-boundary tests**

```ts
test('allows configured origins and rejects an unconfigured origin', async () => {
  expect((await app.inject({ method: 'OPTIONS', url: '/health', headers: { origin: allowed } })).headers)
    .toMatchObject({ 'access-control-allow-origin': allowed })
  expect((await app.inject({ method: 'OPTIONS', url: '/health', headers: { origin: 'https://evil.test' } })).statusCode)
    .toBe(403)
})

test('returns a stable envelope without echoing invalid private input', async () => {
  const response = await app.inject({ method: 'POST', url: '/api/v2/campus-typing/sessions', payload: { email: 'secret@example.com' } })
  expect(response.statusCode).toBe(400)
  expect(response.json()).toEqual({ code: 'TYPING_INVALID_INPUT', message: expect.any(String), data: null })
  expect(response.body).not.toContain('secret@example.com')
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --prefix server test -- --run test/app.test.ts`

Expected: FAIL because the Fastify app builder is missing.

- [ ] **Step 3: Implement the app boundary**

Register `@fastify/cors` with exact string matching against `allowedOrigins`; requests without Origin remain allowed for health checks and server-to-server admin access. Register `@fastify/helmet`. Set `bodyLimit: 16 * 1024`, `trustProxy` from validated config, and logger redaction for `req.headers.authorization`, `req.body`, and `res.headers['set-cookie']`.

Map Zod/Fastify validation and domain errors to the spec's HTTP status and code table. Return `{ code, message, data }` for success and `{ code, message, data: null }` for errors. Add `GET /health` returning only `{ status: 'ok' }` inside the success envelope.

Implement an in-memory 60-second window limiter keyed by `${scope}:${key}`. Delete expired buckets on access. Route modules will apply IP and student/session-specific limits without persisting raw IP.

- [ ] **Step 4: Run app tests**

Run: `npm --prefix server test -- --run test/app.test.ts`

Expected: CORS, body-size, validation envelope, private-data non-reflection, and limiter boundary tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/src/http/errors.ts server/src/http/rate-limit.ts server/src/app.ts server/test/app.test.ts
git commit -m "feat: 서버 요청 보호와 오류 응답 구성"
```

### Task 6: Public session, completion, and leaderboard routes

**Files:**
- Create: `server/src/routes/sessions.ts`
- Create: `server/src/routes/leaderboard.ts`
- Create: `server/test/public-api.test.ts`
- Modify: `server/src/app.ts`

**Interfaces:**
- Consumes: validation, HMAC, contact encryption, consent versions, repository, fixed course, limiter.
- Produces: the three existing `/api/v2/campus-typing` public endpoints.

- [ ] **Step 1: Write failing public API integration tests**

Use a fake clock passed through `AppOptions.now`:

```ts
test('creates, completes, and publicly ranks a private session', async () => {
  const created = await app.inject({ method: 'POST', url: sessionsUrl, payload: validCreateInput })
  expect(created.statusCode).toBe(200)
  expect(created.json().data).toMatchObject({ course: CAMPUS_COURSE })
  expect(created.body).not.toContain(validCreateInput.email)
  now += 18_000
  const completed = await app.inject({ method: 'POST', url: `${sessionsUrl}/${created.json().data.sessionId}/completion`, payload: { reportedElapsedMilliseconds: 18_000, typoCount: 1 } })
  expect(completed.json().data).toMatchObject({ rankingStatus: 'ELIGIBLE', rank: 1 })
  const leaderboard = await app.inject({ method: 'GET', url: leaderboardUrl })
  expect(leaderboard.json().data.entries).toEqual([
    { rank: 1, nickname: '청룡', officialElapsedMilliseconds: 18_000, typoCount: 1 },
  ])
})
```

Also test invalid contacts/consents, 4,999 and 600,001 ms official durations, expiration, duplicate completion, one best entry per student, and route-specific request limits.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix server test -- --run test/public-api.test.ts`

Expected: FAIL with 404 because public routes are not registered.

- [ ] **Step 3: Implement public routes**

At session creation, normalize inputs, derive the student hash and daily IP audit hash, generate UUID, encrypt email and phone using distinct field AAD, attach fixed course JSON, store both server consent versions and `now()`, then return ISO start/expiry timestamps. Apply IP limit 10/min and student hash limit 3/min.

At completion, validate body, invoke the repository transaction with `now()`, query the top 10 and the current student's rank, and return the existing `CompletionResponse` shape with `rankingStatus: 'ELIGIBLE'`. Apply IP limit 30/min and rely on the session unique constraint for one completion.

At leaderboard, return `{ entries, updatedAt: new Date(now()).toISOString() }`, limit 10, and apply IP limit 120/min. Never select private columns for public route serialization.

- [ ] **Step 4: Run public API tests**

Run: `npm --prefix server test -- --run test/public-api.test.ts`

Expected: all happy-path, privacy, boundary, deduplication, and request-limit tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/sessions.ts server/src/routes/leaderboard.ts server/src/app.ts server/test/public-api.test.ts
git commit -m "feat: 게임 세션과 공개 리더보드 API 구현"
```

### Task 7: Protected CSV export and destructive delete

**Files:**
- Create: `server/src/security/admin-auth.ts`
- Create: `server/src/csv.ts`
- Create: `server/src/routes/admin.ts`
- Create: `server/test/admin-api.test.ts`
- Modify: `server/src/app.ts`

**Interfaces:**
- Consumes: admin token, contact decryption, best-record admin query, delete transaction, limiter.
- Produces: `GET /api/v2/admin/campus-typing/records.csv` and `DELETE /api/v2/admin/campus-typing/records`.
- Produces: `escapeCsvCell(value: string | number): string` and `toWinnerCsv(rows: WinnerRow[]): string`.

- [ ] **Step 1: Write failing admin API tests**

```ts
test('exports authenticated best records with decrypted contacts and consent audit data', async () => {
  const response = await app.inject({ method: 'GET', url: csvUrl, headers: { authorization: `Bearer ${adminToken}` } })
  expect(response.statusCode).toBe(200)
  expect(response.headers['content-type']).toContain('text/csv')
  expect(response.body.startsWith('\uFEFFrank,studentHash,nickname,email,phoneNumber')).toBe(true)
  expect(response.body).toContain('winner@example.com')
  expect(response.body).toContain('01012345678')
})

test('does not delete without the exact confirmation', async () => {
  const response = await app.inject({ method: 'DELETE', url: deleteUrl, headers: auth, payload: { confirmation: 'DELETE' } })
  expect(response.statusCode).toBe(400)
  expect(repository.getLeaderboard(10)).toHaveLength(1)
})
```

Test missing/malformed/wrong tokens, formula-leading cells `=`, `+`, `-`, `@`, tab, and carriage return, correct deleted counts, empty post-delete CSV, and admin 10/min request limit.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --prefix server test -- --run test/admin-api.test.ts`

Expected: FAIL because admin routes and CSV encoder do not exist.

- [ ] **Step 3: Implement token auth, CSV, and delete route**

Parse exactly one `Bearer ` authorization value. Compare equal-length SHA-256 digests of supplied and configured tokens with `timingSafeEqual`; never compare raw variable-length buffers.

Prefix formula-dangerous string cells with `'`, double embedded quotes, quote cells containing comma, quote, CR, or LF, prepend UTF-8 BOM, and use CRLF rows. Set attachment filename `campus-typing-records.csv`.

Decrypt only the winning rows after authentication. The delete body must equal `{ confirmation: 'DELETE ALL CAMPUS TYPING DATA' }`; then call the repository transaction and return `{ sessionsDeleted, recordsDeleted }`.

- [ ] **Step 4: Run admin tests**

Run: `npm --prefix server test -- --run test/admin-api.test.ts`

Expected: authenticated export and delete pass; every unauthorized or malformed request leaves the database unchanged.

- [ ] **Step 5: Commit**

```bash
git add server/src/security/admin-auth.ts server/src/csv.ts server/src/routes/admin.ts server/src/app.ts server/test/admin-api.test.ts
git commit -m "feat: 관리자 CSV와 기록 삭제 API 구현"
```

### Task 8: Server startup and graceful shutdown

**Files:**
- Create: `server/src/main.ts`
- Create: `server/.env.example`
- Create: `server/test/main.test.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: config loader, DB connection/migrations, repository, app builder.
- Produces: `startServer(env?: NodeJS.ProcessEnv): Promise<RunningServer>` and idempotent `RunningServer.close(): Promise<void>`.

- [ ] **Step 1: Write failing lifecycle test**

```ts
test('starts on an ephemeral port and closes app and database idempotently', async () => {
  const running = await startServer({ ...validEnv, PORT: '0', DATABASE_PATH: databasePath })
  expect((await fetch(`${running.origin}/health`)).status).toBe(200)
  await running.close()
  await expect(running.close()).resolves.toBeUndefined()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix server test -- --run test/main.test.ts`

Expected: FAIL because `startServer` and process lifecycle do not exist.

- [ ] **Step 3: Implement composition root and documentation**

Load config, open DB, run migrations relative to the built server package, construct repository and Fastify app, then listen. Register `SIGINT` and `SIGTERM` handlers only in the direct CLI entry path, not when imported by tests. `close()` stops Fastify before closing SQLite and tolerates a second call.

Document secret generation with `openssl rand -base64 32` for the AES key and `openssl rand -hex 32` for HMAC/admin secrets. The example file must contain non-secret placeholders, localhost Origin, and comments explaining that production TLS/reverse proxy is operator-managed.

- [ ] **Step 4: Run lifecycle and server build tests**

Run: `npm --prefix server test -- --run test/main.test.ts && npm --prefix server run build`

Expected: health request succeeds, shutdown completes twice, and compiled startup locates migrations.

- [ ] **Step 5: Commit**

```bash
git add server/src/main.ts server/.env.example server/test/main.test.ts README.md
git commit -m "feat: 저장 서버 실행과 종료 흐름 추가"
```

### Task 9: Frontend contact fields and privacy consent

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/shared/api.test.ts`
- Modify: `src/lobby/LobbyPage.tsx`
- Modify: `src/lobby/LobbyPage.module.css`
- Modify: `src/lobby/LobbyPage.test.tsx`
- Modify: `e2e/typing-game.spec.ts`

**Interfaces:**
- Consumes: unchanged session response and the server request contract from Task 6.
- Produces: `CreateSessionRequest` with `email`, `phoneNumber`, `privacyConsent`, and `thirdPartyConsent`.
- Produces: lobby fields labeled `이메일`, `휴대전화번호`, `개인정보 수집·이용에 동의합니다. (필수)`, and `센드비를 통한 경품 발송을 위한 개인정보 제공에 동의합니다. (필수)`.

- [ ] **Step 1: Write failing frontend tests**

Update API and lobby tests to type all fields, expand both consent disclosures, check both boxes, and assert the exact request:

```ts
expect(mocks.createGameSession).toHaveBeenCalledWith({
  studentNumber: '20240001',
  nickname: '청룡',
  email: 'winner@example.com',
  phoneNumber: '01012345678',
  privacyConsent: true,
  thirdPartyConsent: true,
})
```

Add separate disabled-button cases for invalid email, invalid phone, missing privacy consent, and missing third-party consent. Assert the disclosure text includes `ICT 위원회`, `경품 발송 완료 후 30일`, and `㈜윈큐브마케팅(센드비)`. Assert an API rejection preserves all field values and checked states.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run src/shared/api.test.ts src/lobby/LobbyPage.test.tsx`

Expected: FAIL because request types, fields, disclosures, and consent gates are absent.

- [ ] **Step 3: Implement contact and consent UI**

Add controlled email and phone state. Format phone input by retaining at most 11 digits and displaying `010-1234-5678`; send digits only. Validate email after trim/lowercase and phone with `/^010\d{8}$/`.

Use native `<details><summary>` for each full disclosure so it works with keyboard and screen readers. Render the exact two agreement texts from the spec. Keep both checkboxes unchecked initially and include them in `canStart`. Preserve state on request failure. In local test mode, enforce the same UI validation but call `createLocalGameSession()` without passing contacts.

Update the E2E route assertion and every start flow to fill email/phone and check both agreements. Retain the existing user-authored viewport assertions, adjusting lobby layout only as required to avoid overlap; do not weaken element visibility assertions.

- [ ] **Step 4: Run frontend tests and browser flow**

Run: `npm test -- --run src/shared/api.test.ts src/lobby/LobbyPage.test.tsx && npm run test:e2e -- e2e/typing-game.spec.ts`

Expected: unit/component tests pass and all lobby-to-result browser scenarios submit the exact privacy-aware request.

- [ ] **Step 5: Commit**

```bash
git add src/shared/types.ts src/shared/api.test.ts src/lobby/LobbyPage.tsx src/lobby/LobbyPage.module.css src/lobby/LobbyPage.test.tsx e2e/typing-game.spec.ts
git commit -m "feat: 연락처 입력과 개인정보 동의 추가"
```

### Task 10: Full integration verification and operator handoff

**Files:**
- Create: `server/test/full-flow.test.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: all frontend and server behavior from Tasks 1–9.
- Produces: one executable server full-flow regression and complete local-operation documentation.

- [ ] **Step 1: Write the full-flow integration test**

Against a temporary SQLite DB and injected clock, execute two students and one retrying student through session creation and completion. Assert one best row per student, public privacy, authenticated CSV contacts and consent versions, then destructive deletion and empty leaderboard.

```ts
expect(leaderboard.entries.map((entry) => entry.nickname)).toEqual(['청룡-재도전', '백호'])
expect(JSON.stringify(leaderboard)).not.toMatch(/studentHash|email|phone|consent/i)
expect(csv).toContain('winner@example.com')
expect((await deleteAll()).data).toEqual({ sessionsDeleted: 3, recordsDeleted: 3 })
expect((await getLeaderboard()).data.entries).toEqual([])
```

- [ ] **Step 2: Run the full-flow test and verify it fails if any boundary is missing**

Run: `npm --prefix server test -- --run test/full-flow.test.ts`

Expected: PASS only after all prior tasks are complete; temporarily mutate the expected admin token in the test request and observe 401, then restore it and rerun green.

- [ ] **Step 3: Complete operator documentation**

Document install, migration-on-start, development commands, production build/start commands, required environment variables, SQLite/WAL backup files, CSV download with curl, and destructive delete with curl. Include these exact examples without real secrets:

```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" http://127.0.0.1:3001/api/v2/admin/campus-typing/records.csv --output campus-typing-records.csv

curl -X DELETE -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  --data '{"confirmation":"DELETE ALL CAMPUS TYPING DATA"}' \
  http://127.0.0.1:3001/api/v2/admin/campus-typing/records
```

Warn the operator to confirm whether the SendB contract treats ㈜윈큐브마케팅 as a processor or third-party recipient before launch, and to revise/increment the consent version if the notice changes.

- [ ] **Step 4: Run complete verification**

Run: `npm run verify && npm run test:e2e && git diff --check`

Expected: frontend tests, server tests, both TypeScript builds, all browser tests, and whitespace validation exit 0.

- [ ] **Step 5: Review privacy leakage mechanically**

Run: `rg -n "console\.(log|debug|info|warn)|request\.body|req\.body" server/src src -g '*.ts' -g '*.tsx'`

Expected: no logging statement serializes request bodies, contacts, student numbers, encryption values, consent values, or authorization headers. Validation and route body reads are allowed only where values are immediately normalized/transformed.

- [ ] **Step 6: Commit**

```bash
git add README.md server/test/full-flow.test.ts
git commit -m "test: 독립 저장 서버 전체 흐름 검증"
```
