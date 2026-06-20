import { afterAll, describe, expect, it } from "bun:test"
import { mkdirSync, readdirSync, unlinkSync } from "node:fs"
import { createClient } from "@libsql/client"
import { LibsqlDialect } from "@libsql/kysely-libsql"
import { Kysely } from "kysely"

const _tmpDir = new URL("../../../.tmp/", import.meta.url).pathname
let dbCounter = 0

afterAll(() => {
  try {
    for (const f of readdirSync(_tmpDir)) {
      if (f.startsWith("cli-test-") && f.endsWith(".db")) {
        unlinkSync(_tmpDir + f)
      }
    }
  } catch {}
})

function createTestDb() {
  mkdirSync(_tmpDir, { recursive: true })
  const url = `file:${_tmpDir}cli-test-${++dbCounter}-${Date.now()}.db`
  const client = createClient({ url })
  const kysely = new Kysely<any>({ dialect: new LibsqlDialect({ client }) })
  return { client, kysely }
}

// ─── migrate:init ───────────────────────────────────────────────

describe("migrate:init", () => {
  it("creates the migrations directory and tracking table", async () => {
    const { client, kysely } = createTestDb()

    try {
      const { createMigrationRunner } = await import("../src/runner.js")
      await createMigrationRunner(kysely).ensureTable()

      const tables = (
        await client.execute(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='_peta_migrations'",
        )
      ).rows
      expect(tables).toHaveLength(1)
    } finally {
      await kysely.destroy()
      client.close()
    }
  })
})

// ─── migrate:status ─────────────────────────────────────────────

describe("migrate:status", () => {
  it("shows empty status when no migrations are applied", async () => {
    const { client, kysely } = createTestDb()

    try {
      const { createMigrationRunner, createMigrationGenerator } = await import("../src/runner.js")
      const runner = createMigrationRunner(kysely)
      await runner.ensureTable()

      const { completed, pending } = await runner.status([])
      expect(completed).toEqual([])
      expect(pending).toEqual([])
    } finally {
      await kysely.destroy()
      client.close()
    }
  })
})

// ─── migrate:up / migrate:down ──────────────────────────────────

describe("migrate:up / migrate:down", () => {
  it("applies and rolls back a migration", async () => {
    const { client, kysely } = createTestDb()

    try {
      const { createMigrationRunner } = await import("../src/runner.js")
      const runner = createMigrationRunner(kysely)
      await runner.ensureTable()

      const migration = {
        name: "001_create_users",
        up: async (db: Kysely<any>) => {
          await db.schema
            .createTable("users")
            .addColumn("id", "integer", (c: any) => c.primaryKey().autoIncrement())
            .addColumn("name", "varchar(255)")
            .execute()
        },
        down: async (db: Kysely<any>) => {
          await db.schema.dropTable("users").execute()
        },
      }

      // Run up
      await runner.up([migration])
      const completed = await runner.getCompleted()
      expect(completed).toHaveLength(1)
      expect(completed[0]!.name).toBe("001_create_users")

      // Run down
      await runner.down([migration])
      const afterDown = await runner.getCompleted()
      expect(afterDown).toHaveLength(0)
    } finally {
      await kysely.destroy()
      client.close()
    }
  })
})

// ─── migrate:generate ────────────────────────────────────────────

describe("migrate:generate", () => {
  it("generates an initial migration code from model definitions", async () => {
    const { client, kysely } = createTestDb()

    try {
      // Use peta-orm to define models (same pattern as runner.test.ts)
      const { defineModel, t } = await import("peta-orm")
      const User = defineModel("users", {
        columns: { id: t.integer().primaryKey(), name: t.string(255) },
      })

      const models = new Map<string, typeof User>()
      models.set(User.name, User)

      const { createMigrationGenerator } = await import("../src/generator.js")
      const gen = createMigrationGenerator()
      const code = gen.generateInitialMigration(models)
      expect(code).toContain('createTable("users")')
      expect(code).toContain('dropTable("users")')
    } finally {
      await kysely.destroy()
      client.close()
    }
  })
})
