// Peta ORM — 05-query-builder
// where, orderBy, orWhere, whereRef, has, whereHas, whereDoesntHave, withCount

import { Database } from "bun:sqlite"
import { BunSqliteDialect } from "kysely-bun-sqlite"
import { t as columnTypes, createArkTypeSchemaConfig, createORM, defineModel, hasMany } from "../src/index.js"

const t = columnTypes({ schema: createArkTypeSchemaConfig() })

const User = defineModel("users", {
  columns: { id: t.integer().primaryKey(), name: t.string(255) },
  relations: { posts: hasMany(() => Post, { foreignKey: "userId" }) },
})

const Post = defineModel("posts", {
  columns: {
    id: t.integer().primaryKey(),
    userId: t.integer(),
    title: t.string(255),
    published: t.integer().default(1),
    votes: t.integer().default(0),
  },
})

const database = new Database(":memory:")
database.run("CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)")
database.run(
  "CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, userId INTEGER NOT NULL, title TEXT NOT NULL, published INTEGER DEFAULT 1, votes INTEGER DEFAULT 0)",
)

const db = createORM({
  dialect: new BunSqliteDialect({ database }),
  models: { User, Post },
})

const alice = await User.insert({ name: "Alice" })
const bob = await User.insert({ name: "Bob" })
await Post.insert({ userId: alice.get("id") as number, title: "A1", published: 1, votes: 10 })
await Post.insert({ userId: alice.get("id") as number, title: "A2", published: 0, votes: 5 })
await Post.insert({ userId: bob.get("id") as number, title: "B1", published: 1, votes: 20 })

// Basic where
const active = await Post.query().where("published", "=", 1)
console.log("Active posts:", active.length)

// orWhere — combines conditions with OR
const popularOrActive = await Post.query()
  .where("votes", ">", 15)
  .orWhere("published", "=", 1)
console.log("Popular or active:", popularOrActive.length)

// whereRef — column-to-column comparison
const selfVoted = await Post.query().whereRef("votes", "=", "published")
console.log("Posts where votes = published:", selfVoted.length)

// Order by
const ordered = await Post.query().orderBy("title", "asc")
console.log("First by title:", ordered[0]?.get("title"))

// has — filter by relation existence
const withPosts = await User.query().has("posts")
console.log("Users with posts:", withPosts.length)

// whereHas — filter with constraint on the relation
const filtered = await User.query()
  .whereHas("posts", (qb) => qb.where("published", "=", 1))
console.log("Users with published posts:", filtered.length)

// whereDoesntHave
const without = await User.query().whereDoesntHave("posts")
console.log("Users without posts:", without.length)

// withCount — load aggregate counts as subquery
const usersWithCount = await User.query().withCount("posts").orderBy("id", "asc")
for (const u of usersWithCount) {
  console.log(`${u.get("name")} has ${u.get("posts_count")} posts`)
}

// withSum — load aggregate sums
const usersWithSum = await User.query().withSum("posts", "votes").orderBy("id", "asc")
for (const u of usersWithSum) {
  console.log(`${u.get("name")}'s total votes across posts: ${u.get("posts_sum_votes")}`)
}

await db.destroy()
