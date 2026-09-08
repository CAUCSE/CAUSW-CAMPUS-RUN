import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'

interface Migration {
  readonly version: number
  readonly filename: string
  readonly sql: string
}

const migrationFilename = /^(\d{3})_.+\.sql$/

function readMigrations(directory: string): Migration[] {
  const migrations = readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const match = entry.name.match(migrationFilename)
      if (!match) {
        if (entry.name.endsWith('.sql')) {
          throw new Error(`Migration filename must match NNN_name.sql: ${entry.name}`)
        }
        return undefined
      }

      return {
        version: Number(match[1]),
        filename: entry.name,
        sql: readFileSync(join(directory, entry.name), 'utf8'),
      }
    })
    .filter((migration): migration is Migration => migration !== undefined)
    .sort((left, right) => left.version - right.version || left.filename.localeCompare(right.filename))

  for (let index = 1; index < migrations.length; index += 1) {
    if (migrations[index - 1].version === migrations[index].version) {
      throw new Error(`Duplicate migration version: ${migrations[index].version}`)
    }
  }

  return migrations
}

export function runMigrations(db: Database.Database, directory: string): void {
  const migrations = readMigrations(directory)
  const highestBundledVersion = migrations.at(-1)?.version ?? 0

  db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY CHECK (version > 0),
        applied_at_ms INTEGER NOT NULL
      )
    `)

    const applied = db.prepare('SELECT version FROM schema_migrations ORDER BY version').all() as Array<{ version: number }>
    const databaseVersion = applied.at(-1)?.version ?? 0
    if (databaseVersion > highestBundledVersion) {
      throw new Error(
        `Database migration version ${databaseVersion} is newer than bundled migrations ${highestBundledVersion}`,
      )
    }

    const appliedVersions = new Set(applied.map(({ version }) => version))
    const insertMigration = db.prepare(
      'INSERT INTO schema_migrations (version, applied_at_ms) VALUES (?, ?)',
    )
    for (const migration of migrations) {
      if (!appliedVersions.has(migration.version)) {
        db.exec(migration.sql)
        insertMigration.run(migration.version, Date.now())
      }
    }
  })()
}
