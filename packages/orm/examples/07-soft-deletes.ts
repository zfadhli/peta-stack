// Peta ORM — 07-soft-deletes
// $delete, $restore, $forceDelete, withTrashed, onlyTrashed

import { createClient } from "@libsql/client"
import { LibsqlDialect } from "@libsql/kysely-libsql"
import { t, createORM, defineModel, softDeletes } from "../src/index.js"


const User = defineModel("users", {
  columns: {
    id: t.integer().primaryKey(),
    name: t.string(255),
    deletedAt: t.timestamp().nullable(),
  },
}).use(softDeletes())

const client = createClient({ url: "file::memory:?cache=shared" })
await client.execute("CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, deletedAt TEXT)")

const client = createORM({
  dialect: new LibsqlDialect({ client }),
  models: { User },
})

// Register for query builder filtering support
User.registerSoftDeletes()

await User.insert({ name: "Alice" })
await User.insert({ name: "Bob" })
await User.insert({ name: "Charlie" })

// Soft delete Bob
const bob = await User.find(2)
await bob!.$delete()
console.log("Bob trashed:", bob!.$trashed())

// Default query excludes soft-deleted
const active = await User.query().orderBy("id", "asc")
console.log(
  "Active users:",
  active.length,
  "—",
  active.map((u) => u.get("name")),
)

// Include trashed
const all = await User.query().withTrashed().orderBy("id", "asc")
console.log("All users:", all.length)

// Only trashed
const trashed = await User.query().onlyTrashed()
console.log("Trashed only:", trashed.length)

// Restore
await bob!.$restore()
console.log("Bob trashed after restore:", bob!.$trashed())

// Force delete permanently
const charlie = await User.find(3)
await charlie!.$forceDelete()
console.log("Charlie exists after force delete:", (await User.find(3)) !== undefined)

await db.destroy()
