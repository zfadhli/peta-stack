// Peta ORM — 01-basic-setup
// ORM init + SQLite setup + insert/find
//
// Two equivalent APIs:
//   createORM()  — recommended (new)
//   createPeta() — backward compat alias (identical)

import { Database } from "bun:sqlite"
import { BunSqliteDialect } from "kysely-bun-sqlite"
import { t as columnTypes, createArkTypeSchemaConfig, createORM, defineModel } from "../src/index.js"

const t = columnTypes({ schema: createArkTypeSchemaConfig() })

const User = defineModel("users", {
  columns: {
    id: t.integer().primaryKey(),
    name: t.string(255),
    email: t.text().unique(),
  },
})

const database = new Database(":memory:")
database.run(
  "CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE)",
)

// createORM accepts models in config (one-step registration)
// Equivalent to: createPeta({ dialect }).registerAll(User)
const db = createORM({
  dialect: new BunSqliteDialect({ database }),
  models: { User },
})

const user = await User.insert({ name: "Alice", email: "alice@example.com" })
console.log("Created:", user.$toJSON())

const found = await User.find(1)
console.log("Found:", found?.$toJSON())

await db.destroy()

// Backward compat:
// import { createPeta } from "peta-orm"
// const db = createPeta({ dialect })  // identical to createORM
// db.registerAll(User)               // or pass models via config
// await db.destroy()
