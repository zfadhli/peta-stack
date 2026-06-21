import { afterAll, beforeAll, describe, expect, it } from "bun:test"
import { createClient } from "@libsql/client"
import { LibsqlDialect } from "@libsql/kysely-libsql"
import { t } from "../src/columns/index.js"
import { createPeta, defineModel } from "../src/index.js"
import { computeAtRuntime, computeBatchAtRuntime } from "../src/model/computed.js"

const User = defineModel("users", {
  columns: {
    id: t.integer().primaryKey(),
    name: t.string(255).min(2),
    email: t.text().email(),
    age: t.integer().nullable().min(0).max(150),
  },
})

const Post = defineModel("posts", {
  columns: {
    id: t.integer().primaryKey(),
    userId: t.integer(),
    title: t.string(255).min(1),
    body: t.text().nullable(),
  },
})

let peta: ReturnType<typeof createPeta>

beforeAll(async () => {
  const client = createClient({ url: ":memory:" })
  await client.execute("PRAGMA journal_mode = WAL")
  peta = createPeta({
    dialect: new LibsqlDialect({ client }),
  })
  peta.registerAll(User, Post)

  await client.execute(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      age INTEGER
    )
  `)
  await client.execute(`
    CREATE TABLE posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      FOREIGN KEY (userId) REFERENCES users(id)
    )
  `)
})

afterAll(async () => {
  await peta.destroy()
  const db = (peta.kysely.getExecutor() as any).adapter?.db
  if (db?.close) db.close()
})

describe("Model CRUD", () => {
  it("inserts a record and returns a model instance", async () => {
    const user = await User.insert({
      name: "Alice",
      email: "alice@example.com",
      age: 30,
    })
    expect(user).toBeDefined()
    expect(user.get("name")).toBe("Alice")
    expect(user.get("email")).toBe("alice@example.com")
    expect(user.get("age")).toBe(30)
    expect(user.get("id")).toBeGreaterThan(0)
    expect(user.exists).toBe(true)
  })

  it("finds a record by id", async () => {
    const user = await User.find(1)
    expect(user).toBeDefined()
    expect(user!.get("name")).toBe("Alice")
  })

  it("findOrFail returns model or throws", async () => {
    const user = await User.findOrFail(1)
    expect(user.get("name")).toBe("Alice")

    expect(User.findOrFail(999)).rejects.toThrow()
  })

  it("queries with where clause", async () => {
    const users = await User.query().where("name", "=", "Alice")
    expect(users).toHaveLength(1)
    expect(users[0]!.get("name")).toBe("Alice")
  })

  it("updates a record", async () => {
    const user = await User.find(1)
    expect(user).toBeDefined()

    user!.set("name", "Alice Updated")
    await user!.$save()

    const reloaded = await User.find(1)
    expect(reloaded!.get("name")).toBe("Alice Updated")
  })

  it("static update", async () => {
    await User.update(1, { age: 31 })
    const user = await User.find(1)
    expect(user!.get("age")).toBe(31)
  })

  it("deletes a record", async () => {
    const newUser = await User.insert({
      name: "Temp",
      email: "temp@example.com",
    })
    const id = newUser.get("id")

    await newUser.$delete()
    const found = await User.find(id)
    expect(found).toBeUndefined()
  })

  it("static delete", async () => {
    const u = await User.insert({
      name: "Delete Me",
      email: "delete@example.com",
    })
    const id = u.get("id")

    await User.delete(id)
    const found = await User.find(id)
    expect(found).toBeUndefined()
  })

  it("updateMany", async () => {
    const u1 = await User.insert({ name: "UM One", email: "um1@example.com", age: 10 })
    const u2 = await User.insert({ name: "UM Two", email: "um2@example.com", age: 20 })
    const count = await User.updateMany({ age: 99 }, [{ id: u1.get("id") }, { id: u2.get("id") }])
    expect(count).toBe(2)
    const r1 = await User.find(u1.get("id"))
    expect(r1!.get("age")).toBe(99)
    const r2 = await User.find(u2.get("id"))
    expect(r2!.get("age")).toBe(99)
  })

  it("deleteMany", async () => {
    const u1 = await User.insert({ name: "DM One", email: "dm1@example.com" })
    const u2 = await User.insert({ name: "DM Two", email: "dm2@example.com" })
    const u3 = await User.insert({ name: "DM Keep", email: "dm3@example.com" })
    const count = await User.deleteMany([{ id: u1.get("id") }, { id: u2.get("id") }])
    expect(count).toBe(2)
    const found1 = await User.find(u1.get("id"))
    expect(found1).toBeUndefined()
    const found2 = await User.find(u2.get("id"))
    expect(found2).toBeUndefined()
    const kept = await User.find(u3.get("id"))
    expect(kept).toBeDefined()
  })

  it("reloads a record", async () => {
    const user = await User.insert({
      name: "Reload",
      email: "reload@example.com",
      age: 25,
    })

    await peta.kysely
      .updateTable("users")
      .set({ age: 26 })
      .where("id", "=", user.get("id"))
      .execute()

    expect(user.get("age")).toBe(25)

    await user.$reload()
    expect(user.get("age")).toBe(26)
  })
})

describe("Upsert", () => {
  it("inserts a new record when pk is not present", async () => {
    const user = await User.upsert({
      name: "Upsert New",
      email: "upsert-new@example.com",
      age: 25,
    })
    expect(user).toBeDefined()
    expect(user.get("name")).toBe("Upsert New")
    expect(user.get("email")).toBe("upsert-new@example.com")
    expect(user.get("age")).toBe(25)
    expect(user.get("id")).toBeGreaterThan(0)
    expect(user.exists).toBe(true)
  })

  it("updates an existing record when pk matches", async () => {
    const existing = await User.insert({
      name: "Before Upsert",
      email: "upsert-existing@example.com",
      age: 30,
    })
    const id = existing.get("id") as number

    const updated = await User.upsert({
      id,
      name: "After Upsert",
      email: "upsert-existing@example.com",
      age: 31,
    })
    expect(updated.get("name")).toBe("After Upsert")
    expect(updated.get("age")).toBe(31)
    expect(updated.get("id")).toBe(id)

    const reloaded = await User.find(id)
    expect(reloaded!.get("name")).toBe("After Upsert")
    expect(reloaded!.get("age")).toBe(31)
  })
})

describe("Validation", () => {
  it("inserts with nullable column as null", async () => {
    const user = await User.insert({
      name: "Nullable",
      email: "nullable@example.com",
      age: null,
    })
    expect(user.get("age")).toBeNull()
  })
})

describe("fill() column whitelisting", () => {
  it("strips undeclared keys", async () => {
    const model = await User.insert({ name: "test", email: "filltest@example.com", age: 20 })
    model.fill({ name: "updated", is_admin: true, role: "admin" })
    expect(model.get("name")).toBe("updated")
    expect(model.get("is_admin")).toBeUndefined()
    expect(model.get("role")).toBeUndefined()
  })

  it("ignores typos while keeping valid keys", async () => {
    const model = await User.insert({ name: "original", email: "typotest@example.com", age: 25 })
    model.fill({ name: "correct", emial: "typo" })
    expect(model.get("name")).toBe("correct")
    expect(model.get("emial")).toBeUndefined()
  })
})

describe("Query Builder", () => {
  beforeAll(async () => {
    for (let i = 0; i < 5; i++) {
      await User.insert({
        name: `User ${i}`,
        email: `user${i}@example.com`,
        age: 20 + i,
      })
    }
  })

  it("orderBy", async () => {
    const users = await User.query().orderBy("name", "asc").limit(3)
    expect(users).toHaveLength(3)
  })

  it("limit and offset", async () => {
    const users = await User.query().orderBy("id", "asc").limit(2).offset(1)
    expect(users).toHaveLength(2)
  })

  it("count", async () => {
    const count = await User.query().count()
    expect(count).toBeGreaterThan(0)
  })

  it("first", async () => {
    const user = await User.query().orderBy("id", "asc").first()
    expect(user).toBeDefined()
    expect(user!.get("id")).toBeDefined()
  })

  it("executeTakeFirst", async () => {
    const user = await User.query().where("id", "=", 1).executeTakeFirst()
    expect(user).toBeDefined()
  })

  it("executeTakeFirstOrThrow", async () => {
    const user = await User.query().where("id", "=", 1).executeTakeFirstOrThrow()
    expect(user).toBeDefined()

    expect(User.query().where("id", "=", 9999).executeTakeFirstOrThrow()).rejects.toThrow()
  })

  it("when applies callback on truthy condition", async () => {
    const users = await User.query().when(true, (q) => q.where("name", "like", "%Alice%"))
    expect(users.length).toBeGreaterThan(0)
    for (const u of users) {
      expect(u.get("name").toLowerCase()).toContain("alice")
    }
  })

  it("when skips callback on falsy condition", async () => {
    const users = await User.query().when(false, (q) => q.where("name", "=", "NonExistent"))
    expect(users.length).toBeGreaterThan(0)
  })

  it("unless applies callback on falsy condition", async () => {
    const users = await User.query().unless(false, (q) => q.where("name", "like", "%Alice%"))
    expect(users.length).toBeGreaterThan(0)
    for (const u of users) {
      expect(u.get("name").toLowerCase()).toContain("alice")
    }
  })

  it("unless skips callback on truthy condition", async () => {
    const users = await User.query().unless(true, (q) => q.where("name", "=", "NonExistent"))
    expect(users.length).toBeGreaterThan(0)
  })
})

describe("Chunking", () => {
  it("query().chunk() splits results into batches", async () => {
    const ids: number[] = []
    for (let i = 0; i < 10; i++) {
      const post = await Post.insert({
        userId: 1,
        title: `Chunk Post ${i}`,
        body: `chunk-test-${i}`,
      })
      ids.push(post.get("id") as number)
    }
    const callCount: number[] = []
    await Post.query()
      .where("body", "like", "chunk-test-%")
      .orderBy("id", "asc")
      .chunk(3, async (chunk) => {
        callCount.push(chunk.length)
      })
    expect(callCount).toEqual([3, 3, 3, 1])
    // Clean up so Pagination tests aren't affected
    for (const id of ids) {
      await Post.delete(id)
    }
  })
})

describe("Pagination", () => {
  beforeAll(async () => {
    for (let i = 0; i < 15; i++) {
      await Post.insert({
        userId: 1,
        title: `Post ${i}`,
        body: `Body ${i}`,
      })
    }
  })

  it("paginates results", async () => {
    const result = await Post.query().orderBy("id", "asc").paginate(1, 5)
    expect(result.data).toHaveLength(5)
    expect(result.total).toBeGreaterThanOrEqual(15)
    expect(result.perPage).toBe(5)
    expect(result.currentPage).toBe(1)
    expect(result.lastPage).toBeGreaterThanOrEqual(3)
    expect(result.hasMorePages).toBe(true)
  })

  it("paginates last page", async () => {
    const result = await Post.query().orderBy("id", "asc").paginate(4, 5)
    expect(result.data.length).toBeLessThanOrEqual(5)
    expect(result.hasMorePages).toBe(false)
  })
})

describe("Model.toJSON", () => {
  it("returns plain attributes", async () => {
    const user = await User.insert({
      name: "JSON Test",
      email: "json@example.com",
    })
    const json = user.$toJSON()
    expect(json).toHaveProperty("name", "JSON Test")
    expect(json).toHaveProperty("email", "json@example.com")
    expect(json).toHaveProperty("id")
  })
})

describe("Thenable query builder", () => {
  it("can be awaited directly", async () => {
    const users = await User.query().where("name", "like", "%Alice%")
    expect(Array.isArray(users)).toBe(true)
  })
})

describe("Transactions", () => {
  it("transaction runs without error", async () => {
    const result = await peta.transaction(async () => {
      const user = await User.insert({ name: "TxUser", email: "tx@test.com" })
      return user.get("id")
    })
    expect(result).not.toBeUndefined()
  })
})

describe("Computed columns", () => {
  const db = createClient({ url: ":memory:" })
  let peta: ReturnType<typeof createPeta>

  const ComputedUser = defineModel("computed_users", {
    columns: {
      id: t.integer().primaryKey(),
      firstName: t.string(100),
      lastName: t.string(100),
    },
  })

  beforeAll(async () => {
    await db.execute("PRAGMA journal_mode = WAL")
    await db.execute(
      "CREATE TABLE computed_users (id INTEGER PRIMARY KEY AUTOINCREMENT, firstName TEXT NOT NULL, lastName TEXT NOT NULL)",
    )
    peta = createPeta({ dialect: new LibsqlDialect({ client: db }) })
    peta.registerAll(ComputedUser)
    await ComputedUser.insert({ firstName: "John", lastName: "Doe" })
    await ComputedUser.insert({ firstName: "Jane", lastName: "Smith" })
  })

  afterAll(async () => {
    await peta.destroy()
    db.close()
  })

  it("applies runtime computed columns via computeAtRuntime", async () => {
    // Manually set computed config and test via select
    const { setComputedConfig } = await import("../src/model/computed.js")
    setComputedConfig(ComputedUser as any, {
      fullName: computeAtRuntime(["firstName", "lastName"], (record) => {
        return `${record.get("firstName")} ${record.get("lastName")}`
      }),
    })

    const users = await ComputedUser.query().select("firstName", "lastName", "fullName").execute()
    expect(users).toHaveLength(2)
    const john = users.find((u) => u.get("firstName") === "John")
    expect(john).toBeDefined()
    expect(john!.get("fullName")).toBe("John Doe")
    const jane = users.find((u) => u.get("firstName") === "Jane")
    expect(jane).toBeDefined()
    expect(jane!.get("fullName")).toBe("Jane Smith")
  })

  it("applies batch computed columns via computeBatchAtRuntime", async () => {
    const { setComputedConfig } = await import("../src/model/computed.js")
    setComputedConfig(ComputedUser as any, {
      greeting: computeBatchAtRuntime(["firstName"], async (users) => {
        return users.map((u) => `Hello, ${u.get("firstName")}!`)
      }),
    })

    const users = await ComputedUser.query()
      .select("firstName", "greeting")
      .orderBy("id", "asc")
      .execute()
    expect(users).toHaveLength(2)
    expect(users[0]!.get("greeting")).toBe("Hello, John!")
    expect(users[1]!.get("greeting")).toBe("Hello, Jane!")
  })
})
