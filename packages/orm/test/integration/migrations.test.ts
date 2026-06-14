/**
 * Integration tests: Migration runner & generator across all database dialects.
 *
 * Covers: migrations.test.ts
 */

import { t as columnTypes, createArkTypeSchemaConfig } from "../../src/columns/index.js"
import { createMigrationRunner } from "../../src/migrations/index.js"
import type { DialectContext } from "./setup.js"
import { afterAll, beforeAll, describe, expect, getAvailableDialects, idColumn, it } from "./setup.js"

const _t = columnTypes({ schema: createArkTypeSchemaConfig() })

// ─── Tests ──────────────────────────────────────────────────────────

for (const dialect of await getAvailableDialects()) {
  describe(`[${dialect.label}] Migrations`, () => {
    let ctx: DialectContext

    beforeAll(async () => {
      ctx = await dialect.create()
    })

    afterAll(async () => {
      await ctx.destroy()
    })

    describe("MigrationRunner", () => {
      it("creates the tracking table", async () => {
        const runner = createMigrationRunner(ctx.kysely)
        await runner.ensureTable()

        // Verify the tracking table exists by querying it
        const completed = await runner.getCompleted()
        expect(Array.isArray(completed)).toBe(true)
      })

      it("getCompleted returns empty before any migrations", async () => {
        const runner = createMigrationRunner(ctx.kysely)
        const completed = await runner.getCompleted()
        expect(completed).toEqual([])
      })

      it("up applies pending migrations", async () => {
        const runner = createMigrationRunner(ctx.kysely)
        const distinctName = `users_${Date.now()}`
        // Use a unique table name for this test
        const tableName = distinctName

        await runner.up([
          {
            name: `001_create_${tableName}`,
            up: async (k: any) => {
              await k.schema
                .createTable(tableName)
                .addColumn("id", "integer", idColumn(dialect.name))
                .addColumn("name", "varchar(255)", (c: any) => c.notNull())
                .execute()
            },
            down: async (k: any) => {
              await k.schema.dropTable(tableName).execute()
            },
          },
        ])

        // Table should exist now
        const result = await ctx.kysely.selectFrom(tableName).selectAll().execute()
        expect(Array.isArray(result)).toBe(true)

        // Cleanup
        await ctx.kysely.schema.dropTable(tableName).ifExists().execute()
      })

      it("marks migrations as completed", async () => {
        const runner = createMigrationRunner(ctx.kysely)

        await runner.up([
          {
            name: "002_create_test",
            up: async (k: any) => {
              await k.schema
                .createTable("test_marked")
                .addColumn("id", "integer", idColumn(dialect.name))
                .addColumn("value", "varchar(100)")
                .execute()
            },
            down: async (k: any) => {
              await k.schema.dropTable("test_marked").ifExists().execute()
            },
          },
        ])

        const completed = await runner.getCompleted()
        expect(completed.length).toBeGreaterThanOrEqual(1)
        const migrationNames = completed.map((m: any) => m.name)
        expect(migrationNames).toContain("002_create_test")

        // Cleanup
        await ctx.kysely.schema.dropTable("test_marked").ifExists().execute()
      })
    })
  })
}
