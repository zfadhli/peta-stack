// Peta ORM — 15-batch
// insertMany

import { createClient } from "@libsql/client"
import { LibsqlDialect } from "@libsql/kysely-libsql"
import { t as columnTypes, createArkTypeSchemaConfig, createORM, defineModel } from "../src/index.js"

const t = columnTypes({ schema: createArkTypeSchemaConfig() })

const User = defineModel("users", {
  columns: { id: t.integer().primaryKey(), name: t.string(255) },
})

const client = createClient({ url: "file::memory:?cache=shared" })
await client.execute("CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)")

const client = createORM({
  dialect: new LibsqlDialect({ client }),
  models: { User },
})

// Batch insert
const users = await User.insertMany([{ name: "Alice" }, { name: "Bob" }, { name: "Charlie" }])
console.log("Inserted:", users.length, "users")
console.log("Total:", await User.query().count())

await db.destroy()
