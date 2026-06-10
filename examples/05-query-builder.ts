// Peta ORM — 05-query-builder
// where, orderBy, join, has, whereHas, whereDoesntHave, count

import { Database } from "bun:sqlite"
import { BunSqliteDialect } from "kysely-bun-sqlite"
import { t as columnTypes, createArkTypeSchemaConfig, createPeta, defineModel, hasMany } from "../src/index.js"

const t = columnTypes({ schema: createArkTypeSchemaConfig() })

const User = defineModel("users", {
  columns: { id: t.integer().primaryKey(), name: t.string(255) },
  relations: { posts: hasMany(() => Post) },
})

const Post = defineModel("posts", {
  columns: {
    id: t.integer().primaryKey(),
    userId: t.integer(),
    title: t.string(255),
    published: t.integer().default(1),
  },
  relations: { author: hasMany(() => User) },
})

const database = new Database(":memory:")
database.run("CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)")
database.run(
  "CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, userId INTEGER NOT NULL, title TEXT NOT NULL, published INTEGER DEFAULT 1)",
)

const peta = createPeta({ dialect: new BunSqliteDialect({ database }) })
peta.registerAll(User, Post)

const alice = await User.insert({ name: "Alice" })
const bob = await User.insert({ name: "Bob" })
await Post.insert({ userId: alice.get("id") as number, title: "A1", published: 1 })
await Post.insert({ userId: alice.get("id") as number, title: "A2", published: 0 })
await Post.insert({ userId: bob.get("id") as number, title: "B1", published: 1 })

// Where
const active = await Post.query().where("published", "=", 1).execute()
console.log("Active posts:", active.length)

// Order by
const ordered = await Post.query().orderBy("title", "asc").execute()
console.log("First by title:", ordered[0]?.get("title"))

// Has
const withPosts = await User.query().has("posts").execute()
console.log("Users with posts:", withPosts.length)

// WhereHas
const filtered = await User.query()
  .whereHas("posts", (qb) => qb.where("published", "=", 1))
  .execute()
console.log("Users with published posts:", filtered.length)

// WhereDoesntHave
const without = await User.query().whereDoesntHave("posts").execute()
console.log("Users without posts:", without.length)

await peta.destroy()
