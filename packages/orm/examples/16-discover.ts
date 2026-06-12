// Peta ORM — 16-discover
// Model registration and peta.models
//
// createORM accepts models via the `models` config (one-step):
//   createORM({ dialect, models: { User } })
//
// Or registerAfter with registerAll:
//   const db = createORM({ dialect })
//   db.registerAll(User)
//
// Both approaches are equivalent.

import { Database } from "bun:sqlite"
import { BunSqliteDialect } from "kysely-bun-sqlite"
import { t as columnTypes, createArkTypeSchemaConfig, createORM, defineModel } from "../src/index.js"

const t = columnTypes({ schema: createArkTypeSchemaConfig() })

const database = new Database(":memory:")
database.run("CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)")

// Models can be defined anywhere and registered explicitly
const User = defineModel("users", {
  columns: { id: t.integer().primaryKey(), name: t.string(255) },
})

// createORM with models in config (recommended)
const db = createORM({
  dialect: new BunSqliteDialect({ database }),
  models: { User },
})

console.log("Model count:", [...db.models.keys()])

const user = await User.insert({ name: "Alice" })
console.log("Inserted:", user.get("name"))

await db.destroy()
