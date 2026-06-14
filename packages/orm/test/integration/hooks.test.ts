/**
 * Integration tests: Lifecycle hooks and plugins across all database dialects.
 *
 * Covers: hooks.test.ts + plugins.test.ts
 */

import { t as columnTypes, createArkTypeSchemaConfig } from "../../src/columns/index.js"
import { createHookManager, defineModel, softDeletes, timestamps } from "../../src/index.js"
import type { Plugin } from "../../src/plugins/index.js"
import type { DialectContext, SchemaDef } from "./setup.js"
import {
  afterAll,
  applySchemas,
  beforeAll,
  describe,
  dropSchemas,
  expect,
  getAvailableDialects,
  idColumn,
  it,
} from "./setup.js"

const _t = columnTypes({ schema: createArkTypeSchemaConfig() })

// ─── Schema builders ────────────────────────────────────────────────

const simpleTable = (name: string, dialectName?: string): SchemaDef => ({
  name,
  up: async (k) => {
    await k.schema
      .createTable(name)
      .addColumn("id", "integer", idColumn(dialectName))
      .addColumn("name", "varchar(255)", (c) => c.notNull())
      .addColumn("counter", "integer", (c) => c.defaultTo(0))
      .execute()
  },
  down: async (k) => {
    await k.schema.dropTable(name).ifExists().execute()
  },
})

const timestampTable = (name: string, dialectName?: string): SchemaDef => ({
  name,
  up: async (k) => {
    await k.schema
      .createTable(name)
      .addColumn("id", "integer", idColumn(dialectName))
      .addColumn("name", "varchar(255)", (c) => c.notNull())
      .addColumn("createdAt", "text")
      .addColumn("updatedAt", "text")
      .execute()
  },
  down: async (k) => {
    await k.schema.dropTable(name).ifExists().execute()
  },
})

const softDeleteTable = (name: string, dialectName?: string): SchemaDef => ({
  name,
  up: async (k) => {
    await k.schema
      .createTable(name)
      .addColumn("id", "integer", idColumn(dialectName))
      .addColumn("name", "varchar(255)", (c) => c.notNull())
      .addColumn("deletedAt", "text")
      .execute()
  },
  down: async (k) => {
    await k.schema.dropTable(name).ifExists().execute()
  },
})

// ─── Tests ──────────────────────────────────────────────────────────

for (const dialect of await getAvailableDialects()) {
  describe(`[${dialect.label}] Hooks & Plugins`, () => {
    // ─── HookManager (unit, no DB) ──────────────────────────────

    describe("HookManager", () => {
      it("registers and triggers hooks", async () => {
        const hm = createHookManager()
        const log: string[] = []
        hm.on("beforeCreate", () => {
          log.push("before")
        })
        hm.on("afterCreate", () => {
          log.push("after")
        })
        const Dummy = defineModel("dummy", {
          columns: { id: _t.integer().primaryKey(), name: _t.string(255) },
        })
        const model = Dummy.hydrate({ name: "test" })
        await hm.trigger("beforeCreate", model)
        await hm.trigger("afterCreate", model)
        expect(log).toEqual(["before", "after"])
      })
    })

    // ─── Lifecycle Hooks ────────────────────────────────────────

    describe("Model lifecycle hooks", () => {
      const schemas = [simpleTable("hooks_test", dialect.name)]
      let ctx: DialectContext

      const HooksTest = defineModel("hooks_test", {
        columns: {
          id: _t.integer().primaryKey(),
          name: _t.string(255),
          counter: _t.integer().default(0),
        },
      })

      beforeAll(async () => {
        ctx = await dialect.create()
        await applySchemas(ctx.kysely, schemas)
        ctx.registerAll(HooksTest)
      })

      afterAll(async () => {
        await dropSchemas(ctx.kysely, schemas)
        await ctx.destroy()
      })

      it("fires beforeCreate and afterCreate on insert", async () => {
        const log: string[] = []
        HooksTest.on("beforeCreate", (m: any) => {
          log.push("beforeCreate")
          m.set("name", `Hook-${m.get("name")}`)
        })
        HooksTest.on("afterCreate", () => {
          log.push("afterCreate")
        })

        const user = await HooksTest.insert({ name: "Test" })
        expect(log).toContain("beforeCreate")
        expect(log).toContain("afterCreate")
        expect(user.get("name")).toBe("Hook-Test")
      })

      it("fires beforeUpdate and afterUpdate on save", async () => {
        const log: string[] = []
        HooksTest.on("beforeUpdate", (m: any) => {
          log.push("beforeUpdate")
          m.set("counter", (m.get("counter") as number) + 1)
        })
        HooksTest.on("afterUpdate", () => {
          log.push("afterUpdate")
        })

        const user = await HooksTest.insert({ name: "UpdateTest" })
        user.set("name", "Updated") // make it dirty so $save triggers update
        await user.$save()
        expect(log).toContain("beforeUpdate")
        expect(log).toContain("afterUpdate")
      })
    })

    // ─── Plugin System ───────────────────────────────────────────

    describe("Plugin system", () => {
      it(".use() accepts a plugin and chains", () => {
        const plugin: Plugin = (def) => {
          ;(def as any).__pluginApplied = true
        }
        const Model = defineModel("plugin_test", {
          columns: { id: _t.integer().primaryKey(), name: _t.string(255) },
        }).use(plugin)
        expect((Model as any).__pluginApplied).toBe(true)
      })
    })

    // ─── Timestamps Plugin ──────────────────────────────────────

    describe("Timestamps plugin", () => {
      const schemas = [timestampTable("ts_plugin", dialect.name)]
      let ctx: DialectContext

      beforeAll(async () => {
        ctx = await dialect.create()
        await applySchemas(ctx.kysely, schemas)
      })

      afterAll(async () => {
        await dropSchemas(ctx.kysely, schemas)
        await ctx.destroy()
      })

      it("sets createdAt/updatedAt on create", async () => {
        const TimestampedModel = defineModel("ts_plugin", {
          columns: {
            id: _t.integer().primaryKey(),
            name: _t.string(255),
            createdAt: _t.timestamp(),
            updatedAt: _t.timestamp(),
          },
        }).use(timestamps())

        ctx.registerAll(TimestampedModel)
        const record = await TimestampedModel.insert({ name: "Plugin Test" })
        expect(record.get("createdAt")).toBeTruthy()
        expect(record.get("updatedAt")).toBeTruthy()
        expect(record.get("createdAt")).toEqual(record.get("updatedAt"))
      })

      it("updates updatedAt on save", async () => {
        const Model = defineModel("ts_plugin", {
          columns: {
            id: _t.integer().primaryKey(),
            name: _t.string(255),
            createdAt: _t.timestamp(),
            updatedAt: _t.timestamp(),
          },
        }).use(timestamps())

        ctx.registerAll(Model)
        const record = await Model.insert({ name: "Before" })
        const createdAt = record.get("createdAt") as string
        await new Promise((r) => setTimeout(r, 10))
        record.set("name", "After")
        await record.$save()

        expect(record.get("createdAt")).toBe(createdAt)
        expect(record.get("updatedAt")).not.toBe(createdAt)
      })
    })

    // ─── Soft Deletes Plugin ────────────────────────────────────

    describe("Soft deletes plugin", () => {
      const schemas = [softDeleteTable("sd_plugin", dialect.name)]
      let ctx: DialectContext

      beforeAll(async () => {
        ctx = await dialect.create()
        await applySchemas(ctx.kysely, schemas)
      })

      afterAll(async () => {
        await dropSchemas(ctx.kysely, schemas)
        await ctx.destroy()
      })

      it("configures soft delete behavior", async () => {
        const SDModel = defineModel("sd_plugin", {
          columns: {
            id: _t.integer().primaryKey(),
            name: _t.string(255),
            deletedAt: _t.timestamp().nullable(),
          },
        }).use(softDeletes())

        ctx.registerAll(SDModel)
        SDModel.registerSoftDeletes()

        const record = await SDModel.insert({ name: "Soft" })
        expect(record.$trashed()).toBe(false)

        await record.$delete()
        expect(record.$trashed()).toBe(true)
        expect(record.get("deletedAt")).toBeTruthy()

        // Verify it's excluded by default
        const all = await SDModel.query().orderBy("id", "asc")
        expect(all).toHaveLength(0)

        // Verify withTrashed includes it
        const withDeleted = await SDModel.query().withTrashed()
        expect(withDeleted.length).toBeGreaterThanOrEqual(1)
      })
    })
  })
}
