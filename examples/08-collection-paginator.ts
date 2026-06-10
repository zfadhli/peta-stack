// Peta ORM — 08-collection-paginator
// Collection, Paginator, .collect()

import { Database } from "bun:sqlite"
import { BunSqliteDialect } from "kysely-bun-sqlite"
import { t as columnTypes, createArkTypeSchemaConfig, createCollection, createPeta, defineModel } from "../src/index.js"

const t = columnTypes({ schema: createArkTypeSchemaConfig() })

const User = defineModel("users", {
  columns: { id: t.integer().primaryKey(), name: t.string(255), role: t.string(50) },
})

const database = new Database(":memory:")
database.run("CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, role TEXT NOT NULL)")

const peta = createPeta({ dialect: new BunSqliteDialect({ database }) })
peta.registerAll(User)

for (const name of ["Alice", "Bob", "Charlie", "Diana"]) {
  await User.insert({ name, role: name === "Alice" || name === "Diana" ? "admin" : "user" })
}

// Collection from query
const users = await User.query().orderBy("id", "asc").collect()
console.log("Total:", users.length)
console.log("First:", users.first()?.get("name"))
console.log("Pluck names:", users.pluck("name"))
console.log("Grouped by role:", Object.keys(users.groupBy("role")))

// Manual collection
const col = createCollection(users.all())
console.log("Admins only:", col.filter((u) => u.get("role") === "admin").length)

// Paginator
const page = await User.query().orderBy("id", "asc").paginate(1, 2)
console.log("Page data:", page.data.length, "items")
console.log("Total:", page.total, "| Pages:", page.lastPage)
console.log("Has more:", page.hasMorePages)

await peta.destroy()
