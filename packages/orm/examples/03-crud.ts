// Peta ORM — 03-crud
// insert, find, update, delete, reload, paginate, count

import { Database } from "bun:sqlite"
import { BunSqliteDialect } from "kysely-bun-sqlite"
import { t as columnTypes, createArkTypeSchemaConfig, createPeta, defineModel } from "../src/index.js"

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

const peta = createPeta({ dialect: new BunSqliteDialect({ database }) })
peta.registerAll(User)

// Insert
await User.insert({ name: "Alice", email: "a@b.com" })
await User.insert({ name: "Bob", email: "b@c.com" })
await User.insert({ name: "Charlie", email: "c@d.com" })

// Find
const alice = await User.find(1)
console.log("Found:", alice?.get("name"))

// Update
alice?.set("name", "Alice Smith")
await alice?.$save()
console.log("Updated:", (await User.find(1))?.get("name"))

// Delete
const bob = await User.find(2)
await bob?.$delete()
console.log("After delete, count:", await User.query().count())

// Reload
const charlie = await User.find(3)
charlie?.set("name", "Charlie Updated")
const _oldName = charlie?.get("name")
await charlie?.$reload()
console.log("Reloaded name:", charlie?.get("name"), "(original preserved)")

// Count
console.log("Total:", await User.query().count())

await peta.destroy()
