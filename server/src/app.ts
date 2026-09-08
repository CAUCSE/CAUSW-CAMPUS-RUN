import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import Fastify, { type FastifyInstance } from 'fastify'
import type { ServerConfig } from './config.js'
import type { SessionRecordRepository } from './database/repositories.js'
import { HttpError, toErrorEnvelope } from './http/errors.js'
import { SlidingWindowRateLimiter } from './http/rate-limit.js'
import { registerAdminRoutes } from './routes/admin.js'
import { registerLeaderboardRoutes } from './routes/leaderboard.js'
import { registerSessionRoutes } from './routes/sessions.js'

export interface AppOptions {
  readonly config: ServerConfig
  readonly repository: SessionRecordRepository
  readonly now?: () => number
  readonly rateLimiter?: SlidingWindowRateLimiter
  readonly logStream?: { write(message: string): void }
}

export function buildApp(options: AppOptions): FastifyInstance {
  const allowedOrigins = new Set(options.config.allowedOrigins)
  const app = Fastify({
    bodyLimit: 16 * 1024,
    trustProxy: trustProxyHops(options.config.trustProxy),
    logger: {
      level: 'info',
      redact: {
        paths: [
          'req.headers.authorization',
          'req.body',
          "res.headers['set-cookie']",
        ],
        remove: true,
      },
      ...(options.logStream === undefined ? {} : { stream: options.logStream }),
    },
  })

  app.addHook('onRequest', async (request) => {
    const origin = request.headers.origin
    if (origin && !allowedOrigins.has(origin)) {
      throw new HttpError(403, 'TYPING_INVALID_INPUT', 'The request origin is not allowed.')
    }
  })

  app.register(cors, {
    origin(origin, callback) {
      callback(null, origin === undefined || allowedOrigins.has(origin))
    },
  })
  app.register(helmet)

  app.setErrorHandler((error, _request, reply) => {
    const { statusCode, body } = toErrorEnvelope(error)
    reply.code(statusCode).send(body)
  })

  app.setNotFoundHandler((_request, reply) => {
    reply.code(404).send({
      code: 'TYPING_SESSION_NOT_FOUND',
      message: 'The requested resource was not found.',
      data: null,
    })
  })

  app.get('/health', async () => ({
    code: 'SUCCESS',
    message: 'Request completed successfully.',
    data: { status: 'ok' },
  }))

  const publicRouteOptions = {
    config: options.config,
    repository: options.repository,
    now: options.now ?? Date.now,
    rateLimiter: options.rateLimiter ?? new SlidingWindowRateLimiter(),
  }
  registerSessionRoutes(app, publicRouteOptions)
  registerLeaderboardRoutes(app, publicRouteOptions)
  registerAdminRoutes(app, publicRouteOptions)

  return app
}

function trustProxyHops(hops: number): false | ((address: string, hop: number) => boolean) {
  if (hops === 0) return false
  return (_address, hop) => hop < hops
}
