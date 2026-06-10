// Peta ORM — 07-soft-deletes
// $delete, $restore, $forceDelete, withTrashed

import { Database } from "bun:sqlite"
import { BunSqliteDialect } from "kysely-bun-sqlite"
import { t as columnTypes, createArkTypeSchemaConfig, createPeta, defineModel } from "../src/index.js"

const t = columnTypes({ schema: createArkTypeSchemaConfig() })

const User = defineModel("users", {
  columns: {
    id: t.integer().primaryKey(),
    name: t.string(255),
    deletedAt: t.timestamp().nullable(),
  },
})

const database = new Database(":memory:")
database.run("CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, deletedAt TEXT)")

const peta = createPeta({ dialect: new BunSqliteDialect({ database }) })
peta.registerAll(User)

// Enable soft deletes
User.registerSoftDeletes()

await User.insert({ name: "Alice" })
await User.insert({ name: "Bob" })
await User.insert({ name: "Charlie" })

// Soft delete Bob
const bob = await User.find(2)
await bob!.$delete()
console.log("Bob trashed:", bob!.$trashed())

// Default query excludes soft-deleted
const active = await User.query().orderBy("id", "asc").execute()
console.log("Active users:", active.length) // 2
console.log(
  "Active names:",
  active.map((u) => u.get("name")),
)

// Include trashed
const all = await User.query().withTrashed().orderBy("id", "asc").execute()
console.log("All users:", all.length) // 3

// Only trashed
const trashed = await User.query().onlyTrashed().execute()
console.log("Trashed only:", trashed.length) // 1

// Restore
await bob!.$restore()
console.log("Bob trashed after restore:", bob!.$trashed()) // false

// Force delete
const charlie = await User.find(3)
await charlie!.$forceDelete()
console.log("Charlie exists after force delete:", (await User.find(3)) !== undefined) // false

await peta.destroy()
