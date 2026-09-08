import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import Database from 'better-sqlite3'

export type DatabaseFactory = (path: string) => Database.Database

export function openDatabase(
  path: string,
  createDatabase: DatabaseFactory = (databasePath) => new Database(databasePath),
): Database.Database {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true })
  }

  const db = createDatabase(path)
  try {
    db.pragma('foreign_keys = ON')
    db.pragma('busy_timeout = 5000')
    db.pragma('journal_mode = WAL')
    return db
  } catch (error) {
    try {
      db.close()
    } catch {
      // Preserve the initialization error while releasing the opened handle when possible.
    }
    throw error
  }
}
