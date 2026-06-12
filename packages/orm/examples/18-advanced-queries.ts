// Peta ORM — 18-advanced-queries
// groupBy/having, sum/avg/min/max, chunk, toSQL, updateMany
// Thenable QB — no .execute() needed for select queries

import { Database } from "bun:sqlite"
import { BunSqliteDialect } from "kysely-bun-sqlite"
import { t as columnTypes, createArkTypeSchemaConfig, createPeta, defineModel } from "../src/index.js"

const t = columnTypes({ schema: createArkTypeSchemaConfig() })

const User = defineModel("users", {
  columns: { id: t.integer().primaryKey(), name: t.string(255), score: t.float().default(0) },
})

const database = new Database(":memory:")
database.run("CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, score REAL DEFAULT 0)")

const peta = createPeta({ dialect: new BunSqliteDialect({ database }) })
peta.registerAll(User)

await User.insert({ name: "Alice", score: 10 })
await User.insert({ name: "Bob", score: 20 })
await User.insert({ name: "Charlie", score: 30 })

// Aggregate methods
console.log("Sum:", await User.query().sum("score"))
console.log("Avg:", await User.query().avg("score"))
console.log("Min:", await User.query().min("score"))
console.log("Max:", await User.query().max("score"))

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
