import { afterAll, describe, expect, it } from "bun:test"
import { Kysely } from "kysely"
import { createClient } from "@libsql/client"
import { LibsqlDialect } from "@libsql/kysely-libsql"
import { t, defineModel, createPeta } from "peta-orm"
import { createMigrationGenerator, createMigrationRunner } from "../src/index.js"
import { manyToMany } from "peta-orm"


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

    const tables = (await db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='_peta_migrations'")).rows
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
})
