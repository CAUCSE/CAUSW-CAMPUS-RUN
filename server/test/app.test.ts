import { afterEach, describe, expect, test } from 'vitest'
import Database from 'better-sqlite3'
import { fileURLToPath } from 'node:url'
import { buildApp, type AppOptions } from '../src/app.js'
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
  adminEmail: 'admin@example.com',
  adminPassword: 'admin-password-with-at-least-32-bytes!',
  trustProxy: 0,
}

const apps: { app: ReturnType<typeof buildApp>; db: Database.Database }[] = []

function createApp(overrides: Partial<ServerConfig> = {}, logStream?: AppOptions['logStream']) {
  const db = new Database(':memory:')
  runMigrations(db, fileURLToPath(new URL('../migrations/', import.meta.url)))
  const app = buildApp({
    config: { ...config, ...overrides },
    repository: createRepository(db),
    ...(logStream === undefined ? {} : { logStream }),
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
  test('logs only generated request ID, route template, status and duration for adversarial requests', async () => {
    const chunks: string[] = []
    const app = createApp({}, { write(message) { chunks.push(message) } })
    app.get('/internal-error', async () => { throw new Error('private-error@example.com') })
    app.get('/cookie-response', async (_request, reply) => reply.header('set-cookie', 'private-response-cookie').send({ ok: true }))
    const headers = {
      host: 'private-host.example',
      authorization: 'Bearer private-admin-token',
      cookie: 'session=private-cookie',
      'x-request-id': 'private-request-id',
    }
    const requests = [
      { method: 'GET' as const, url: '/health?email=private-query@example.com&studentNumber=20249999', route: '/health', status: 200 },
      { method: 'GET' as const, url: '/private-path@example.com', route: 'unknown', status: 404 },
      { method: 'POST' as const, url: '/api/v2/campus-typing/sessions/private-session-id/completion', payload: { reportedElapsedMilliseconds: 5000, typoCount: 0 }, route: '/api/v2/campus-typing/sessions/:sessionId/completion', status: 404 },
      { method: 'POST' as const, url: '/api/v2/campus-typing/sessions', payload: { email: 'private-body@example.com', phoneNumber: '01087654321' }, route: '/api/v2/campus-typing/sessions', status: 400 },
      { method: 'GET' as const, url: '/api/v2/admin/campus-typing/records.csv', route: '/api/v2/admin/campus-typing/records.csv', status: 401 },
      { method: 'GET' as const, url: '/internal-error', route: '/internal-error', status: 500 },
      { method: 'GET' as const, url: '/cookie-response', route: '/cookie-response', status: 200 },
      ...Array.from({ length: 9 }, () => ({ method: 'GET' as const, url: '/api/v2/admin/campus-typing/records.csv?email=private-rate@example.com', route: '/api/v2/admin/campus-typing/records.csv', status: 401 })),
      { method: 'GET' as const, url: '/api/v2/admin/campus-typing/records.csv?email=private-rate@example.com', route: '/api/v2/admin/campus-typing/records.csv', status: 429 },
    ]
    for (const { route: _route, status, ...request } of requests) {
      expect((await app.inject({ ...request, headers, remoteAddress: '203.0.113.55' })).statusCode).toBe(status)
    }
    expect((await app.inject({ method: 'POST', url: '/api/v2/campus-typing/sessions', headers: { ...headers, 'content-type': 'application/private-content-type' }, payload: 'private-parser-body' })).statusCode).toBe(400)
    const logs = chunks.join('')
    for (const secret of ['private-', '20249999', '01087654321', '203.0.113.55']) expect(logs).not.toContain(secret)
    const events = logs.trim().split('\n').map((line) => JSON.parse(line))
    expect(events).toHaveLength(requests.length + 1)
    for (const [index, event] of events.entries()) {
      expect(Object.keys(event).sort()).toEqual(['durationMs', 'level', 'reqId', 'route', 'statusCode'])
      expect(event.reqId).toEqual(expect.any(String))
      expect(event.reqId.length).toBeGreaterThan(0)
      expect(event.durationMs).toBeGreaterThanOrEqual(0)
      expect(event.route).toBe(requests[index]?.route ?? '/api/v2/campus-typing/sessions')
      expect(event.statusCode).toBe(requests[index]?.status ?? 400)
    }
    expect(new Set(events.map((event) => event.reqId)).size).toBe(events.length)
  })

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

  test('allows the administrator delete request through the browser CORS preflight', async () => {
    const app = createApp()

    const response = await app.inject({
      method: 'OPTIONS',
      url: '/api/v2/admin/campus-typing/records',
      headers: {
        origin: 'https://typing.example',
        'access-control-request-method': 'DELETE',
        'access-control-request-headers': 'authorization,content-type',
      },
    })

    expect(response.statusCode).toBe(204)
    expect(response.headers['access-control-allow-origin']).toBe('https://typing.example')
    expect(response.headers['access-control-allow-methods']).toContain('DELETE')
    expect(response.headers['access-control-allow-headers']).toContain('authorization')
    expect(response.headers['access-control-allow-headers']).toContain('content-type')
  })

  test('reserves the public session route for its validation handler', async () => {
    const app = createApp()

    const response = await app.inject({
      method: 'POST',
      url: '/api/v2/campus-typing/sessions',
      payload: { email: 'private@example.com' },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({
      code: 'TYPING_INVALID_INPUT',
      message: expect.any(String),
      data: null,
    })
    expect(response.body).not.toContain('private@example.com')
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
