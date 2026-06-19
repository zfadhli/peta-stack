import type { Kysely } from "kysely"
import { Migrator } from "kysely/migration"
import type { MigrationFile, MigrationRecord, MigrationStatus } from "./types.js"

// ─── Local type mirrors ─────────────────────────────────────
// Kysely v0.29 doesn't export MigrationProvider as a TS type
// from kysely/migration, so we define it inline.
interface MigrationProvider {
  getMigrations(): Promise<Record<string, Migration>>
}
interface Migration {
  up: (db: Kysely<any>) => Promise<void>
  down?: (db: Kysely<any>) => Promise<void>
}

export interface MigrationRunner {
  ensureTable(): Promise<void>
  getCompleted(): Promise<MigrationRecord[]>
  up(migrations: MigrationFile[]): Promise<void>
  down(migrations: MigrationFile[]): Promise<void>
  status(migrations: MigrationFile[]): Promise<MigrationStatus>
}

export function createMigrationRunner(db: Kysely<Record<string, never>>, table = "_peta_migrations"): MigrationRunner {
  /**
   * Create a Kysely MigrationProvider from our MigrationFile[].
   */
  function createProvider(files: MigrationFile[]): MigrationProvider {
    return {
      async getMigrations() {
        const result: Record<string, Migration> = {}
        for (const f of files.sort(byName)) {
          result[f.name] = { up: f.up, down: f.down }
        }
        return result
      },
    }
  }

  /**
   * Build a Migrator instance with the given migration files.
   */
  function buildMigrator(files: MigrationFile[]): Migrator {
    return new Migrator({
      db,
      provider: createProvider(files),
      migrationTableName: table,
      migrationLockTableName: `${table}_lock`,
    })
  }

  /**
   * Query the migration tracking table directly.
   * Kysely's Migrator stores with column "name" and "timestamp".
   */
  async function queryCompleted(): Promise<MigrationRecord[]> {
    try {
      const rows = (await db
        .selectFrom(table as never)
        .select(["name", "timestamp"] as never)
        .orderBy("name" as never, "asc" as never)
        .execute()) as unknown as Array<{ name: string; timestamp: string }>
      return rows.map((r) => ({ name: String(r.name), appliedAt: String(r.timestamp) }))
    } catch {
      return []
    }
  }

  async function ensureTable(): Promise<void> {
    // Create the tracking table directly with .ifNotExists().
    // Using buildMigrator([]).migrateUp() would crash on databases that
    // already have migration entries — Kysely compares tracking table entries
    // against the provided migration list and throws "corrupted migrations"
    // when the (empty) list has no matching entries.
    await db.schema
      .createTable(table)
      .addColumn("name", "varchar(255)", (cb) => cb.notNull().primaryKey())
      .addColumn("timestamp", "varchar(255)", (cb) => cb.notNull())
      .ifNotExists()
      .execute()
  }

  async function getCompleted(): Promise<MigrationRecord[]> {
    return queryCompleted()
  }

  async function up(migrations: MigrationFile[]): Promise<void> {
    const migrator = buildMigrator(migrations)
    const result = await migrator.migrateToLatest()
    if (result.error) {
      throw result.error
    }
  }

  async function down(migrations: MigrationFile[]): Promise<void> {
    const migrator = buildMigrator(migrations)
    const result = await migrator.migrateDown()
    if (result.error) {
      throw result.error
    }
  }

  async function status(migrations: MigrationFile[]): Promise<MigrationStatus> {
    const completed = await queryCompleted()
    const completedNames = new Set(completed.map((r) => r.name))
    const pending = migrations.filter((m) => !completedNames.has(m.name)).sort(byName)
    return { completed, pending }
  }

  return { ensureTable, getCompleted, up, down, status }
}

function byName(a: { name: string }, b: { name: string }): number {
  return a.name.localeCompare(b.name)
}
