// Peta ORM — 25-static-hooks
// asFindQuery() preview + cancelQuery() abort

import { createClient } from "@libsql/client"
import { LibsqlDialect } from "@libsql/kysely-libsql"
import { t as columnTypes, createArkTypeSchemaConfig, createORM, defineModel } from "../src/index.js"

const t = columnTypes({ schema: createArkTypeSchemaConfig() })

const User = defineModel("users", {
  columns: { id: t.integer().primaryKey(), name: t.string(255), active: t.integer().default(1) },
})

const client = createClient({ url: "file::memory:?cache=shared" })
await client.execute("CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, active INTEGER DEFAULT 1)")

const client = createORM({
  dialect: new LibsqlDialect({ client }),
  models: { User },
})

await User.insert({ name: "Alice" })
await User.insert({ name: "Bob" })
await User.insert({ name: "Charlie" })

// beforeDelete: preview what will be deleted
const deletedIds: number[] = []
User.beforeDelete(async ({ asFindQuery }) => {
  const rows = await asFindQuery().select("id")
  for (const row of rows) {
    deletedIds.push(row.get("id") as number)
  }
  console.log("About to delete IDs:", deletedIds)
})

// beforeUpdate: preview what will be changed
const updatedIds: number[] = []
User.beforeUpdate(async ({ asFindQuery }) => {
  const rows = await asFindQuery().select("id")
  for (const row of rows) {
    updatedIds.push(row.get("id") as number)
  }
  console.log("About to update IDs:", updatedIds)
})

// cancelQuery: abort a mutation
User.beforeDelete(({ cancelQuery }) => {
  if (deletedIds.length > 1) {
    console.log("Cancelling delete — too many records")
    cancelQuery(0)
  }
})

const result = await User.query().where("active", "=", 1).all().deleteMany()
console.log("Deleted count (cancelled):", result)

await User.query().where("name", "=", "Charlie").all().updateMany({ name: "Charles" })
console.log("Updated IDs:", updatedIds)
console.log("New name:", (await User.find(3))?.get("name"))

await db.destroy()
