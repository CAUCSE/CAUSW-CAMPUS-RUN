import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import type { FastifyInstance } from 'fastify'
import type Database from 'better-sqlite3'
import { buildApp } from './app.js'
import { loadConfig } from './config.js'
import { openDatabase } from './database/connection.js'
import { runMigrations } from './database/migrations.js'
import { createRepository } from './database/repositories.js'

export interface RunningServer {
  readonly origin: string
  close(): Promise<void>
}

const migrationDirectory = fileURLToPath(new URL('../migrations/', import.meta.url))

export async function startServer(env: NodeJS.ProcessEnv = process.env): Promise<RunningServer> {
  const config = loadConfig(env)
  const db = openDatabase(config.databasePath)
  let app: FastifyInstance | undefined

  try {
    runMigrations(db, migrationDirectory)
    app = buildApp({ config, repository: createRepository(db) })
    const origin = await app.listen({ host: config.host, port: config.port })

    return {
      origin,
      close: createCloseHandler(app, db),
    }
  } catch (error) {
    await closeAfterFailedStartup(app, db)
    throw error
  }
}

function createCloseHandler(app: FastifyInstance, db: Database.Database): () => Promise<void> {
  let closePromise: Promise<void> | undefined

  return () => {
    closePromise ??= closeAppThenDatabase(app, db)
    return closePromise
  }
}

async function closeAppThenDatabase(app: FastifyInstance, db: Database.Database): Promise<void> {
  try {
    await app.close()
  } finally {
    db.close()
  }
}

async function closeAfterFailedStartup(
  app: FastifyInstance | undefined,
  db: Database.Database,
): Promise<void> {
  try {
    if (app) {
      await app.close()
    }
  } catch {
    // Preserve the startup error while still releasing the database connection.
  } finally {
    try {
      db.close()
    } catch {
      // Preserve the startup error when database cleanup also fails.
    }
  }
}

function registerShutdownHandlers(running: RunningServer): void {
  let shuttingDown = false

  const shutdown = (signal: NodeJS.Signals) => {
    if (shuttingDown) return
    shuttingDown = true

    void running.close()
      .then(() => {
        process.exitCode = 0
      })
      .catch((error: unknown) => {
        console.error(`Failed to shut down after ${signal}:`, error)
        process.exitCode = 1
      })
  }

  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)
}

function isDirectExecution(): boolean {
  return process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
}

if (isDirectExecution()) {
  void startServer()
    .then((running) => {
      console.info(`Server listening at ${running.origin}`)
      registerShutdownHandlers(running)
    })
    .catch((error: unknown) => {
      console.error('Server failed to start:', error)
      process.exitCode = 1
    })
}
