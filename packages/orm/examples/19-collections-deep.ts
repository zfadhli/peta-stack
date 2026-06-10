// Peta ORM — 19-collections-deep
// Full Collection + Paginator API

import { Database } from "bun:sqlite"
import { BunSqliteDialect } from "kysely-bun-sqlite"
import { t as columnTypes, createArkTypeSchemaConfig, createPaginator, createPeta, defineModel } from "../src/index.js"

const t = columnTypes({ schema: createArkTypeSchemaConfig() })

const User = defineModel("users", {
  columns: { id: t.integer().primaryKey(), name: t.string(255), score: t.float().default(0) },
})

const database = new Database(":memory:")
database.run("CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, score REAL DEFAULT 0)")

const peta = createPeta({ dialect: new BunSqliteDialect({ database }) })
peta.registerAll(User)

for (let i = 1; i <= 10; i++) {
  await User.insert({ name: `User ${i}`, score: Math.random() * 100 })
}

// Collect from query
const all = await User.query().orderBy("id", "asc").collect()
console.log("Collection length:", all.length)
console.log("First:", all.first()?.get("name"))
console.log("Last:", all.last()?.get("name"))
console.log("Pluck names:", all.pluck("name"))

// Filter and transform
const filtered = all.filter((u) => (u.get("score") as number) > 50)
console.log("Score > 50:", filtered.length)
console.log("Sum of scores:", all.sum("score"))
console.log("Avg score:", all.avg("score"))

// Paginator
const page = createPaginator(all.all().slice(0, 3), all.length, 3, 1)
console.log("Page 1 —", page.data.length, "items, total:", page.total)
console.log("Has more pages:", page.hasMorePages)
console.log("JSON:", JSON.stringify(page.toJSON()))

await peta.destroy()
