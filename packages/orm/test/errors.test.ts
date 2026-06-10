import { Database } from "bun:sqlite"
import { afterAll, beforeAll, describe, expect, it } from "bun:test"
import { BunSqliteDialect } from "kysely-bun-sqlite"
import { t as columnTypes, createArkTypeSchemaConfig } from "../src/columns/index.js"
import { DatabaseError } from "../src/errors.js"
import { createPeta, defineModel } from "../src/index.js"

const t = columnTypes({ schema: createArkTypeSchemaConfig() })

const UniqueUser = defineModel("unique_users", {
  columns: {
    id: t.integer().primaryKey(),
    slug: t.string(255),
  },
})

let peta: ReturnType<typeof createPeta>

beforeAll(async () => {
  const database = new Database(":memory:")
  database.run("PRAGMA journal_mode = WAL")
  database.run("CREATE TABLE unique_users (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL UNIQUE)")
  peta = createPeta({ dialect: new BunSqliteDialect({ database }) })
  peta.registerAll(UniqueUser)
  await UniqueUser.insert({ slug: "taken" })
})

afterAll(async () => {
  await peta.destroy()
})

describe("DatabaseError", () => {
  it("throws DatabaseError on unique constraint violation (insert)", async () => {
    try {
      await UniqueUser.insert({ slug: "taken" })
      expect.unreachable("should have thrown")
    } catch (e) {
      expect(e).toBeInstanceOf(DatabaseError)
      expect((e as DatabaseError).code).toBe("UNIQUE_CONSTRAINT")
      expect((e as DatabaseError).table).toBe("unique_users")
    }
  })

  it("throws DatabaseError on unique constraint violation (insertMany)", async () => {
    try {
      await UniqueUser.insertMany([{ slug: "taken" }, { slug: "unique" }])
      expect.unreachable("should have thrown")
    } catch (e) {
      expect(e).toBeInstanceOf(DatabaseError)
      expect((e as DatabaseError).code).toBe("UNIQUE_CONSTRAINT")
    }
  })

  it("update on missing record does not throw (returns hydrated model)", async () => {
    // The new API's update does not throw for non-existent records
    const result = await UniqueUser.update(999, { slug: "whatever" })
    expect(result).toBeDefined()
  })

  it("wraps with table name in the error", async () => {
    try {
      await UniqueUser.insert({ slug: "taken" })
    } catch (e) {
      expect((e as DatabaseError).table).toBe("unique_users")
    }
  })

  it("has a descriptive message", async () => {
    try {
      await UniqueUser.insert({ slug: "taken" })
    } catch (e) {
      expect((e as DatabaseError).message).toContain("Unique constraint")
    }
  })
})
