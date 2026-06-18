// Peta ORM — 01-basic-setup
// ORM init + SQLite setup + insert/find
//
// Two equivalent APIs:
//   createORM()  — recommended (new)
//   createPeta() — backward compat alias (identical)

import { createClient } from "@libsql/client"
import { LibsqlDialect } from "@libsql/kysely-libsql"
import { t as columnTypes, createArkTypeSchemaConfig, createORM, defineModel } from "../src/index.js"

const t = columnTypes({ schema: createArkTypeSchemaConfig() })

const User = defineModel("users", {
  columns: {
    id: t.integer().primaryKey(),
    name: t.string(255),
    email: t.text().unique(),
  },
})

const client = createClient({ url: "file::memory:?cache=shared" })
await client.execute(
  "CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE)",
)

// createORM accepts models in config (one-step registration)
// Equivalent to: createPeta({ dialect }).registerAll(User)
const client = createORM({
  dialect: new LibsqlDialect({ client }),
  models: { User },
})

const user = await User.insert({ name: "Alice", email: "alice@example.com" })
console.log("Created:", user.$toJSON())

const found = await User.find(1)
console.log("Found:", found?.$toJSON())

await db.destroy()

// Backward compat:
// import { createPeta } from "peta-orm"
// const client = createPeta({ dialect })  // identical to createORM
// db.registerAll(User)               // or pass models via config
// await db.destroy()
