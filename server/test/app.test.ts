import { afterEach, describe, expect, test } from 'vitest'
import Database from 'better-sqlite3'
import { fileURLToPath } from 'node:url'
import { buildApp } from '../src/app.js'
import type { ServerConfig } from '../src/config.js'
import { runMigrations } from '../src/database/migrations.js'
import { createRepository } from '../src/database/repositories.js'
import { SlidingWindowRateLimiter } from '../src/http/rate-limit.js'

const config: ServerConfig = {
  host: '127.0.0.1',
  port: 0,
  databasePath: ':memory:',
  allowedOrigins: ['https://typing.example'],
  studentHmacKey: 'student-hmac-key-with-at-least-32-bytes',
  emailEncryptionKey: Buffer.alloc(32, 7),
  adminToken: 'admin-token-with-at-least-32-bytes!',
  trustProxy: 0,
}

const apps: { app: ReturnType<typeof buildApp>; db: Database.Database }[] = []

function createApp(overrides: Partial<ServerConfig> = {}) {
  const db = new Database(':memory:')
  runMigrations(db, fileURLToPath(new URL('../migrations/', import.meta.url)))
  const app = buildApp({
    config: { ...config, ...overrides },
    repository: createRepository(db),
  })
  apps.push({ app, db })
  return app
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map(async ({ app, db }) => {
    await app.close()
    db.close()
  }))
})

describe('Fastify application boundary', () => {
  test('allows configured origins and rejects an unconfigured origin', async () => {
    const app = createApp()

    const allowed = await app.inject({
      method: 'OPTIONS',
      url: '/health',
      headers: { origin: 'https://typing.example' },
    })
    const denied = await app.inject({
      method: 'OPTIONS',
      url: '/health',
      headers: { origin: 'https://evil.test' },
    })

    expect(allowed.headers).toMatchObject({
      'access-control-allow-origin': 'https://typing.example',
    })
    expect(denied.statusCode).toBe(403)
    expect(denied.json()).toEqual({
      code: 'TYPING_INVALID_INPUT',
      message: expect.any(String),
      data: null,
    })
  })

  test('leaves the session route available for the Task 6 handler', async () => {
    const app = createApp()

    app.post('/api/v2/campus-typing/sessions', async () => ({
      code: 'SUCCESS',
      message: 'Task 6 handler.',
      data: null,
    }))

    const response = await app.inject({
      method: 'POST',
      url: '/api/v2/campus-typing/sessions',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      code: 'SUCCESS',
      message: 'Task 6 handler.',
      data: null,
    })
  })

  test('limits request bodies to 16 KiB with the stable error envelope', async () => {
    const app = createApp()
    app.post('/body-limit-test', async () => ({ code: 'SUCCESS', message: 'ok', data: null }))

    const response = await app.inject({
      method: 'POST',
      url: '/body-limit-test',
      payload: { padding: 'x'.repeat(16 * 1024) },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({
      code: 'TYPING_INVALID_INPUT',
      message: expect.any(String),
      data: null,
    })
  })

  test('returns the health payload in the success envelope with security headers', async () => {
    const app = createApp()

    const response = await app.inject({ method: 'GET', url: '/health' })

    expect(response.statusCode).toBe(200)
    expect(response.headers['x-content-type-options']).toBe('nosniff')
    expect(response.json()).toEqual({
      code: 'SUCCESS',
      message: expect.any(String),
      data: { status: 'ok' },
    })
  })

  test('does not expose Fastify error details for an unknown route', async () => {
    const app = createApp()

    const response = await app.inject({ method: 'GET', url: '/not-a-real-route' })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({
      code: 'TYPING_SESSION_NOT_FOUND',
      message: expect.any(String),
      data: null,
    })
    expect(response.body).not.toContain('/not-a-real-route')
  })

  test('only trusts forwarded client addresses when configured to trust a proxy', async () => {
    const untrusted = createApp({ trustProxy: 0 })
    const trusted = createApp({ trustProxy: 1 })
    let untrustedIp = ''
    let trustedIp = ''
    untrusted.addHook('onRequest', (request, _reply, done) => {
      untrustedIp = request.ip
      done()
    })
    trusted.addHook('onRequest', (request, _reply, done) => {
      trustedIp = request.ip
      done()
    })

    const headers = { 'x-forwarded-for': '198.51.100.8' }
    await untrusted.inject({ method: 'GET', url: '/health', headers, remoteAddress: '203.0.113.7' })
    await trusted.inject({ method: 'GET', url: '/health', headers, remoteAddress: '203.0.113.7' })

    expect(untrustedIp).not.toBe('198.51.100.8')
    expect(trustedIp).toBe('198.51.100.8')
  })
})

describe('SlidingWindowRateLimiter', () => {
  test('rejects the request after its limit until the 60-second window expires', () => {
    const limiter = new SlidingWindowRateLimiter()

    expect(limiter.check('public', 'ip-hash', 2, 1_000)).toBe(true)
    expect(limiter.check('public', 'ip-hash', 2, 2_000)).toBe(true)
    expect(limiter.check('public', 'ip-hash', 2, 3_000)).toBe(false)
    expect(limiter.check('public', 'ip-hash', 2, 61_000)).toBe(true)
  })

  test('keeps scopes and keys independent and discards expired buckets', () => {
    const limiter = new SlidingWindowRateLimiter()

    expect(limiter.check('public', 'ip-a', 1, 0)).toBe(true)
    expect(limiter.check('admin', 'ip-a', 1, 0)).toBe(true)
    expect(limiter.check('public', 'ip-b', 1, 0)).toBe(true)
    expect(limiter.check('public', 'ip-a', 1, 60_001)).toBe(true)
  })

  test('reclaims an inactive expired bucket when a different key is accessed', () => {
    const limiter = new SlidingWindowRateLimiter()

    expect(limiter.check('public', 'inactive-ip', 1, 0)).toBe(true)
    expect(limiter.bucketCount).toBe(1)

    expect(limiter.check('admin', 'active-ip', 1, 60_001)).toBe(true)
    expect(limiter.bucketCount).toBe(1)
  })
})
