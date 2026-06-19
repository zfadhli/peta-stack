// Peta ORM — 14-global-scopes
// addGlobalScope(), withoutGlobalScope()

import { createClient } from "@libsql/client"
import { LibsqlDialect } from "@libsql/kysely-libsql"
import { t, createORM, defineModel } from "../src/index.js"


const User = defineModel("users", {
  columns: {
    id: t.integer().primaryKey(),
    name: t.string(255),
    active: t.integer().default(1),
  },
})

const client = createClient({ url: "file::memory:?cache=shared" })
await client.execute("CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, active INTEGER DEFAULT 1)")

const client = createORM({
  dialect: new LibsqlDialect({ client }),
  models: { User },
})

// Add a global scope that filters to active users only
User.addGlobalScope("active", (qb) => qb.where("active", "=", 1))

await User.insert({ name: "Alice", active: 1 })
await User.insert({ name: "Bob", active: 0 })
await User.insert({ name: "Charlie", active: 1 })

// Global scope applied automatically (no .execute() needed)
const active = await User.query().orderBy("id", "asc")
console.log(
  "Active users (scoped):",
  active.length,
  "—",
  active.map((u) => u.get("name")),
)

// Bypass scope
const all = await User.query().withoutGlobalScope("active").orderBy("id", "asc")
console.log(
  "All users (unscoped):",
  all.length,
  "—",
  all.map((u) => u.get("name")),
)

await db.destroy()
