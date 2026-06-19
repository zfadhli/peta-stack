// Peta ORM — 03-crud
// insert, find, findOrFail, first, update, delete, reload, count
// Thenable QB — no .execute() needed

import { createClient } from "@libsql/client"
import { LibsqlDialect } from "@libsql/kysely-libsql"
import { t, createORM, defineModel } from "../src/index.js"


const User = defineModel("users", {
  columns: {
    id: t.integer().primaryKey(),
    name: t.string(255),
    email: t.text().unique(),
  },
})

const client = createClient({ url: "file::memory:?cache=shared" })
await client.execute(
  "CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE)",
)

const client = createORM({
  dialect: new LibsqlDialect({ client }),
  models: { User },
})

// Insert
await User.insert({ name: "Alice", email: "a@b.com" })
await User.insert({ name: "Bob", email: "b@c.com" })
await User.insert({ name: "Charlie", email: "c@d.com" })

// Find by primary key
const alice = await User.find(1)
console.log("Found:", alice?.get("name"))

// findOrFail — throws ModelNotFoundError if not found
try {
  await User.findOrFail(999)
} catch (e) {
  console.log("findOrFail(999) threw:", (e as Error).name)
}

// first — first result or undefined
const first = await User.query().orderBy("id", "asc").first()
console.log("First user:", first?.get("name"))

// Update via instance
alice?.set("name", "Alice Smith")
await alice?.$save()
console.log("Updated:", (await User.find(1))?.get("name"))

// Instance delete
const bob = await User.find(2)
await bob?.$delete()
console.log("After instance delete, count:", await User.query().count())

// Static delete by id
await User.delete(3)
console.log("After static delete, count:", await User.query().count())

// Reload (re-fetch from DB, discarding local changes)
const charlie = await User.insert({ name: "Charlie", email: "newc@d.com" })
charlie.set("name", "Charlie Updated")
await charlie.$reload()
console.log("Reloaded name:", charlie.get("name"), "(original preserved)")

// Count
console.log("Total:", await User.query().count())

await db.destroy()
