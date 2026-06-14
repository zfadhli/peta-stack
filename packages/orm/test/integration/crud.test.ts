/**
 * Integration tests: CRUD operations across all database dialects.
 *
 * Covers: model.test.ts + attribute.test.ts + collection.test.ts
 */

import { t as columnTypes, createArkTypeSchemaConfig } from "../../src/columns/index.js"
import { Attribute, defineModel } from "../../src/index.js"
import { computeAtRuntime, computeBatchAtRuntime, setComputedConfig } from "../../src/model/computed.js"
import type { DialectContext } from "./setup.js"
import {
  afterAll,
  applySchemas,
  beforeAll,
  createDefaultSchemas,
  describe,
  dropSchemas,
  expect,
  getAvailableDialects,
  idColumn,
  it,
} from "./setup.js"

const _t = columnTypes({ schema: createArkTypeSchemaConfig() })

// ─── Tests ──────────────────────────────────────────────────────────

for (const dialect of await getAvailableDialects()) {
  describe(`[${dialect.label}] CRUD`, () => {
    let ctx: DialectContext

    beforeAll(async () => {
      ctx = await dialect.create()
      await applySchemas(ctx.kysely, createDefaultSchemas(dialect.name))
    })

    afterAll(async () => {
      await dropSchemas(ctx.kysely, createDefaultSchemas(dialect.name))
      await ctx.destroy()
    })

    // ─── Basic CRUD ──────────────────────────────────────────────

    describe("CRUD operations", () => {
      const User = defineModel("users", {
        columns: {
          id: _t.integer().primaryKey(),
          name: _t.string(255),
          email: _t.text().unique(),
          age: _t.integer().nullable().default(0),
        },
      })

      const Post = defineModel("posts", {
        columns: {
          id: _t.integer().primaryKey(),
          userId: _t.integer(),
          title: _t.string(255),
          body: _t.text().nullable(),
        },
      })

      beforeAll(() => {
        ctx.registerAll(User, Post)
      })

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

      it("updates a record via $save", async () => {
        const user = await User.find(1)
        expect(user).toBeDefined()
        user!.set("name", "Alice Updated")
        await user!.$save()
        const reloaded = await User.find(1)
        expect(reloaded!.get("name")).toBe("Alice Updated")
      })

      it("updates via static update", async () => {
        await User.update(1, { age: 31 })
        const user = await User.find(1)
        expect(user!.get("age")).toBe(31)
      })

      it("deletes a record via $delete", async () => {
        const newUser = await User.insert({ name: "Temp", email: "tempdel@example.com" })
        const id = newUser.get("id") as number
        await newUser.$delete()
        const found = await User.find(id)
        expect(found).toBeUndefined()
      })

      it("deletes via static delete", async () => {
        const u = await User.insert({ name: "Delete Me", email: "deletestatic@example.com" })
        const id = u.get("id") as number
        await User.delete(id)
        const found = await User.find(id)
        expect(found).toBeUndefined()
      })

      it("reloads a record", async () => {
        const user = await User.insert({ name: "Reload", email: "reload@example.com", age: 25 })
        await ctx.kysely
          .updateTable("users")
          .set({ age: 26 })
          .where("id", "=", user.get("id") as number)
          .execute()
        expect(user.get("age")).toBe(25)
        await user.$reload()
        expect(user.get("age")).toBe(26)
      })

      it("inserts with nullable column as null", async () => {
        const user = await User.insert({ name: "Nullable", email: "nullable@example.com", age: null })
        expect(user.get("age")).toBeNull()
      })
    })

    // ─── Query Builder ───────────────────────────────────────────

    describe("Query Builder", () => {
      const User = defineModel("users", {
        columns: {
          id: _t.integer().primaryKey(),
          name: _t.string(255),
          email: _t.text().unique(),
          age: _t.integer().nullable().default(0),
        },
      })

      beforeAll(async () => {
        ctx.registerAll(User)
        for (let i = 0; i < 5; i++) {
          await User.insert({ name: `User ${i}`, email: `qb${i}@example.com`, age: 20 + i })
        }
      })

      it("orderBy and limit", async () => {
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

      it("when conditionally applies callback", async () => {
        const users = await User.query().when(true, (q) => q.where("name", "like", "%User%"))
        expect(users.length).toBeGreaterThan(0)
      })

      it("unless conditionally skips callback", async () => {
        const users = await User.query().unless(true, (q) => q.where("name", "=", "NonExistent"))
        expect(users.length).toBeGreaterThan(0)
      })
    })

    // ─── insertMany ──────────────────────────────────────────────

    describe("insertMany", () => {
      const User = defineModel("users", {
        columns: {
          id: _t.integer().primaryKey(),
          name: _t.string(255),
          email: _t.text().unique(),
          age: _t.integer().nullable().default(0),
        },
      })

      beforeAll(() => {
        ctx.registerAll(User)
      })

      it("inserts multiple records", async () => {
        const users = await User.insertMany([
          { name: "Multi1", email: "multi1@example.com", age: 20 },
          { name: "Multi2", email: "multi2@example.com", age: 30 },
          { name: "Multi3", email: "multi3@example.com", age: 40 },
        ])
        expect(users).toHaveLength(3)
        expect(users[0]!.get("name")).toBe("Multi1")
        expect(users[1]!.get("name")).toBe("Multi2")
        expect(users[2]!.get("name")).toBe("Multi3")
      })
    })

    // ─── Pagination ──────────────────────────────────────────────

    describe("Pagination", () => {
      const Post = defineModel("posts", {
        columns: {
          id: _t.integer().primaryKey(),
          userId: _t.integer(),
          title: _t.string(255),
          body: _t.text().nullable(),
        },
      })

      beforeAll(async () => {
        ctx.registerAll(Post)
        for (let i = 0; i < 15; i++) {
          await Post.insert({ userId: 1, title: `Post ${i}`, body: `Body ${i}` })
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

    // ─── $toJSON ─────────────────────────────────────────────────

    describe("toJSON", () => {
      const User = defineModel("users", {
        columns: {
          id: _t.integer().primaryKey(),
          name: _t.string(255),
          email: _t.text().unique(),
          age: _t.integer().nullable().default(0),
        },
      })

      beforeAll(() => {
        ctx.registerAll(User)
      })

      it("returns plain attributes", async () => {
        const user = await User.insert({ name: "JSON Test", email: "jsontest@example.com" })
        const json = user.$toJSON()
        expect(json).toHaveProperty("name", "JSON Test")
        expect(json).toHaveProperty("email", "jsontest@example.com")
        expect(json).toHaveProperty("id")
      })
    })

    // ─── Attributes (accessors + mutators) ───────────────────────

    describe("Attribute accessors & mutators", () => {
      // Use a separate table to avoid model definition conflicts
      beforeAll(async () => {
        await ctx.kysely.schema
          .createTable("attr_users")
          .addColumn("id", "integer", idColumn(dialect.name))
          .addColumn("name", "varchar(255)", (c) => c.notNull())
          .addColumn("email", "varchar(255)")
          .addColumn("password", "varchar(255)")
          .addColumn("role", "varchar(50)", (c) => c.defaultTo("user"))
          .execute()
      })

      afterAll(async () => {
        await ctx.kysely.schema.dropTable("attr_users").ifExists().execute()
      })

      const User = defineModel("attr_users", {
        columns: {
          id: _t.integer().primaryKey(),
          name: _t.string(255),
          email: _t.text().nullable(),
          password: _t.string(255).nullable(),
          role: _t.string(50).nullable().default("user"),
        },
        attributes: {
          name: Attribute.make({
            set: (v: string) => v.trim(),
            get: (v: string) => v?.toUpperCase(),
          }),
          password: Attribute.make({
            set: (v: string) => `hash_${v}`,
            get: () => "***",
          }),
          email: Attribute.make({
            get: (v: string | null) => (v ? v.toLowerCase() : v),
          }),
          role: Attribute.make({
            set: (v: string) => v.toLowerCase(),
          }),
        },
      })

      beforeAll(() => {
        ctx.registerAll(User)
      })

      it("get accessor transforms value on read", async () => {
        const user = await User.insert({ name: "  Alice  ", email: "alice@test.com" })
        // set mutator trimmed the name; get accessor uppercased it
        expect(user.get("name")).toBe("ALICE")
        // raw attribute is the trimmed value
        expect(user.attributes.name).toBe("Alice")
      })

      it("set mutator transforms value on write", async () => {
        const user = User.hydrate({ id: 1, name: "Bob", email: "bob@test.com" })
        user.set("password", "secret123")
        expect(user.get("password")).toBe("***")
        expect(user.attributes.password).toBe("hash_secret123")
      })

      it("both get and set work together", async () => {
        const user = User.hydrate({ id: 2, name: "Charlie", email: "charlie@test.com" })
        user.set("name", "  CHARLIE  ")
        expect(user.attributes.name).toBe("CHARLIE")
        expect(user.get("name")).toBe("CHARLIE")
      })

      it("set mutator on insert transforms data before DB", async () => {
        const user = await User.insert({ name: "  E ve  ", email: "EVE@TEST.COM", password: "mypass" })
        expect(user.attributes.name).toBe("E ve")
        expect(user.get("name")).toBe("E VE")
        expect(user.attributes.password).toBe("hash_mypass")
      })
    })

    // ─── Computed Columns ────────────────────────────────────────

    describe("Computed columns", () => {
      beforeAll(async () => {
        await ctx.kysely.schema
          .createTable("computed_users")
          .addColumn("id", "integer", idColumn(dialect.name))
          .addColumn("firstName", "varchar(100)", (c) => c.notNull())
          .addColumn("lastName", "varchar(100)", (c) => c.notNull())
          .execute()
      })

      afterAll(async () => {
        await ctx.kysely.schema.dropTable("computed_users").ifExists().execute()
      })

      const User = defineModel("computed_users", {
        columns: {
          id: _t.integer().primaryKey(),
          firstName: _t.string(100),
          lastName: _t.string(100),
        },
      })

      beforeAll(async () => {
        ctx.registerAll(User)
        await User.insert({ firstName: "John", lastName: "Doe" })
        await User.insert({ firstName: "Jane", lastName: "Smith" })
      })

      it("applies runtime computed column via computeAtRuntime", async () => {
        setComputedConfig(User as any, {
          fullName: computeAtRuntime(["firstName", "lastName"], (record) => {
            return `${record.get("firstName")} ${record.get("lastName")}`
          }),
        })

        const users = await User.query().select("firstName", "lastName", "fullName").execute()
        expect(users).toHaveLength(2)
        const john = users.find((u) => u.get("firstName") === "John")
        expect(john).toBeDefined()
        expect(john!.get("fullName")).toBe("John Doe")
      })

      it("applies batch computed column via computeBatchAtRuntime", async () => {
        setComputedConfig(User as any, {
          greeting: computeBatchAtRuntime(["firstName"], async (users) => {
            return users.map((u) => `Hello, ${u.get("firstName")}!`)
          }),
        })

        const users = await User.query().select("firstName", "greeting").orderBy("id", "asc").execute()
        expect(users).toHaveLength(2)
        expect(users[0]!.get("greeting")).toBe("Hello, John!")
        expect(users[1]!.get("greeting")).toBe("Hello, Jane!")
      })
    })
  })
}
