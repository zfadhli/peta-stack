// Peta ORM — 07-soft-deletes
// $delete, $restore, $forceDelete, withTrashed
// Using the softDeletes() plugin instead of registerSoftDeletes()

import { Database } from "bun:sqlite"
import { BunSqliteDialect } from "kysely-bun-sqlite"
import { t as columnTypes, createArkTypeSchemaConfig, createPeta, defineModel, softDeletes } from "../src/index.js"

const t = columnTypes({ schema: createArkTypeSchemaConfig() })

const User = defineModel("users", {
  columns: {
    id: t.integer().primaryKey(),
    name: t.string(255),
    deletedAt: t.timestamp().nullable(),
  },
})
  // Use the softDeletes() plugin — auto-filters deleted records, sets deletedAt on delete
  .use(softDeletes())

const database = new Database(":memory:")
database.run("CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, deletedAt TEXT)")

const peta = createPeta({ dialect: new BunSqliteDialect({ database }) })
peta.registerAll(User)

// Need to register for query builder filtering support
User.registerSoftDeletes()

await User.insert({ name: "Alice" })
await User.insert({ name: "Bob" })
await User.insert({ name: "Charlie" })

// Soft delete Bob
const bob = await User.find(2)
await bob!.$delete()
console.log("Bob trashed:", bob!.$trashed())

// Default query excludes soft-deleted (no .execute() needed)
const active = await User.query().orderBy("id", "asc")
console.log("Active users:", active.length) // 2
console.log("Active names:", active.map((u) => u.get("name")))

// Include trashed
const all = await User.query().withTrashed().orderBy("id", "asc")
console.log("All users:", all.length) // 3

// Only trashed
const trashed = await User.query().onlyTrashed()
console.log("Trashed only:", trashed.length) // 1

// Restore
await bob!.$restore()
console.log("Bob trashed after restore:", bob!.$trashed()) // false

// Force delete permanently
const charlie = await User.find(3)
await charlie!.$forceDelete()
console.log("Charlie exists after force delete:", (await User.find(3)) !== undefined) // false

await peta.destroy()
