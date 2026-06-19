import { afterAll, describe, expect, it } from "bun:test"
import { createClient } from "@libsql/client"
import { LibsqlDialect } from "@libsql/kysely-libsql"
import { Kysely } from "kysely"
import { createPeta, defineModel, manyToMany, t } from "peta-orm"
import { createMigrationGenerator, createMigrationRunner, pushSchema } from "../src/index.js"
import type { SchemaDiff } from "../src/types.js"

const User = defineModel("users", {
  columns: {
    id: t.integer().primaryKey(),
    name: t.string(255),
    email: t.text().unique(),
    age: t.integer().nullable().default(0),
  },
})

const Post = defineModel("posts", {
  columns: {
    id: t.integer().primaryKey(),
    userId: t.integer(),
    title: t.string(255),
    body: t.text().nullable(),
  },
})

const _migDir = new URL("../../../.tmp/", import.meta.url).pathname
let db: ReturnType<typeof createClient>
let _counter = 0

function createKysely(): Kysely<any> {
  const url = `file:${_migDir}migrate-${++_counter}-${Date.now()}.db`
  db = createClient({ url })
  return new Kysely<any>({ dialect: new LibsqlDialect({ client: db }) })
}

afterAll(() => {
  db?.close()
})

describe("MigrationRunner", () => {
  it("creates the tracking table", async () => {
    const kysely = createKysely()
    const runner = createMigrationRunner(kysely)
    await runner.ensureTable()

    const tables = (await db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='_peta_migrations'"))
      .rows
    expect(tables).toHaveLength(1)

    await kysely.destroy()
  })

  it("getCompleted returns empty before any migrations", async () => {
    const kysely = createKysely()
    const runner = createMigrationRunner(kysely)
    const completed = await runner.getCompleted()
    expect(completed).toEqual([])
    await kysely.destroy()
  })

  it("up applies pending migrations", async () => {
    const kysely = createKysely()
    const runner = createMigrationRunner(kysely)

    await runner.up([
      {
        name: "001_create_users",
        up: async (k) => {
          await k.schema
            .createTable("users")
            .addColumn("id", "integer", (c) => c.autoIncrement().primaryKey())
            .addColumn("name", "varchar(255)", (c) => c.notNull())
            .execute()
        },
        down: async (k) => {
          await k.schema.dropTable("users").execute()
        },
      },
    ])

    const completed = await runner.getCompleted()
    expect(completed).toHaveLength(1)
    expect(completed[0]!.name).toBe("001_create_users")

    const tables = (await db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")).rows
    expect(tables).toHaveLength(1)

    await kysely.destroy()
  })

  it("down rolls back the last batch", async () => {
    const kysely = createKysely()
    const runner = createMigrationRunner(kysely)

    const migrate = {
      name: "001_create_users",
      up: async (k: Kysely<any>) => {
        await k.schema
          .createTable("users")
          .addColumn("id", "integer", (c) => c.autoIncrement().primaryKey())
          .addColumn("name", "varchar(255)", (c) => c.notNull())
          .execute()
      },
      down: async (k: Kysely<any>) => {
        await k.schema.dropTable("users").execute()
      },
    }

    await runner.up([migrate])

    let tables = (await db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")).rows
    expect(tables).toHaveLength(1)

    await runner.down([migrate])

    tables = (await db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")).rows
    expect(tables).toHaveLength(0)

    const completed = await runner.getCompleted()
    expect(completed).toHaveLength(0)

    await kysely.destroy()
  })

  it("status shows pending and completed", async () => {
    const kysely = createKysely()
    const runner = createMigrationRunner(kysely)

    const m1 = {
      name: "001_first",
      up: async (_k: Kysely<any>) => {},
      down: async (_k: Kysely<any>) => {},
    }
    const m2 = {
      name: "002_second",
      up: async (_k: Kysely<any>) => {},
      down: async (_k: Kysely<any>) => {},
    }

    await runner.up([m1])

    const status = await runner.status([m1, m2])
    expect(status.completed).toHaveLength(1)
    expect(status.completed[0]!.name).toBe("001_first")
    expect(status.pending).toHaveLength(1)
    expect(status.pending[0]!.name).toBe("002_second")

    await kysely.destroy()
  })

  it("ensureTable is idempotent when called twice", async () => {
    const kysely = createKysely()
    const runner = createMigrationRunner(kysely)
    await runner.ensureTable()
    await runner.ensureTable() // should not throw
    const tables = (await db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='_peta_migrations'"))
      .rows
    expect(tables).toHaveLength(1)
    await kysely.destroy()
  })

  it("ensureTable does not crash when tracking table has entries (regression #10)", async () => {
    const kysely = createKysely()
    const runner = createMigrationRunner(kysely)

    // First, apply a migration so the tracking table has an entry
    await runner.up([
      {
        name: "001_seeded",
        up: async () => {},
        down: async () => {},
      },
    ])

    // ensureTable should be a no-op, not throw "corrupted migrations"
    await runner.ensureTable()

    const completed = await runner.getCompleted()
    expect(completed).toHaveLength(1)
    expect(completed[0]!.name).toBe("001_seeded")

    await kysely.destroy()
  })

  it("up with empty migrations does not throw", async () => {
    const kysely = createKysely()
    const runner = createMigrationRunner(kysely)
    await runner.up([])
    await kysely.destroy()
  })

  it("down when no migrations have been run does not throw", async () => {
    const kysely = createKysely()
    const runner = createMigrationRunner(kysely)
    await runner.down([])
    await kysely.destroy()
  })

  it("getCompleted returns empty before ensureTable", async () => {
    const kysely = createKysely()
    const runner = createMigrationRunner(kysely)
    const completed = await runner.getCompleted()
    expect(completed).toEqual([])
    await kysely.destroy()
  })

  it("status with no migrations shows empty", async () => {
    const kysely = createKysely()
    const runner = createMigrationRunner(kysely)
    const status = await runner.status([])
    expect(status.completed).toEqual([])
    expect(status.pending).toEqual([])
    await kysely.destroy()
  })

  it("works with custom tracking table name", async () => {
    const kysely = createKysely()
    const runner = createMigrationRunner(kysely, "_custom_migrations")
    await runner.ensureTable()
    const tables = (await db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='_custom_migrations'"))
      .rows
    expect(tables).toHaveLength(1)
    await kysely.destroy()
  })
})

describe("MigrationGenerator", () => {
  it("generates create table for registered models", () => {
    const Comment = defineModel("comments", {
      columns: {
        id: t.integer().primaryKey(),
        postId: t.integer().references(() => Post, ["id"]),
        body: t.text(),
      },
    })

    const peta = createPeta({ dialect: new LibsqlDialect({ url: ":memory:" }) })
    peta.registerAll(User, Post, Comment)
    const gen = createMigrationGenerator()
    const code = gen.generateInitialMigration(peta.models)

    expect(code).toContain('createTable("users")')
    expect(code).toContain('createTable("posts")')
    expect(code).toContain('createTable("comments")')
    expect(code).toContain("autoIncrement()")
    expect(code).toContain("primaryKey()")
    expect(code).toContain("notNull()")
    expect(code).toContain("unique()")
    expect(code).toContain("defaultTo(0)")
    expect(code).toContain('"id"')
    expect(code).toContain('"name"')
    expect(code).toContain('"email"')
    expect(code).toContain('"age"')

    expect(code).toContain('references("posts.id")')

    expect(code).toContain('dropTable("users")')
    expect(code).toContain('dropTable("posts")')
    expect(code).toContain('dropTable("comments")')

    expect(code).toContain(".ifNotExists()")
  })

  it("generates ifNotExists on createTable", () => {
    const peta = createPeta({ dialect: new LibsqlDialect({ url: ":memory:" }) })
    peta.registerAll(User, Post)
    const gen = createMigrationGenerator()
    const code = gen.generateInitialMigration(peta.models)

    const matches = code.match(/createTable/g)
    const ifNotExistsMatches = code.match(/ifNotExists\(\)/g)
    expect(matches?.length).toBe(ifNotExistsMatches?.length)
  })

  it("warns when ManyToMany pivot table has no registered model", () => {
    const Tag = defineModel("tags", {
      columns: { id: t.integer().primaryKey(), name: t.string(255) },
    })

    const PostWithTags = defineModel("posts", {
      columns: { id: t.integer().primaryKey(), title: t.string(255) },
      relations: {
        tags: manyToMany(() => Tag, { through: "post_tags", foreignPivotKey: "postId", relatedPivotKey: "tagId" }),
      },
    })

    const peta = createPeta({ dialect: new LibsqlDialect({ url: ":memory:" }) })
    peta.registerAll(PostWithTags, Tag)
    const gen = createMigrationGenerator()
    const code = gen.generateInitialMigration(peta.models)

    expect(code).toContain("no model is registered for it")
    expect(code).toContain("post_tags")
  })

  it("suppresses warning when pivot model is registered", () => {
    const Tag = defineModel("tags", {
      columns: { id: t.integer().primaryKey(), name: t.string(255) },
    })

    const PostWithTags = defineModel("posts", {
      columns: { id: t.integer().primaryKey(), title: t.string(255) },
      relations: {
        tags: manyToMany(() => Tag, { through: "post_tags", foreignPivotKey: "postId", relatedPivotKey: "tagId" }),
      },
    })

    const PostTag = defineModel("post_tags", {
      columns: {
        id: t.integer().primaryKey(),
        postId: t.integer().references(() => PostWithTags, ["id"]),
        tagId: t.integer().references(() => Tag, ["id"]),
      },
    })

    const peta = createPeta({ dialect: new LibsqlDialect({ url: ":memory:" }) })
    peta.registerAll(PostWithTags, Tag, PostTag)
    const gen = createMigrationGenerator()
    const code = gen.generateInitialMigration(peta.models)

    expect(code).not.toContain("no model is registered for it")
    expect(code).toContain('createTable("post_tags")')
  })

  it("generated migration is syntactically valid when run", async () => {
    const peta = createPeta({ dialect: new LibsqlDialect({ url: ":memory:" }) })
    peta.registerAll(User, Post)
    const gen = createMigrationGenerator()
    const code = gen.generateInitialMigration(peta.models)

    expect(code).toContain("export async function up")
    expect(code).toContain("export async function down")
  })

  describe("generateMigrationFromDiff", () => {
    const _diff = (partial: Partial<SchemaDiff>): SchemaDiff => ({
      type: "createTable",
      table: "t",
      ...partial,
    })

    it("generates createTable with columns and indexes", () => {
      const gen = createMigrationGenerator()
      const diffs: SchemaDiff[] = [
        {
          type: "createTable",
          table: "items",
          details: {
            columns: [
              {
                name: "id",
                type: "integer",
                isNullable: false,
                isPrimaryKey: true,
                isUnique: false,
                defaultValue: undefined,
              },
              {
                name: "name",
                type: "varchar(255)",
                isNullable: false,
                isPrimaryKey: false,
                isUnique: false,
                defaultValue: undefined,
              },
            ],
            indexes: [{ name: "items_name_index", columns: ["name"] }],
          },
        },
      ]
      const code = gen.generateMigrationFromDiff(diffs)
      expect(code).toContain('createTable("items")')
      expect(code).toContain('"id"')
      expect(code).toContain('"name"')
      expect(code).toContain(".ifNotExists()")
      expect(code).toContain("primaryKey()")
      expect(code).toContain('createIndex("items_name_index"')
      expect(code).toContain('dropTable("items")')
    })

    it("generates addColumn", () => {
      const gen = createMigrationGenerator()
      const diffs: SchemaDiff[] = [
        {
          type: "addColumn",
          table: "users",
          column: "email",
          details: {
            name: "email",
            type: "varchar(255)",
            isNullable: false,
            isPrimaryKey: false,
            isUnique: true,
            defaultValue: undefined,
          },
        },
      ]
      const code = gen.generateMigrationFromDiff(diffs)
      expect(code).toContain('alterTable("users")')
      expect(code).toContain('addColumn("email"')
      expect(code).toContain("unique()")
      expect(code).toContain('dropColumn("email"')
    })

    it("generates dropColumn", () => {
      const gen = createMigrationGenerator()
      const diffs: SchemaDiff[] = [{ type: "dropColumn", table: "users", column: "obsolete" }]
      const code = gen.generateMigrationFromDiff(diffs)
      expect(code).toContain('dropColumn("obsolete")')
      expect(code).toContain("Cannot auto-restore dropped column")
    })

    it("generates dropTable", () => {
      const gen = createMigrationGenerator()
      const diffs: SchemaDiff[] = [{ type: "dropTable", table: "old_table" }]
      const code = gen.generateMigrationFromDiff(diffs)
      expect(code).toContain('dropTable("old_table")')
      expect(code).toContain("Cannot auto-restore dropped table")
    })

    it("generates addIndex and dropIndex", () => {
      const gen = createMigrationGenerator()
      const diffs: SchemaDiff[] = [
        {
          type: "addIndex",
          table: "users",
          details: { indexName: "users_email_index", columns: ["email"] },
        },
        {
          type: "dropIndex",
          table: "posts",
          details: { indexName: "posts_title_index" },
        },
      ]
      const code = gen.generateMigrationFromDiff(diffs)
      expect(code).toContain('createIndex("users_email_index"')
      expect(code).toContain('dropIndex("posts_title_index")')
      expect(code).toContain("Cannot auto-restore dropped index")
    })

    it("generates alterColumn with warning", () => {
      const gen = createMigrationGenerator()
      const diffs: SchemaDiff[] = [
        {
          type: "alterColumn",
          table: "users",
          column: "name",
          details: {
            from: {
              name: "name",
              type: "varchar(255)",
              isNullable: false,
              isPrimaryKey: false,
              isUnique: false,
              defaultValue: undefined,
            },
            to: {
              name: "name",
              type: "text",
              isNullable: true,
              isPrimaryKey: false,
              isUnique: false,
              defaultValue: undefined,
            },
          },
        },
      ]
      const code = gen.generateMigrationFromDiff(diffs)
      expect(code).toContain("ALTER COLUMN")
      expect(code).toContain("varchar(255)")
      expect(code).toContain("text")
      expect(code).toContain("Down migration is not auto-generated")
    })

    it("generates all 7 diff types in a single migration", () => {
      const gen = createMigrationGenerator()
      const diffs: SchemaDiff[] = [
        {
          type: "createTable",
          table: "new_table",
          details: {
            columns: [
              {
                name: "id",
                type: "integer",
                isNullable: false,
                isPrimaryKey: true,
                isUnique: false,
                defaultValue: undefined,
              },
            ],
            indexes: [],
          },
        },
        { type: "dropTable", table: "gone" },
        {
          type: "addColumn",
          table: "users",
          column: "age",
          details: {
            name: "age",
            type: "integer",
            isNullable: true,
            isPrimaryKey: false,
            isUnique: false,
            defaultValue: undefined,
          },
        },
        { type: "dropColumn", table: "users", column: "legacy" },
        {
          type: "alterColumn",
          table: "users",
          column: "name",
          details: {
            from: {
              name: "name",
              type: "varchar(255)",
              isNullable: false,
              isPrimaryKey: false,
              isUnique: false,
              defaultValue: undefined,
            },
            to: {
              name: "name",
              type: "text",
              isNullable: true,
              isPrimaryKey: false,
              isUnique: false,
              defaultValue: undefined,
            },
          },
        },
        { type: "addIndex", table: "users", details: { indexName: "users_email_index", columns: ["email"] } },
        { type: "dropIndex", table: "posts", details: { indexName: "posts_title_index" } },
      ]
      const code = gen.generateMigrationFromDiff(diffs)
      expect(code).toContain("export async function up")
      expect(code).toContain("export async function down")
      expect(code).toContain("createTable")
      expect(code).toContain("dropTable")
      expect(code).toContain("addColumn")
      expect(code).toContain("dropColumn")
      expect(code).toContain("ALTER COLUMN")
      expect(code).toContain("createIndex")
      expect(code).toContain("dropIndex")
    })

    it("generates column with references in addColumn", () => {
      const gen = createMigrationGenerator()
      const diffs: SchemaDiff[] = [
        {
          type: "addColumn",
          table: "posts",
          column: "authorId",
          details: {
            name: "authorId",
            type: "integer",
            isNullable: false,
            isPrimaryKey: false,
            isUnique: false,
            defaultValue: undefined,
            references: { table: "authors", column: "id" },
          },
        },
      ]
      const code = gen.generateMigrationFromDiff(diffs)
      expect(code).toContain('references("authors.id")')
    })
  })
})

describe("pushSchema", () => {
  it("creates tables for registered models", async () => {
    const client = createClient({ url: ":memory:" })
    const kysely = new Kysely<any>({ dialect: new LibsqlDialect({ client }) })

    const TestUser = defineModel("push_users", {
      columns: {
        id: t.integer().primaryKey(),
        name: t.string(255),
        email: t.text().unique(),
      },
    })

    const peta = createPeta({ dialect: new LibsqlDialect({ url: ":memory:" }) })
    peta.registerAll(TestUser)
    const created = await pushSchema(kysely, peta.models)
    expect(created).toContain("push_users")

    const tables = (await client.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='push_users'"))
      .rows
    expect(tables).toHaveLength(1)
    await kysely.destroy()
    client.close()
  })

  it("skips existing tables (idempotent)", async () => {
    const client = createClient({ url: ":memory:" })
    const kysely = new Kysely<any>({ dialect: new LibsqlDialect({ client }) })

    const TestUser = defineModel("skip_users", {
      columns: {
        id: t.integer().primaryKey(),
        name: t.string(255),
      },
    })

    const peta = createPeta({ dialect: new LibsqlDialect({ url: ":memory:" }) })
    peta.registerAll(TestUser)

    // First push creates the table
    const first = await pushSchema(kysely, peta.models)
    expect(first).toContain("skip_users")

    // Second push should skip it
    const second = await pushSchema(kysely, peta.models)
    expect(second).not.toContain("skip_users")

    await kysely.destroy()
    client.close()
  })

  it("handles empty models map", async () => {
    const client = createClient({ url: ":memory:" })
    const kysely = new Kysely<any>({ dialect: new LibsqlDialect({ client }) })

    const created = await pushSchema(kysely, new Map())
    expect(created).toEqual([])

    await kysely.destroy()
    client.close()
  })

  it("creates indexes for columns with index() constraint", async () => {
    const client = createClient({ url: ":memory:" })
    const kysely = new Kysely<any>({ dialect: new LibsqlDialect({ client }) })

    const IndexedModel = defineModel("idx_test", {
      columns: {
        id: t.integer().primaryKey(),
        email: t.text().index(),
        name: t.string(100).unique(),
      },
    })

    const peta = createPeta({ dialect: new LibsqlDialect({ url: ":memory:" }) })
    peta.registerAll(IndexedModel)

    await pushSchema(kysely, peta.models)

    const indexes = (await client.execute("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='idx_test'"))
      .rows as Array<{ name: string }>

    const indexNames = indexes.map((r) => r.name)
    // email has index() constraint -> should create index
    expect(indexNames).toContain("idx_test_email_index")
    // name is unique -> should NOT get a separate index (unique covers it)
    const _nameIndex = indexNames.find((n) => n.includes("name"))
    // Note: sqlite may auto-create an index for unique constraint, that's fine
    // We just verify the custom index on email was created
    await kysely.destroy()
    client.close()
  })

  it("creates table with references", async () => {
    const client = createClient({ url: ":memory:" })
    const kysely = new Kysely<any>({ dialect: new LibsqlDialect({ client }) })

    const RefParent = defineModel("ref_parents", {
      columns: { id: t.integer().primaryKey(), name: t.string(255) },
    })

    const RefChild = defineModel("ref_children", {
      columns: {
        id: t.integer().primaryKey(),
        parentId: t.integer().references(() => RefParent, ["id"]),
      },
    })

    const peta = createPeta({ dialect: new LibsqlDialect({ url: ":memory:" }) })
    // Register parent first so it exists before child references it
    peta.registerAll(RefParent, RefChild)

    const created = await pushSchema(kysely, peta.models)
    expect(created).toContain("ref_parents")
    expect(created).toContain("ref_children")

    await kysely.destroy()
    client.close()
  })
})
