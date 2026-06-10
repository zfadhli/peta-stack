import type { Kysely } from "kysely"
import { sql } from "kysely"
import type { MigrationFile, MigrationRecord, MigrationStatus } from "./types.js"

export interface MigrationRunner {
  ensureTable(): Promise<void>
  getCompleted(): Promise<MigrationRecord[]>
  up(migrations: MigrationFile[]): Promise<void>
  down(migrations: MigrationFile[]): Promise<void>
  status(migrations: MigrationFile[]): Promise<MigrationStatus>
}

export function createMigrationRunner(db: Kysely<Record<string, never>>, table = "_peta_migrations"): MigrationRunner {
  async function ensureTable(): Promise<void> {
    await db.schema
      .createTable(table)
      .ifNotExists()
      .addColumn("name", "varchar", (c) => c.notNull().primaryKey())
      .addColumn("applied_at", "timestamp", (c) => c.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
      .execute()
  }
  async function getCompleted(): Promise<MigrationRecord[]> {
    try {
      const rows = await db.selectFrom(table).select(["name", "applied_at"]).orderBy("name", "asc").execute()
      return rows.map((r) => ({ name: String(r.name), appliedAt: String(r.applied_at) }))
    } catch {
      return []
    }
  }
  async function up(migrations: MigrationFile[]): Promise<void> {
    await ensureTable()
    const completed = await getCompleted()
    const completedNames = new Set(completed.map((r) => r.name))
    for (const m of migrations.filter((m) => !completedNames.has(m.name)).sort(byName)) {
      await m.up(db as never)
      await db.insertInto(table).values({ name: m.name, applied_at: new Date().toISOString() }).execute()
    }
  }
  async function down(migrations: MigrationFile[]): Promise<void> {
    const completed = await getCompleted()
    if (completed.length === 0 || migrations.length === 0) return
    for (const m of migrations
      .filter((m) => completed.some((r) => r.name === m.name))
      .sort(byName)
      .reverse()) {
      await m.down(db as never)
      await db
        .deleteFrom(table)
        .where("name", "=", m.name as never)
        .execute()
    }
  }
  async function status(migrations: MigrationFile[]): Promise<MigrationStatus> {
    const completed = await getCompleted()
    const completedNames = new Set(completed.map((r) => r.name))
    return { completed, pending: migrations.filter((m) => !completedNames.has(m.name)).sort(byName) }
  }
  return { ensureTable, getCompleted, up, down, status }
}

function byName(a: MigrationFile, b: MigrationFile): number {
  return a.name.localeCompare(b.name)
}
