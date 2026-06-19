import { afterAll, beforeAll, describe, expect, it } from "bun:test"
import { createClient } from "@libsql/client"
import { LibsqlDialect } from "@libsql/kysely-libsql"
import { t } from "../src/columns/index.js"
import { DatabaseError } from "../src/errors.js"
import { createPeta, defineModel } from "../src/index.js"


const UniqueUser = defineModel("unique_users", {
  columns: {
    id: t.integer().primaryKey(),
    slug: t.string(255),
  },
})

let peta: ReturnType<typeof createPeta>

beforeAll(async () => {
  const client = createClient({ url: ":memory:" })
  await client.execute("PRAGMA journal_mode = WAL")
  await client.execute("CREATE TABLE unique_users (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL UNIQUE)")
  peta = createPeta({ dialect: new LibsqlDialect({ client }) })
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

  it("update on missing record throws ModelNotFoundError", async () => {
    try {
      await UniqueUser.update(999, { slug: "whatever" })
      expect.unreachable("should have thrown")
    } catch (e: any) {
      expect(e.name).toBe("ModelNotFoundError")
    }
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
