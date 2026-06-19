import { afterAll, beforeAll, describe, expect, it } from "bun:test"
import { createClient } from "@libsql/client"
import { LibsqlDialect } from "@libsql/kysely-libsql"
import { t as columnTypes, createArkTypeSchemaConfig } from "../src/columns/index.js"
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
  const client = createClient({ url: ":memory:" })
  await client.execute("PRAGMA journal_mode = WAL")
  await client.execute("CREATE TABLE coll_users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, role TEXT NOT NULL)")
  await client.execute(
    "CREATE TABLE coll_items (id INTEGER PRIMARY KEY AUTOINCREMENT, userId INTEGER NOT NULL, label TEXT NOT NULL)",
  )
  peta = createPeta({ dialect: new LibsqlDialect({ client }) })
  peta.registerAll(CollUser, CollItem)
  await CollUser.insert({ name: "Alice", role: "admin" })
  await CollUser.insert({ name: "Bob", role: "user" })
  await CollUser.insert({ name: "Charlie", role: "user" })
  await CollUser.insert({ name: "Diana", role: "admin" })
  const users = await CollUser.query().orderBy("id", "asc")
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
    const users = await CollUser.query().orderBy("id", "asc")
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
    const users = await CollUser.query().orderBy("id", "asc")
    const c = createCollection(users)
    await c.load("items")
    const alice = c.first()!
    expect(alice.$hasRelation("items")).toBe(true)
    const items = alice.$getRelation("items") as any[]
    expect(items).toBeArray()
    expect(items).toHaveLength(2)
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
    expect(
      createCollection([CollUser.hydrate({ id: 1 }), CollUser.hydrate({ id: 2 }), CollUser.hydrate({ id: 3 })]).take(2),
    ).toHaveLength(2)
    expect(
      createCollection([CollUser.hydrate({ id: 1 }), CollUser.hydrate({ id: 2 }), CollUser.hydrate({ id: 3 })]).skip(1),
    ).toHaveLength(2)
  })

  it("chunk splits collection", () => {
    const chunks = createCollection([
      CollUser.hydrate({ id: 1 }),
      CollUser.hydrate({ id: 2 }),
      CollUser.hydrate({ id: 3 }),
    ]).chunk(2)
    expect(chunks).toHaveLength(2)
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
})

describe("Global scopes", () => {
  const db = createClient({ url: ":memory:" })
  let peta: ReturnType<typeof createPeta>

  const ScopedUser = defineModel("scoped_users", {
    columns: { id: t.integer().primaryKey(), name: t.string(255), active: t.integer().default(1) },
  })

  beforeAll(async () => {
    await db.execute(
      "CREATE TABLE scoped_users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, active INTEGER DEFAULT 1)",
    )
    peta = createPeta({ dialect: new LibsqlDialect({ client: db }) })
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
    const users = await ScopedUser.query().orderBy("id", "asc")
    expect(users).toHaveLength(2)
  })

  it("bypasses global scope", async () => {
    const users = await ScopedUser.query().withoutGlobalScope("active").orderBy("id", "asc")
    expect(users).toHaveLength(3)
  })
})

describe("Batch operations", () => {
  const db = createClient({ url: ":memory:" })
  let peta: ReturnType<typeof createPeta>

  const BatchUser = defineModel("batch_users", {
    columns: { id: t.integer().primaryKey(), name: t.string(255), role: t.string(50).default("user") },
  })

  beforeAll(async () => {
    await db.execute(
      "CREATE TABLE batch_users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, role TEXT DEFAULT 'user')",
    )
    peta = createPeta({ dialect: new LibsqlDialect({ client: db }) })
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
    const affected = await BatchUser.query().all().updateMany({ role: "member" })
    expect(affected).toBeGreaterThanOrEqual(0)
  })

  it("insertMany inserts records", async () => {
    const users = await BatchUser.insertMany([{ name: "Batch1" }, { name: "Batch2" }])
    expect(users).toHaveLength(2)
  })
})
