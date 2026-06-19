// Peta ORM — 02-model-definition
// Column types, modifiers, validation, timestamps
// createORM() — recommended init, accepts models in config

import { createClient } from "@libsql/client"
import { LibsqlDialect } from "@libsql/kysely-libsql"
import { t, createORM, defineModel, ValidationError } from "../src/index.js"


const User = defineModel("users", {
  columns: {
    id: t.integer().primaryKey(),
    name: t.string(255).min(2),
    email: t.text().email().unique(),
    age: t.integer().nullable().min(0).max(150),
    role: t.enum("admin", "user", "guest"),
    score: t.float().default(0),
    metadata: t.json().nullable(),
  },
  casts: {
    metadata: "json",
  },
})

const client = createClient({ url: "file::memory:?cache=shared" })
await client.execute(
  "CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, age INTEGER, role TEXT DEFAULT 'user', score REAL DEFAULT 0, metadata TEXT)",
)

const client = createORM({
  dialect: new LibsqlDialect({ client }),
  models: { User },
})

// Valid insert
const alice = await User.insert({ name: "Alice", email: "a@b.com", age: 30, role: "admin" })
console.log("Inserted:", alice.$toJSON())

// Validation error: name too short
try {
  await User.insert({ name: "X", email: "x@y.com" })
} catch (e) {
  console.log("Validation caught:", e instanceof ValidationError ? e.message : e)
}

// JSON column (casts: "json" auto-parses)
const bob = await User.insert({ name: "Bob", email: "b@c.com", metadata: { foo: 1, bar: [2, 3] } })
console.log("JSON metadata:", bob.get("metadata"))

await db.destroy()
