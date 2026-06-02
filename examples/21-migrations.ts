// Peta ORM — 21-migrations
// MigrationRunner + MigrationGenerator — track and apply schema changes

import { Database } from "bun:sqlite"
import { BunSqliteDialect } from "kysely-bun-sqlite"
import type { ColumnShape } from "../src"
import { $t, ArkTypeSchemaConfig, HasMany, ManyToMany, Model, Peta } from "../src"
import { MigrationGenerator, MigrationRunner } from "../src/migrations"

const t = $t({ schema: new ArkTypeSchemaConfig() })

class User extends Model {
  static override table = "users"
  static override columns = {
    id: t.integer().primaryKey(),
    name: t.string(255),
    email: t.text().unique(),
  } satisfies ColumnShape
  static override relations = {
    posts: new HasMany(() => Post, { foreignKey: "userId" }),
  }
}

class Post extends Model {
  static override table = "posts"
  static override columns = {
    id: t.integer().primaryKey(),
    userId: t.integer().references(() => User, ["id"]),
    title: t.string(255),
    slug: t.string().unique(),
    body: t.text().nullable(),
  } satisfies ColumnShape
  static override relations = {
    tags: new ManyToMany(() => Tag, { through: "post_tags", foreignPivotKey: "postId", relatedPivotKey: "tagId" }),
  }
}

class Tag extends Model {
  static override table = "tags"
  static override columns = { id: t.integer().primaryKey(), name: t.string(255) } satisfies ColumnShape
}

// Pivot tables are regular models — register them for migration generation
class PostTag extends Model {
  static override table = "post_tags"
  static override columns = {
    id: t.integer().primaryKey(),
    postId: t.integer().references(() => Post, ["id"]),
    tagId: t.integer().references(() => Tag, ["id"]),
  } satisfies ColumnShape
}

const database = new Database(":memory:")
database.run("PRAGMA journal_mode = WAL")

const peta = new Peta({ dialect: new BunSqliteDialect({ database }) })
peta.registerAll(User, Post, Tag, PostTag)

// === Generate initial migration code from model definitions ===
const gen = new MigrationGenerator()
const code = gen.generateInitialMigration(peta.models)
console.log("=== Generated migration ===")
console.log(code)

// === Run migrations using runner ===
// Migration files are objects with up/down functions
// In a real project these would live in separate .ts files
const migrations = [
  {
    name: "001_create_users",
    up: async (k: any) => {
      await k.schema
        .createTable("users")
        .addColumn("id", "integer", (c: any) => c.autoIncrement().primaryKey())
        .addColumn("name", "varchar(255)", (c: any) => c.notNull())
        .addColumn("email", "varchar(255)", (c: any) => c.notNull().unique())
        .execute()
    },
    down: async (k: any) => {
      await k.schema.dropTable("users").execute()
    },
  },
]

const runner = new MigrationRunner(peta.kysely)

// Check status before
console.log("\n=== Before ===")
const before = await runner.status(migrations)
console.log("Pending:", before.pending.map((m) => m.name))
console.log("Completed:", before.completed.map((m) => m.name))

// Apply pending
await runner.up(migrations)
console.log("\n=== After up ===")
const after = await runner.status(migrations)
console.log("Pending:", after.pending.map((m) => m.name))
console.log("Completed:", after.completed.map((m) => m.name))

// Rollback
await runner.down(migrations)
console.log("\n=== After down ===")
const final = await runner.status(migrations)
console.log("Pending:", final.pending.map((m) => m.name))
console.log("Completed:", final.completed.map((m) => m.name))

await peta.destroy()
console.log("\nDone.")
