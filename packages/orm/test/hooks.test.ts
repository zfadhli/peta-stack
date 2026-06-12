import { Database } from "bun:sqlite"
import { afterAll, beforeAll, describe, expect, it } from "bun:test"
import { BunSqliteDialect } from "kysely-bun-sqlite"
import { t as columnTypes, createArkTypeSchemaConfig } from "../src/columns/index.js"
import { createHookManager, createPeta, defineModel } from "../src/index.js"

const t = columnTypes({ schema: createArkTypeSchemaConfig() })

const Dummy = defineModel("dummy", {
  columns: { id: t.integer().primaryKey(), name: t.string(255) },
})

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
    const model = Dummy.hydrate({ name: "test" })
    await hm.trigger("beforeCreate", model)
    await hm.trigger("afterCreate", model)
    expect(log).toEqual(["before", "after"])
  })
})

describe("Model lifecycle hooks", () => {
  const db = new Database(":memory:")
  let peta: ReturnType<typeof createPeta>

  const HooksTest = defineModel("hooks_test", {
    columns: {
      id: t.integer().primaryKey(),
      name: t.string(255),
      counter: t.integer().default(0),
    },
  })

  beforeAll(async () => {
    db.run("PRAGMA journal_mode = WAL")
    db.run(
      "CREATE TABLE hooks_test (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, counter INTEGER DEFAULT 0)",
    )
    peta = createPeta({ dialect: new BunSqliteDialect({ database: db }) })
    peta.registerAll(HooksTest)
  })

  afterAll(async () => {
    await peta.destroy()
    db.close()
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
    HooksTest.on("afterUpdate", (_m: any) => {
      log.push("afterUpdate")
    })

    const user = await HooksTest.insert({ name: "Updatable" })
    user.set("name", "Updated")
    await user.$save()
    expect(log).toContain("beforeUpdate")
    expect(log).toContain("afterUpdate")
  })

  it("fires beforeDelete and afterDelete", async () => {
    const log: string[] = []
    HooksTest.on("beforeDelete", () => {
      log.push("beforeDelete")
    })
    HooksTest.on("afterDelete", () => {
      log.push("afterDelete")
    })

    const user = await HooksTest.insert({ name: "DeleteMe" })
    await user.$delete()
    expect(log).toContain("beforeDelete")
    expect(log).toContain("afterDelete")
  })
})

describe("Timestamps", () => {
  const db = new Database(":memory:")
  let peta: ReturnType<typeof createPeta>

  const Timestamped = defineModel("timestamped", {
    columns: {
      id: t.integer().primaryKey(),
      name: t.string(255),
      createdAt: t.timestamp(),
      updatedAt: t.timestamp(),
    },
  })

  beforeAll(async () => {
    db.run("PRAGMA journal_mode = WAL")
    db.run(
      "CREATE TABLE timestamped (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, createdAt TEXT, updatedAt TEXT)",
    )
    peta = createPeta({ dialect: new BunSqliteDialect({ database: db }) })
    peta.registerAll(Timestamped)
    Timestamped.registerTimestamps()
  })

  afterAll(async () => {
    await peta.destroy()
    db.close()
  })

  it("sets createdAt and updatedAt on create", async () => {
    const record = await Timestamped.insert({ name: "Test" })
    expect(record.get("createdAt")).toBeTruthy()
    expect(record.get("updatedAt")).toBeTruthy()
    expect(record.get("createdAt")).toEqual(record.get("updatedAt"))
  })

  it("updates updatedAt on update, leaves createdAt", async () => {
    const record = await Timestamped.insert({ name: "Test2" })
    const createdAt1 = record.get("createdAt") as string
    await new Promise((r) => setTimeout(r, 10))
    record.set("name", "Updated")
    await record.$save()
    expect(record.get("createdAt")).toEqual(createdAt1)
    expect(record.get("updatedAt")).not.toEqual(createdAt1)
  })
})

describe("SoftDeletes", () => {
  const db = new Database(":memory:")
  let peta: ReturnType<typeof createPeta>

  const SoftDeletable = defineModel("soft_deletable", {
    columns: {
      id: t.integer().primaryKey(),
      name: t.string(255),
      deletedAt: t.timestamp().nullable(),
    },
  })

  beforeAll(async () => {
    db.run("PRAGMA journal_mode = WAL")
    db.run("CREATE TABLE soft_deletable (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, deletedAt TEXT)")
    peta = createPeta({ dialect: new BunSqliteDialect({ database: db }) })
    peta.registerAll(SoftDeletable)
    SoftDeletable.registerSoftDeletes()
  })

  afterAll(async () => {
    await peta.destroy()
    db.close()
  })

  it("soft deletes a record", async () => {
    const record = await SoftDeletable.insert({ name: "Soft" })
    expect(record.$trashed()).toBe(false)
    await record.$delete()
    expect(record.$trashed()).toBe(true)
    expect(record.get("deletedAt")).toBeTruthy()
  })

  it("excludes soft-deleted by default", async () => {
    const a = await SoftDeletable.insert({ name: "A" })
    await SoftDeletable.insert({ name: "B" })
    await a.$delete()
    const active = await SoftDeletable.query().orderBy("id", "asc")
    expect(active).toHaveLength(1)
    expect(active[0]!.get("name")).toBe("B")
  })

  it("withTrashed includes soft-deleted", async () => {
    const all = await SoftDeletable.query().withTrashed().orderBy("id", "asc")
    expect(all.length).toBeGreaterThanOrEqual(2)
  })

  it("onlyTrashed returns only deleted", async () => {
    const trashed = await SoftDeletable.query().onlyTrashed()
    expect(trashed.length).toBeGreaterThanOrEqual(1)
    for (const t of trashed) {
      expect(t.get("deletedAt")).toBeTruthy()
    }
  })
})

describe("Custom errors", () => {
  const db = new Database(":memory:")
  let peta: ReturnType<typeof createPeta>

  const ErrUser = defineModel("err_users", {
    columns: { id: t.integer().primaryKey(), name: t.string(255) },
  })

  beforeAll(async () => {
    db.run("PRAGMA journal_mode = WAL")
    db.run("CREATE TABLE err_users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)")
    peta = createPeta({ dialect: new BunSqliteDialect({ database: db }) })
    peta.registerAll(ErrUser)
    await ErrUser.insert({ name: "Alice" })
  })

  afterAll(async () => {
    await peta.destroy()
    db.close()
  })

  it("executeTakeFirstOrThrow throws ModelNotFoundError", async () => {
    try {
      await ErrUser.query().where("id", "=", 999).executeTakeFirstOrThrow()
      expect.unreachable()
    } catch (e: any) {
      expect(e.name).toBe("ModelNotFoundError")
    }
  })

  it("findOrFail throws ModelNotFoundError", async () => {
    try {
      await ErrUser.findOrFail(999)
      expect.unreachable()
    } catch (e: any) {
      expect(e.name).toBe("ModelNotFoundError")
    }
  })

  it("ModelNotRegisteredError for unregistered models", async () => {
    const Orphan = defineModel("orphans", {
      columns: { id: t.integer().primaryKey() },
    })
    try {
      Orphan.query()
      expect.unreachable("should have thrown")
    } catch (e: any) {
      expect(e.name).toBe("ModelNotRegisteredError")
    }
  })
})

describe("Prototype pollution", () => {
  it("set() blocks __proto__", () => {
    const m = Dummy.hydrate({})
    m.set("__proto__", { malicious: true })
    expect(({} as any).malicious).toBeUndefined()
  })

  it("set() blocks constructor", () => {
    const m = Dummy.hydrate({})
    m.set("constructor", { malicious: true })
    expect(({}.constructor as any).malicious).toBeUndefined()
  })

  it("fill() skips forbidden keys", () => {
    const m = Dummy.hydrate({})
    m.fill({ __proto__: { malicious: true }, name: "ok" })
    expect(({} as any).malicious).toBeUndefined()
    expect(m.get("name")).toBe("ok")
  })
})

describe("Circular $toJSON", () => {
  it("handles circular relations without stack overflow", () => {
    const a = Dummy.hydrate({ id: 1 })
    const b = Dummy.hydrate({ id: 2 })
    a.$setRelation("child", [b])
    b.$setRelation("parent", a)

    const json = a.$toJSON()
    expect(json).toHaveProperty("id", 1)
    expect(json).toHaveProperty("child")
    const childArr = json.child as any[]
    expect(childArr[0]!).toHaveProperty("id", 2)
  })
})

describe("Casting", () => {
  const CastModel = defineModel("cast_test", {
    columns: {
      id: t.integer().primaryKey(),
      name: t.string(255),
      meta: t.text().nullable(),
      flags: t.integer().default(0),
    },
    casts: {
      meta: "json" as const,
      flags: "boolean" as const,
    },
  })

  it("casts JSON on get", () => {
    const m = CastModel.hydrate({ id: 1, name: "test", meta: '{"a":1}' })
    const meta = m.get("meta")
    expect(meta).toEqual({ a: 1 })
  })

  it("casts boolean on get", () => {
    const m = CastModel.hydrate({ id: 1, flags: 1 })
    expect(m.get("flags")).toBe(true)
  })

  it("casts JSON on set", () => {
    const m = CastModel.hydrate({ id: 1 })
    m.set("meta", { b: 2 })
    expect(m.get("meta")).toEqual({ b: 2 })
  })
})

describe("Serialization control", () => {
  it("hidden excludes keys from $toJSON", () => {
    const HiddenModel = defineModel("hidden_test", {
      columns: { id: t.integer().primaryKey(), name: t.string(255), password: t.string(255) },
      hidden: ["password"],
    })
    const m = HiddenModel.hydrate({ id: 1, name: "Alice", password: "secret" })
    const json = m.$toJSON()
    expect(json).toHaveProperty("name")
    expect(json).not.toHaveProperty("password")
  })

  it("visible whitelists keys", () => {
    const VisibleModel = defineModel("visible_test", {
      columns: { id: t.integer().primaryKey(), name: t.string(255), internal: t.string(255) },
      visible: ["id", "name"],
    })
    const m = VisibleModel.hydrate({ id: 1, name: "Bob", internal: "secret" })
    const json = m.$toJSON()
    expect(json).toHaveProperty("id")
    expect(json).toHaveProperty("name")
    expect(json).not.toHaveProperty("internal")
  })
})

describe("Transaction", () => {
  const db = new Database(":memory:")
  let peta: ReturnType<typeof createPeta>

  const TxUser = defineModel("tx_users", {
    columns: { id: t.integer().primaryKey(), name: t.string(255) },
  })

  beforeAll(async () => {
    db.run("CREATE TABLE tx_users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)")
    peta = createPeta({ dialect: new BunSqliteDialect({ database: db }) })
    peta.registerAll(TxUser)
  })

  afterAll(async () => {
    await peta.destroy()
    db.close()
  })

  it("Model.transaction via orm", async () => {
    await peta.transaction(async (trx) => {
      await trx.insertInto("tx_users").values({ name: "Tx Alice" }).execute()
    })
    const user = await TxUser.query().where("name", "=", "Tx Alice").first()
    expect(user).toBeDefined()
  })
})
