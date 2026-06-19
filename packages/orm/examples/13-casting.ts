// Peta ORM — 13-casting
// casts, hidden, appends, accessors

import { createClient } from "@libsql/client"
import { LibsqlDialect } from "@libsql/kysely-libsql"
import { t, createORM, defineModel } from "../src/index.js"


const User = defineModel("users", {
  columns: {
    id: t.integer().primaryKey(),
    name: t.string(255),
    metadata: t.text().nullable(),
    flags: t.integer().default(0),
  },
  casts: {
    metadata: "json",
    flags: "boolean",
  },
  hidden: ["metadata"],
})

const client = createClient({ url: "file::memory:?cache=shared" })
await client.execute(
  "CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, metadata TEXT, flags INTEGER DEFAULT 0)",
)

const client = createORM({
  dialect: new LibsqlDialect({ client }),
  models: { User },
})

const user = await User.insert({ name: "Alice", metadata: JSON.stringify({ foo: 1, bar: 2 }), flags: 1 })

// Casting: JSON string → object (auto-parsed on get)
console.log("Metadata (parsed):", user.get("metadata"))

// Casting: integer → boolean
console.log("Flags (boolean):", user.get("flags"))

// Hidden fields excluded from $toJSON
console.log("JSON output:", user.$toJSON())
console.log("Has metadata in JSON:", "metadata" in user.$toJSON())

await db.destroy()
