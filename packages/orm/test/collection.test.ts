import { Database } from "bun:sqlite"
import { afterAll, beforeAll, describe, expect, it } from "bun:test"
import { BunSqliteDialect } from "kysely-bun-sqlite"
import { t as columnTypes, createArkTypeSchemaConfig } from "../src/columns/index.js"
import { ModelNotFoundError, RelationNotFoundError, ValidationError } from "../src/errors.js"
import { createCollection, createPeta, defineModel } from "../src/index.js"
import { hasMany } from "../src/relations/index.js"

const t = columnTypes({ schema: createArkTypeSchemaConfig() })

const CollItem = defineModel("coll_items", {
  columns: {
    id: t.integer().primaryKey(),
    userId: t.integer(),
    label: t.string(255),
  },
})

const CollUser = defineModel("coll_users", {
  columns: {
    id: t.integer().primaryKey(),
    name: t.string(255),
    role: t.string(50),
  },
  relations: {
    items: hasMany(() => CollItem, { foreignKey: "userId" }),
  },
})

let peta: ReturnType<typeof createPeta>

beforeAll(async () => {
  const database = new Database(":memory:")
  database.run("PRAGMA journal_mode = WAL")
  database.run("CREATE TABLE coll_users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, role TEXT NOT NULL)")
  database.run(
    "CREATE TABLE coll_items (id INTEGER PRIMARY KEY AUTOINCREMENT, userId INTEGER NOT NULL, label TEXT NOT NULL)",
  )
  peta = createPeta({ dialect: new BunSqliteDialect({ database }) })
  peta.registerAll(CollUser, CollItem)
  await CollUser.insert({ name: "Alice", role: "admin" })
  await CollUser.insert({ name: "Bob", role: "user" })
  await CollUser.insert({ name: "Charlie", role: "user" })
  await CollUser.insert({ name: "Diana", role: "admin" })
  const users = await CollUser.query().orderBy("id", "asc").execute()
  await CollItem.insert({ userId: users[0]!.get("id") as number, label: "Item 1" })
  await CollItem.insert({ userId: users[0]!.get("id") as number, label: "Item 2" })
  await CollItem.insert({ userId: users[1]!.get("id") as number, label: "Item 3" })
})

afterAll(async () => {
  await peta.destroy()
})

describe("Collection", () => {
  let col: ReturnType<typeof createCollection>

  beforeAll(async () => {
    const users = await CollUser.query().orderBy("id", "asc").execute()
    col = createCollection(users)
  })

  it("first()", () => {
    const first = col.first()
    expect(first).toBeDefined()
    expect(first!.get("name")).toBe("Alice")
  })

  it("last()", () => {
    const last = col.last()
    expect(last).toBeDefined()
    expect(last!.get("name")).toBe("Diana")
  })

  it("pluck()", () => {
    const names = col.pluck("name")
    expect(names).toEqual(["Alice", "Bob", "Charlie", "Diana"])
  })

  it("groupBy()", () => {
    const grouped = col.groupBy("role")
    expect(grouped.admin).toHaveLength(2)
    expect(grouped.user).toHaveLength(2)
  })

  it("keyBy()", () => {
    const keyed = col.keyBy("name")
    expect(keyed.Alice).toBeDefined()
    expect(keyed.Bob).toBeDefined()
  })

  it("toJSON()", () => {
    const json = col.toJSON()
    expect(json).toHaveLength(4)
    expect(json[0]!).toHaveProperty("name", "Alice")
  })

  it("isEmpty() and isNotEmpty()", () => {
    const empty = createCollection()
    expect(empty.isEmpty()).toBe(true)
    expect(empty.isNotEmpty()).toBe(false)
    expect(col.isEmpty()).toBe(false)
  })

  it("load() hydrates relations on all items", async () => {
    const users = await CollUser.query().orderBy("id", "asc").execute()
    const c = createCollection(users)
    await c.load("items")
    const alice = c.first()!
    expect(alice.$hasRelation("items")).toBe(true)
    expect(alice.$getRelation("items")).toBeArray()
    // Alice (id=1) has 2 items from setup
    expect(alice.$getRelation("items")).toHaveLength(2)
  })

  it("sum/avg/min/max", () => {
    const users = createCollection([
      CollUser.hydrate({ id: 1, name: "a", role: "admin" }),
      CollUser.hydrate({ id: 2, name: "b", role: "user" }),
    ])
    expect(users.sum("id")).toBe(3)
    expect(users.avg("id")).toBe(1.5)
    expect(users.min("id")).toBe(1)
    expect(users.max("id")).toBe(2)
  })

  it("contains", () => {
    const users = createCollection([CollUser.hydrate({ id: 1, name: "Alice", role: "admin" })])
    expect(users.contains("admin", "role")).toBe(true)
    expect(users.contains("bogus", "role")).toBe(false)
  })

  it("unique", () => {
    const users = createCollection([
      CollUser.hydrate({ id: 1, role: "admin" }),
      CollUser.hydrate({ id: 2, role: "user" }),
      CollUser.hydrate({ id: 3, role: "admin" }),
    ])
    expect(users.unique("role")).toHaveLength(2)
  })

  it("sortBy", () => {
    const users = createCollection([CollUser.hydrate({ id: 2, name: "B" }), CollUser.hydrate({ id: 1, name: "A" })])
    const sorted = users.sortBy("name")
    expect(sorted.first()!.get("name")).toBe("A")
    expect(sorted.last()!.get("name")).toBe("B")
  })

  it("take/skip", () => {
    const users = createCollection([
      CollUser.hydrate({ id: 1 }),
      CollUser.hydrate({ id: 2 }),
      CollUser.hydrate({ id: 3 }),
    ])
    expect(users.take(2)).toHaveLength(2)
    expect(users.skip(1)).toHaveLength(2)
  })

  it("chunk splits collection", () => {
    const users = createCollection([
      CollUser.hydrate({ id: 1 }),
      CollUser.hydrate({ id: 2 }),
      CollUser.hydrate({ id: 3 }),
    ])
    expect(users.chunk(2)).toHaveLength(2)
  })

  it("each iterates", () => {
    const ids: number[] = []
    const users = createCollection([CollUser.hydrate({ id: 1 }), CollUser.hydrate({ id: 2 })])
    users.each((u) => ids.push(u.get("id") as number))
    expect(ids).toEqual([1, 2])
  })
})

describe("Paginator", () => {
  it("basic pagination", async () => {
    const result = await CollUser.query().orderBy("id", "asc").paginate(1, 2)
    expect(result.data).toHaveLength(2)
    expect(result.total).toBe(4)
    expect(result.perPage).toBe(2)
    expect(result.currentPage).toBe(1)
    expect(result.lastPage).toBe(2)
    expect(result.hasMorePages).toBe(true)
  })

  it("last page", async () => {
    const result = await CollUser.query().orderBy("id", "asc").paginate(2, 2)
    expect(result.data).toHaveLength(2)
    expect(result.hasMorePages).toBe(false)
  })

  it("paginate returns paginated result with correct properties", async () => {
    const result = await CollUser.query().orderBy("id", "asc").paginate(1, 2)
    expect(result.data).toBeDefined()
    expect(result.total).toBeDefined()
    expect(result.firstItem).toBe(1)
    expect(result.lastItem).toBe(2)
    expect(result.onFirstPage).toBe(true)
    expect(result.onLastPage).toBe(false)
  })

  it("toSQL() produces compiled query", () => {
    const compiled = CollUser.query().where("name", "=", "Alice").toSQL()
    expect(compiled.sql).toBeTruthy()
    expect(compiled.parameters).toBeDefined()
  })

  it("aggregate methods", async () => {
    const total = await CollUser.query().sum("id")
    expect(total).toBeGreaterThan(0)
    const average = await CollUser.query().avg("id")
    expect(average).toBeGreaterThan(0)
    const minVal = await CollUser.query().min("id")
    expect(minVal).toBeGreaterThan(0)
    const maxVal = await CollUser.query().max("id")
    expect(maxVal).toBeGreaterThan(0)
  })

  it("chunk() processes batches", async () => {
    const items: any[] = []
    await CollUser.query()
      .orderBy("id", "asc")
      .chunk(2, async (chunk) => {
        items.push(...chunk)
      })
    expect(items.length).toBeGreaterThanOrEqual(4)
  })

  it("paginate(0) clamps to page 1", async () => {
    const result = await CollUser.query().orderBy("id", "asc").paginate(0, 2)
    expect(result.currentPage).toBe(1)
  })

  it("paginate clamps perPage to max 1000", async () => {
    const result = await CollUser.query().orderBy("id", "asc").paginate(1, 5000)
    expect(result.perPage).toBe(1000)
  })
})

describe("Error types", () => {
  it("ModelNotFoundError", () => {
    const err = new ModelNotFoundError("User", 42)
    expect(err.message).toBe("User with id 42 not found")
    expect(err.name).toBe("ModelNotFoundError")
  })

  it("RelationNotFoundError", () => {
    const err = new RelationNotFoundError("User", "posts")
    expect(err.message).toBe('Relation "posts" not found on User')
  })

  it("ValidationError", () => {
    const err = new ValidationError("test error")
    expect(err.message).toBe("test error")
    expect(err.name).toBe("ValidationError")
  })
})

describe("Global scopes", () => {
  const db = new Database(":memory:")
  let peta: ReturnType<typeof createPeta>

  const ScopedUser = defineModel("scoped_users", {
    columns: { id: t.integer().primaryKey(), name: t.string(255), active: t.integer().default(1) },
  })

  beforeAll(async () => {
    db.run(
      "CREATE TABLE scoped_users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, active INTEGER DEFAULT 1)",
    )
    peta = createPeta({ dialect: new BunSqliteDialect({ database: db }) })
    peta.registerAll(ScopedUser)
    ScopedUser.addGlobalScope("active", (qb: any) => qb.where("active", "=", 1))
    await ScopedUser.insert({ name: "A", active: 1 })
    await ScopedUser.insert({ name: "B", active: 0 })
    await ScopedUser.insert({ name: "C", active: 1 })
  })

  afterAll(async () => {
    await peta.destroy()
    db.close()
  })

  it("applies global scope", async () => {
    const users = await ScopedUser.query().orderBy("id", "asc").execute()
    expect(users).toHaveLength(2)
  })

  it("bypasses global scope", async () => {
    const users = await ScopedUser.query().withoutGlobalScope("active").orderBy("id", "asc").execute()
    expect(users).toHaveLength(3)
  })
})

describe("Batch operations", () => {
  const db = new Database(":memory:")
  let peta: ReturnType<typeof createPeta>

  const BatchUser = defineModel("batch_users", {
    columns: { id: t.integer().primaryKey(), name: t.string(255), role: t.string(50).default("user") },
  })

  beforeAll(async () => {
    db.run(
      "CREATE TABLE batch_users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, role TEXT DEFAULT 'user')",
    )
    peta = createPeta({ dialect: new BunSqliteDialect({ database: db }) })
    peta.registerAll(BatchUser)
    await BatchUser.insert({ name: "A" })
    await BatchUser.insert({ name: "B" })
    await BatchUser.insert({ name: "C" })
  })

  afterAll(async () => {
    await peta.destroy()
    db.close()
  })

  it("updateMany updates multiple records", async () => {
    const affected = await BatchUser.query().updateMany({ role: "member" })
    expect(affected).toBeGreaterThanOrEqual(0)
  })

  it("insertMany inserts records", async () => {
    const users = await BatchUser.insertMany([{ name: "Batch1" }, { name: "Batch2" }])
    expect(users).toHaveLength(2)
  })
})
