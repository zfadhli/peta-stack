import { describe, expect, it } from "bun:test"
import { createClient } from "@libsql/client"
import { LibsqlDialect } from "@libsql/kysely-libsql"
import { t } from "../src/columns/index.js"
import { createPeta, defineModel, softDeletes, timestamps, ulid } from "../src/index.js"
import type { Plugin } from "../src/plugins/index.js"

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
    const db = createClient({ url: ":memory:" })
    await db.execute("PRAGMA journal_mode = WAL")
    await db.execute(
      "CREATE TABLE ts_plugin (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, createdAt TEXT, updatedAt TEXT)",
    )
    const peta = createPeta({ dialect: new LibsqlDialect({ client: db }) })

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
    const db = createClient({ url: ":memory:" })
    await db.execute("PRAGMA journal_mode = WAL")
    await db.execute(
      "CREATE TABLE ts_update (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, createdAt TEXT, updatedAt TEXT)",
    )
    const peta = createPeta({ dialect: new LibsqlDialect({ client: db }) })

    const Model = defineModel("ts_update", {
      columns: {
        id: t.integer().primaryKey(),
        name: t.string(255),
        createdAt: t.timestamp(),
        updatedAt: t.timestamp(),
      },
    }).use(timestamps())

    peta.registerAll(Model)
    const record = await Model.insert({ name: "Before" })
    const createdAt = record.get("createdAt")
    await new Promise((r) => setTimeout(r, 10))
    record.set("name", "After")
    await record.$save()

    expect(record.get("createdAt")).toBe(createdAt)
    expect(record.get("updatedAt")).not.toBe(createdAt)

    await peta.destroy()
    db.close()
  })

  it("softDeletes() configures soft delete behavior", async () => {
    const db = createClient({ url: ":memory:" })
    await db.execute("PRAGMA journal_mode = WAL")
    await db.execute(
      "CREATE TABLE sd_plugin (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, deletedAt TEXT)",
    )
    const peta = createPeta({ dialect: new LibsqlDialect({ client: db }) })

    const SDModel = defineModel("sd_plugin", {
      columns: {
        id: t.integer().primaryKey(),
        name: t.string(255),
        deletedAt: t.timestamp().nullable(),
      },
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

  it("$restore() brings back a soft-deleted record", async () => {
    const db = createClient({ url: ":memory:" })
    await db.execute("PRAGMA journal_mode = WAL")
    await db.execute(
      "CREATE TABLE sd_restore (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, deletedAt TEXT)",
    )
    const peta = createPeta({ dialect: new LibsqlDialect({ client: db }) })

    const SDModel = defineModel("sd_restore", {
      columns: {
        id: t.integer().primaryKey(),
        name: t.string(255),
        deletedAt: t.timestamp().nullable(),
      },
    }).use(softDeletes())

    peta.registerAll(SDModel)
    SDModel.registerSoftDeletes()

    const record = await SDModel.insert({ name: "Restore Me" })
    await record.$delete()
    expect(record.$trashed()).toBe(true)

    await record.$restore()
    expect(record.$trashed()).toBe(false)
    expect(record.get("deletedAt")).toBeNull()

    await peta.destroy()
    db.close()
  })

  it("$forceDelete() permanently removes a soft-deleted record", async () => {
    const db = createClient({ url: ":memory:" })
    await db.execute("PRAGMA journal_mode = WAL")
    await db.execute(
      "CREATE TABLE sd_force (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, deletedAt TEXT)",
    )
    const peta = createPeta({ dialect: new LibsqlDialect({ client: db }) })

    const SDModel = defineModel("sd_force", {
      columns: {
        id: t.integer().primaryKey(),
        name: t.string(255),
        deletedAt: t.timestamp().nullable(),
      },
    }).use(softDeletes())

    peta.registerAll(SDModel)
    SDModel.registerSoftDeletes()

    const record = await SDModel.insert({ name: "Force Delete Me" })
    expect(record.get("id")).toBeGreaterThan(0)
    await record.$forceDelete()

    const found = await SDModel.query().withTrashed().where("id", "=", record.get("id"))
    expect(found).toHaveLength(0)

    await peta.destroy()
    db.close()
  })

  it("ulid() plugin auto-generates ULID primary keys on insert", async () => {
    const db = createClient({ url: ":memory:" })
    await db.execute("PRAGMA journal_mode = WAL")
    await db.execute("CREATE TABLE ulid_test (id TEXT PRIMARY KEY, name TEXT NOT NULL)")
    const peta = createPeta({ dialect: new LibsqlDialect({ client: db }) })

    const UlidModel = defineModel("ulid_test", {
      columns: { id: t.string(26).primaryKey(), name: t.string(255) },
    }).use(ulid())

    peta.registerAll(UlidModel)

    const record = await UlidModel.insert({ name: "ULID Test" })
    expect(record.get("id")).toBeTruthy()
    expect(typeof record.get("id")).toBe("string")
    expect((record.get("id") as string).length).toBe(26)

    await peta.destroy()
    db.close()
  })
})
