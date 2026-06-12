import { Database } from "bun:sqlite"
import { afterAll, beforeAll, describe, expect, it } from "bun:test"
import { BunSqliteDialect } from "kysely-bun-sqlite"
import { t as columnTypes, createArkTypeSchemaConfig } from "../src/columns/index.js"
import { createPeta, defineModel, timestamps, softDeletes } from "../src/index.js"
import type { Plugin } from "../src/plugins/index.js"

const t = columnTypes({ schema: createArkTypeSchemaConfig() })

describe("Plugin system", () => {
  it(".use() accepts a plugin and chains", () => {
    const plugin: Plugin = (def) => {
      ;(def as any).__pluginApplied = true
    }
    const Model = defineModel("plugin_test", {
      columns: { id: t.integer().primaryKey(), name: t.string(255) },
    }).use(plugin)

    expect((Model as any).__pluginApplied).toBe(true)
  })

  it("timestamps() plugin sets createdAt/updatedAt on create", async () => {
    const db = new Database(":memory:")
    db.run("PRAGMA journal_mode = WAL")
    db.run("CREATE TABLE ts_plugin (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, createdAt TEXT, updatedAt TEXT)")
    const peta = createPeta({ dialect: new BunSqliteDialect({ database: db }) })

    const TimestampedModel = defineModel("ts_plugin", {
      columns: {
        id: t.integer().primaryKey(),
        name: t.string(255),
        createdAt: t.timestamp(),
        updatedAt: t.timestamp(),
      },
    }).use(timestamps())

    peta.registerAll(TimestampedModel)

    const record = await TimestampedModel.insert({ name: "Plugin Test" })
    expect(record.get("createdAt")).toBeTruthy()
    expect(record.get("updatedAt")).toBeTruthy()
    expect(record.get("createdAt")).toEqual(record.get("updatedAt"))

    await peta.destroy()
    db.close()
  })

  it("timestamps() updates updatedAt on save", async () => {
    const db = new Database(":memory:")
    db.run("PRAGMA journal_mode = WAL")
    db.run("CREATE TABLE ts_update (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, createdAt TEXT, updatedAt TEXT)")
    const peta = createPeta({ dialect: new BunSqliteDialect({ database: db }) })

    const Model = defineModel("ts_update", {
      columns: { id: t.integer().primaryKey(), name: t.string(255), createdAt: t.timestamp(), updatedAt: t.timestamp() },
    }).use(timestamps())

    peta.registerAll(Model)
    const record = await Model.insert({ name: "Before" })
    const createdAt = record.get("createdAt") as string
    await new Promise((r) => setTimeout(r, 10))
    record.set("name", "After")
    await record.$save()

    expect(record.get("createdAt")).toBe(createdAt)
    expect(record.get("updatedAt")).not.toBe(createdAt)

    await peta.destroy()
    db.close()
  })

  it("softDeletes() configures soft delete behavior", async () => {
    const db = new Database(":memory:")
    db.run("PRAGMA journal_mode = WAL")
    db.run("CREATE TABLE sd_plugin (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, deletedAt TEXT)")
    const peta = createPeta({ dialect: new BunSqliteDialect({ database: db }) })

    const SDModel = defineModel("sd_plugin", {
      columns: { id: t.integer().primaryKey(), name: t.string(255), deletedAt: t.timestamp().nullable() },
    }).use(softDeletes())

    peta.registerAll(SDModel)

    const record = await SDModel.insert({ name: "Soft" })
    expect(record.$trashed()).toBe(false)

    // Need to register soft delete for trashed check to work
    SDModel.registerSoftDeletes()

    await record.$delete()
    expect(record.$trashed()).toBe(true)
    expect(record.get("deletedAt")).toBeTruthy()

    // Verify it's excluded by default
    const all = await SDModel.query().orderBy("id", "asc")
    expect(all).toHaveLength(0)

    // Verify withTrashed includes it
    const withDeleted = await SDModel.query().withTrashed()
    expect(withDeleted.length).toBeGreaterThanOrEqual(1)

    await peta.destroy()
    db.close()
  })
})
