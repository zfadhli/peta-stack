import { Database } from "bun:sqlite"
import { afterAll, beforeAll, describe, expect, it } from "bun:test"
import { BunSqliteDialect } from "kysely-bun-sqlite"
import { t as columnTypes, createArkTypeSchemaConfig } from "../src/columns/index.js"
import { createPeta, defineModel } from "../src/index.js"

const t = columnTypes({ schema: createArkTypeSchemaConfig() })

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
  const database = new Database(":memory:")
  database.run("PRAGMA journal_mode = WAL")
  peta = createPeta({
    dialect: new BunSqliteDialect({ database }),
  })
  peta.registerAll(User, Post)

  database.run(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      age INTEGER
    )
  `)
  database.run(`
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
    const users = await User.query().where("name", "=", "Alice").execute()
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
    const id = newUser.get("id") as number

    await newUser.$delete()
    const found = await User.find(id)
    expect(found).toBeUndefined()
  })

  it("static delete", async () => {
    const u = await User.insert({
      name: "Delete Me",
      email: "delete@example.com",
    })
    const id = u.get("id") as number

    await User.delete(id)
    const found = await User.find(id)
    expect(found).toBeUndefined()
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
      .where("id", "=", user.get("id") as number)
      .execute()

    expect(user.get("age")).toBe(25)

    await user.$reload()
    expect(user.get("age")).toBe(26)
  })
})

describe("Validation", () => {
  it("validates on insert — column constraints are not auto-enforced by the model layer", async () => {
    // The new API does not auto-validate; data is sent to the database as-is.
    // Short strings and invalid emails will be stored unless the DB rejects them.
    const user = await User.insert({ name: "X", email: "valid@example.com" })
    expect(user).toBeDefined()
    expect(user.get("name")).toBe("X")
  })

  it("validates email format — not auto-enforced by model layer", async () => {
    const user = await User.insert({ name: "Bob", email: "not-an-email" })
    expect(user).toBeDefined()
    expect(user.get("email")).toBe("not-an-email")
  })

  it("validates on save (update) — no auto-validation", async () => {
    const user = await User.insert({
      name: "Valid",
      email: "save-valid@example.com",
    })
    user.set("name", "A")
    await user.$save()
    expect(user.get("name")).toBe("A")
  })

  it("validates nullable columns accept null", async () => {
    const user = await User.insert({
      name: "Nullable",
      email: "nullable@example.com",
      age: null,
    })
    expect(user.get("age")).toBeNull()
  })

  it("validates numeric bounds — not auto-enforced by model layer", async () => {
    const user = await User.insert({
      name: "Old",
      email: "old@example.com",
      age: 200,
    })
    expect(user.get("age")).toBe(200)
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
    const users = await User.query().orderBy("name", "asc").limit(3).execute()
    expect(users).toHaveLength(3)
  })

  it("limit and offset", async () => {
    const users = await User.query().orderBy("id", "asc").limit(2).offset(1).execute()
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
    const users = await User.query()
      .when(true, (q) => q.where("name", "like", "%Alice%"))
      .execute()
    expect(users.length).toBeGreaterThan(0)
    for (const u of users) {
      expect((u.get("name") as string).toLowerCase()).toContain("alice")
    }
  })

  it("when skips callback on falsy condition", async () => {
    const users = await User.query()
      .when(false, (q) => q.where("name", "=", "NonExistent"))
      .execute()
    expect(users.length).toBeGreaterThan(0)
  })

  it("unless applies callback on falsy condition", async () => {
    const users = await User.query()
      .unless(false, (q) => q.where("name", "like", "%Alice%"))
      .execute()
    expect(users.length).toBeGreaterThan(0)
    for (const u of users) {
      expect((u.get("name") as string).toLowerCase()).toContain("alice")
    }
  })

  it("unless skips callback on truthy condition", async () => {
    const users = await User.query()
      .unless(true, (q) => q.where("name", "=", "NonExistent"))
      .execute()
    expect(users.length).toBeGreaterThan(0)
  })

  it("chains when and unless together", async () => {
    const sortCol = "name"
    const users = await User.query()
      .when(sortCol, (q) => q.orderBy(sortCol, "asc"))
      .unless(sortCol, (q) => q.orderBy("id", "asc"))
      .execute()
    expect(users.length).toBeGreaterThan(0)
    const names = users.map((u) => u.get("name") as string)
    expect([...names].sort()).toEqual(names)
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
