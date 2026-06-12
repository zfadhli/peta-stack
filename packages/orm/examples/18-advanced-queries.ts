// Peta ORM — 18-advanced-queries
// innerJoin, groupBy/having, sum/avg/min/max, withCount, chunk, toSQL, updateMany
// Thenable QB — no .execute() needed for select queries

import { Database } from "bun:sqlite"
import { BunSqliteDialect } from "kysely-bun-sqlite"
import { t as columnTypes, createArkTypeSchemaConfig, createPeta, defineModel, hasMany } from "../src/index.js"

const t = columnTypes({ schema: createArkTypeSchemaConfig() })

const User = defineModel("users", {
  columns: { id: t.integer().primaryKey(), name: t.string(255), score: t.float().default(0) },
  relations: { posts: hasMany(() => Post, { foreignKey: "userId" }) },
})

const Post = defineModel("posts", {
  columns: { id: t.integer().primaryKey(), userId: t.integer(), title: t.string(255), votes: t.integer().default(0) },
})

const database = new Database(":memory:")
database.run("CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, score REAL DEFAULT 0)")
database.run("CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, userId INTEGER NOT NULL, title TEXT NOT NULL, votes INTEGER DEFAULT 0)")

const peta = createPeta({ dialect: new BunSqliteDialect({ database }) })
peta.registerAll(User, Post)

const alice = await User.insert({ name: "Alice", score: 10 })
const bob = await User.insert({ name: "Bob", score: 20 })
const charlie = await User.insert({ name: "Charlie", score: 30 })
await Post.insert({ userId: alice.get("id") as number, title: "Post A1", votes: 5 })
await Post.insert({ userId: alice.get("id") as number, title: "Post A2", votes: 10 })
await Post.insert({ userId: bob.get("id") as number, title: "Post B1", votes: 15 })

// Aggregate methods
console.log("Sum:", await User.query().sum("score"))
console.log("Avg:", await User.query().avg("score"))
console.log("Min:", await User.query().min("score"))
console.log("Max:", await User.query().max("score"))

// withCount — load aggregate counts
const users = await User.query().withCount("posts").withSum("posts", "votes").orderBy("id", "asc")
for (const u of users) {
  console.log(`${u.get("name")}: ${u.get("posts_count")} posts, ${u.get("posts_sum_votes")} total votes`)
}

// innerJoin — join with another table (uses Kysely's join with column refs)
const joined = await Post.query()
  .innerJoin("users", "posts.userId", "users.id")
  .select("posts.title", "users.name as userName")
console.log("Joined posts + users:")
for (const row of joined) {
  // The joined columns are available on the model instance
  const data = row.$toJSON()
  console.log(`  "${data.title}" by user ${(data as any).userName ?? row.get("userId")}`)
}

// groupBy / having
const grouped = await Post.query()
  .select("userId")
  .groupBy("userId")
  .having("userId", ">", 0)
console.log("Groups (unique userIds in posts):", grouped.length)

// toSQL — inspect compiled query
const compiled = User.query().where("score", ">", 15).toSQL()
console.log("SQL:", compiled.sql)
console.log("Params:", compiled.parameters)

// Chunk — process in batches
const names: string[] = []
await User.query()
  .orderBy("id", "asc")
  .chunk(2, async (chunk) => {
    names.push(...chunk.map((u) => u.get("name") as string))
    console.log("Chunk of", chunk.length)
  })
console.log("All names:", names)

// updateMany (requires .all() or explicit WHERE for safety)
const affected = await User.query().all().updateMany({ score: 0 })
console.log("Reset scores for", affected, "users")

await peta.destroy()
