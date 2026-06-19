// Peta ORM — 26-repository-pattern
// createRepo() — chainable custom query methods

import { createClient } from "@libsql/client"
import { LibsqlDialect } from "@libsql/kysely-libsql"
import { t as columnTypes, createArkTypeSchemaConfig, createORM, defineModel } from "../src/index.js"
import { createRepo } from "../src/repo/index.js"

const t = columnTypes({ schema: createArkTypeSchemaConfig() })

const User = defineModel("users", {
  columns: {
    id: t.integer().primaryKey(),
    name: t.string(255),
    email: t.text(),
    role: t.string(50).default("user"),
    active: t.integer().default(1),
  },
})

const client = createClient({ url: "file::memory:?cache=shared" })
await client.execute(
  "CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL, role TEXT DEFAULT 'user', active INTEGER DEFAULT 1)",
)

const client = createORM({
  dialect: new LibsqlDialect({ client }),
  models: { User },
})

await User.insert({ name: "Alice", email: "alice@test.com", role: "admin" })
await User.insert({ name: "Bob", email: "bob@test.com", role: "user" })
await User.insert({ name: "Charlie", email: "charlie@test.com", role: "user" })

const userRepo = createRepo(User, {
  queryMethods: {
    search(q, query: string) {
      return q.where("name", "like", `%${query}%`)
    },
    active(q) {
      return q.where("active", "=", 1)
    },
    admins(q) {
      return q.where("role", "=", "admin")
    },
  },
})

// Chain custom methods together
const results = await userRepo.search("lice").active()
console.log(
  "Active users matching 'lice':",
  results.length,
  "—",
  results.map((u: any) => u.get("name")),
)

// Compose with standard QB methods
const admins = await userRepo.admins().orderBy("name", "asc")
console.log(
  "Admins:",
  admins.map((u: any) => u.get("name")),
)

// Use with pagination
const page = await userRepo.search("a").paginate(1, 10)
console.log("Search results (page 1):", page.total, "total")

await db.destroy()
