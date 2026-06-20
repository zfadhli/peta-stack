import { describe, expect, it } from "bun:test"
import { mkdirSync, unlinkSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { defineModel, t, timestamps } from "peta-orm"
import { createSnapshot, loadSnapshot, saveSnapshot } from "../src/index.js"

const User = defineModel("users", {
  columns: {
    id: t.integer().primaryKey(),
    name: t.string(255),
    email: t.text().unique(),
    age: t.integer().nullable().default(0),
    score: t.float().default(0),
  },
})

const Post = defineModel("posts", {
  columns: {
    id: t.integer().primaryKey(),
    userId: t.integer().references(() => User, ["id"]),
    title: t.string(255),
    body: t.text().nullable(),
    published: t.boolean().default(false),
    publishedAt: t.timestamp().nullable(),
  },
})

function buildMap(...models: ReturnType<typeof defineModel>[]): Map<string, ReturnType<typeof defineModel>> {
  const map = new Map<string, ReturnType<typeof defineModel>>()
  for (const m of models) map.set(m.name, m)
  return map
}

describe("createSnapshot", () => {
  it("includes all registered models as tables", () => {
    const snapshot = createSnapshot(buildMap(User, Post))
    const tableNames = snapshot.tables.map((t) => t.name)
    expect(tableNames).toContain("users")
    expect(tableNames).toContain("posts")
  })

  it("extracts column metadata", () => {
    const snapshot = createSnapshot(buildMap(User))
    const table = snapshot.tables.find((t) => t.name === "users")!
    const idCol = table.columns.find((c) => c.name === "id")!
    expect(idCol.type).toBe("integer")
    expect(idCol.isPrimaryKey).toBe(true)
    expect(idCol.isNullable).toBe(false)
    expect(idCol.isUnique).toBe(false)
    expect(idCol.defaultValue).toBeUndefined()
  })

  it("maps string types to varchar(N)", () => {
    const snapshot = createSnapshot(buildMap(User))
    const table = snapshot.tables.find((t) => t.name === "users")!
    const nameCol = table.columns.find((c) => c.name === "name")!
    expect(nameCol.type).toBe("varchar(255)")
  })

  it("maps text type to text", () => {
    const snapshot = createSnapshot(buildMap(User))
    const table = snapshot.tables.find((t) => t.name === "users")!
    const emailCol = table.columns.find((c) => c.name === "email")!
    expect(emailCol.type).toBe("text")
  })

  it("extracts nullable, unique, default constraints", () => {
    const snapshot = createSnapshot(buildMap(User))
    const table = snapshot.tables.find((t) => t.name === "users")!
    const ageCol = table.columns.find((c) => c.name === "age")!
    expect(ageCol.isNullable).toBe(true)
    expect(ageCol.defaultValue).toBe(0)
    const emailCol = table.columns.find((c) => c.name === "email")!
    expect(emailCol.isUnique).toBe(true)
  })

  it("extracts references", () => {
    const snapshot = createSnapshot(buildMap(User, Post))
    const table = snapshot.tables.find((t) => t.name === "posts")!
    const userIdCol = table.columns.find((c) => c.name === "userId")!
    expect(userIdCol.references).toEqual({ table: "users", column: "id" })
  })

  it("maps boolean type", () => {
    const snapshot = createSnapshot(buildMap(Post))
    const table = snapshot.tables.find((t) => t.name === "posts")!
    const pubCol = table.columns.find((c) => c.name === "published")!
    expect(pubCol.type).toBe("boolean")
  })

  it("maps timestamp type", () => {
    const snapshot = createSnapshot(buildMap(Post))
    const table = snapshot.tables.find((t) => t.name === "posts")!
    const tsCol = table.columns.find((c) => c.name === "publishedAt")!
    expect(tsCol.type).toBe("timestamp")
  })

  it("maps float type", () => {
    const snapshot = createSnapshot(buildMap(User))
    const table = snapshot.tables.find((t) => t.name === "users")!
    const scoreCol = table.columns.find((c) => c.name === "score")!
    expect(scoreCol.type).toBe("float")
  })

  it("maps uuid type", () => {
    const UuidModel = defineModel("uuids", {
      columns: { id: t.uuid().primaryKey(), label: t.string(100) },
    })
    const snapshot = createSnapshot(buildMap(UuidModel))
    const table = snapshot.tables.find((t) => t.name === "uuids")!
    const idCol = table.columns.find((c) => c.name === "id")!
    expect(idCol.type).toBe("uuid")
  })

  it("maps enum type to text", () => {
    const EnumModel = defineModel("enums", {
      columns: { id: t.integer().primaryKey(), role: t.enum("admin", "user") },
    })
    const snapshot = createSnapshot(buildMap(EnumModel))
    const table = snapshot.tables.find((t) => t.name === "enums")!
    const roleCol = table.columns.find((c) => c.name === "role")!
    expect(roleCol.type).toBe("text")
  })

  it("maps decimal type with precision", () => {
    const DecModel = defineModel("decimals", {
      columns: { id: t.integer().primaryKey(), price: t.decimal(10, 2).default(0) },
    })
    const snapshot = createSnapshot(buildMap(DecModel))
    const table = snapshot.tables.find((t) => t.name === "decimals")!
    const priceCol = table.columns.find((c) => c.name === "price")!
    expect(priceCol.type).toBe("decimal(10, 2)")
  })

  it("maps json type", () => {
    const JsonModel = defineModel("json_data", {
      columns: { id: t.integer().primaryKey(), meta: t.json() },
    })
    const snapshot = createSnapshot(buildMap(JsonModel))
    const table = snapshot.tables.find((t) => t.name === "json_data")!
    const metaCol = table.columns.find((c) => c.name === "meta")!
    expect(metaCol.type).toBe("json")
  })

  it("maps jsonb type", () => {
    const JsonbModel = defineModel("jsonb_data", {
      columns: { id: t.integer().primaryKey(), data: t.jsonb() },
    })
    const snapshot = createSnapshot(buildMap(JsonbModel))
    const table = snapshot.tables.find((t) => t.name === "jsonb_data")!
    const dataCol = table.columns.find((c) => c.name === "data")!
    expect(dataCol.type).toBe("json")
  })

  it("skips models with no table", () => {
    const NoTable = defineModel("", { columns: { id: t.integer().primaryKey() } })
    const snapshot = createSnapshot(buildMap(NoTable))
    expect(snapshot.tables).toHaveLength(0)
  })

  it("extracts indexes for columns with index() constraint", () => {
    const Indexed = defineModel("indexed", {
      columns: {
        id: t.integer().primaryKey(),
        email: t.text().index(),
        name: t.string(100).unique(),
      },
    })
    const snapshot = createSnapshot(buildMap(Indexed))
    const table = snapshot.tables.find((t) => t.name === "indexed")!
    // email has index -> should have an index entry
    const emailIndex = table.indexes.find((i) => i.columns.includes("email"))
    expect(emailIndex).toBeDefined()
    expect(emailIndex!.name).toBe("indexed_email_index")
    // name is unique, not PK -> should not get an index (unique constraint covers it)
    const nameIndex = table.indexes.find((i) => i.columns.includes("name"))
    expect(nameIndex).toBeUndefined()
    // id is PK -> should not get an index
    const idIndex = table.indexes.find((i) => i.columns.includes("id"))
    expect(idIndex).toBeUndefined()
  })

  it("handles bigint and smallint types", () => {
    const BigModel = defineModel("bigs", {
      columns: {
        id: t.bigint().primaryKey(),
        small: t.smallint(),
        large: t.bigint(),
      },
    })
    const snapshot = createSnapshot(buildMap(BigModel))
    const table = snapshot.tables.find((t) => t.name === "bigs")!
    expect(table.columns.find((c) => c.name === "id")!.type).toBe("bigint")
    expect(table.columns.find((c) => c.name === "small")!.type).toBe("smallint")
    expect(table.columns.find((c) => c.name === "large")!.type).toBe("bigint")
  })

  it("handles timestamps plugin columns", () => {
    const TModel = defineModel("ts_test", {
      columns: {
        id: t.integer().primaryKey(),
        ...t.timestamps(),
      },
    }).use(timestamps())
    const snapshot = createSnapshot(buildMap(TModel))
    const table = snapshot.tables.find((t) => t.name === "ts_test")!
    const createdAt = table.columns.find((c) => c.name === "createdAt")
    expect(createdAt).toBeDefined()
    expect(createdAt!.type).toBe("timestamp")
    const updatedAt = table.columns.find((c) => c.name === "updatedAt")
    expect(updatedAt).toBeDefined()
    expect(updatedAt!.type).toBe("timestamp")
  })

  it("preserves version field", () => {
    const snapshot = createSnapshot(buildMap(User))
    expect(snapshot.version).toBe(1)
  })

  it("handles empty models map", () => {
    const snapshot = createSnapshot(new Map())
    expect(snapshot.tables).toEqual([])
    expect(snapshot.version).toBe(1)
  })
})

describe("loadSnapshot / saveSnapshot", () => {
  it("saveSnapshot writes JSON that loadSnapshot can read", () => {
    const snapshot = createSnapshot(buildMap(User, Post))
    const tmpDir = `${import.meta.dirname}/../../.tmp`
    const filePath = resolve(tmpDir, "snapshot-test.json")

    mkdirSync(tmpDir, { recursive: true })
    saveSnapshot(filePath, snapshot)

    const loaded = loadSnapshot(filePath)
    expect(loaded).not.toBeNull()
    expect(loaded!.version).toBe(1)
    expect(loaded!.tables).toHaveLength(2)

    unlinkSync(filePath)
  })

  it("loadSnapshot returns null for missing file", () => {
    const result = loadSnapshot("/tmp/nonexistent-snapshot-file.json")
    expect(result).toBeNull()
  })

  it("loadSnapshot returns null for corrupt file", () => {
    const tmpDir = `${import.meta.dirname}/../../.tmp`
    const filePath = resolve(tmpDir, "corrupt-snapshot.json")

    mkdirSync(tmpDir, { recursive: true })
    writeFileSync(filePath, "not valid json{", "utf-8")

    const result = loadSnapshot(filePath)
    expect(result).toBeNull()

    unlinkSync(filePath)
  })
})
