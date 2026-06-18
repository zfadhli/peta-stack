// Peta ORM — 16-discover
// Model registration and peta.models
//
// createORM accepts models via the `models` config (one-step):
//   createORM({ dialect, models: { User } })
//
// Or registerAfter with registerAll:
//   const client = createORM({ dialect })
//   db.registerAll(User)
//
// Both approaches are equivalent.

import { createClient } from "@libsql/client"
import { LibsqlDialect } from "@libsql/kysely-libsql"
import { t as columnTypes, createArkTypeSchemaConfig, createORM, defineModel } from "../src/index.js"

const t = columnTypes({ schema: createArkTypeSchemaConfig() })

const client = createClient({ url: "file::memory:?cache=shared" })
await client.execute("CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)")

// Models can be defined anywhere and registered explicitly
const User = defineModel("users", {
  columns: { id: t.integer().primaryKey(), name: t.string(255) },
})

// createORM with models in config (recommended)
const client = createORM({
  dialect: new LibsqlDialect({ client }),
  models: { User },
})

console.log("Model count:", [...db.models.keys()])

const user = await User.insert({ name: "Alice" })
console.log("Inserted:", user.get("name"))

await db.destroy()
