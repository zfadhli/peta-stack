// Peta ORM — 08-collection-paginator
// Collection, Paginator, .collect()

import { createClient } from "@libsql/client"
import { LibsqlDialect } from "@libsql/kysely-libsql"
import { t, createCollection, createORM, defineModel } from "../src/index.js"


const User = defineModel("users", {
  columns: { id: t.integer().primaryKey(), name: t.string(255), role: t.string(50) },
})

const client = createClient({ url: "file::memory:?cache=shared" })
await client.execute("CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, role TEXT NOT NULL)")

const client = createORM({
  dialect: new LibsqlDialect({ client }),
  models: { User },
})

for (const name of ["Alice", "Bob", "Charlie", "Diana"]) {
  await User.insert({ name, role: name === "Alice" || name === "Diana" ? "admin" : "user" })
}

// Collection from query (using .collect() terminal)
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

await db.destroy()
