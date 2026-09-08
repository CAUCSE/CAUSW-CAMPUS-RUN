import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { startServer, type RunningServer } from '../src/main.js'

const validEnv = {
  HOST: '127.0.0.1',
  PORT: '3001',
  DATABASE_PATH: ':memory:',
  ALLOWED_ORIGINS: 'http://localhost:5173',
  STUDENT_NUMBER_HMAC_KEY: 'student-hmac-key-with-at-least-32-bytes',
  EMAIL_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  ADMIN_TOKEN: 'admin-token-with-at-least-32-bytes!',
  TRUST_PROXY: '0',
}

const cleanup: Array<() => Promise<void>> = []

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((remove) => remove()))
})

test('starts on an ephemeral port and closes app and database idempotently', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cau-typing-server-'))
  const databasePath = join(directory, 'leaderboard.sqlite')
  cleanup.push(() => rm(directory, { recursive: true, force: true }))

  let running: RunningServer | undefined
  try {
    running = await startServer({ ...validEnv, PORT: '0', DATABASE_PATH: databasePath })

    const health = await fetch(`${running.origin}/health`)
    expect(health.status).toBe(200)
    await health.text()

    await running.close()
    await expect(running.close()).resolves.toBeUndefined()
    running = undefined
  } finally {
    await running?.close()
  }
})
