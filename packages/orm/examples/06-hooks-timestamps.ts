// Peta ORM — 06-hooks-timestamps
// Instance hooks + plugin-based timestamps
// The timestamps() plugin replaces the old registerTimestamps() pattern

import { Database } from "bun:sqlite"
import { BunSqliteDialect } from "kysely-bun-sqlite"
import { t as columnTypes, createArkTypeSchemaConfig, createPeta, defineModel, timestamps } from "../src/index.js"

const t = columnTypes({ schema: createArkTypeSchemaConfig() })

const User = defineModel("users", {
  columns: {
    id: t.integer().primaryKey(),
    name: t.string(255),
    slug: t.string(255),
    createdAt: t.timestamp(),
    updatedAt: t.timestamp(),
  },
})
  // Use the timestamps() plugin instead of registerTimestamps()
  .use(timestamps())

const database = new Database(":memory:")
database.run(
  "CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, slug TEXT, createdAt TEXT, updatedAt TEXT)",
)

const peta = createPeta({ dialect: new BunSqliteDialect({ database }) })
peta.registerAll(User)

// Custom beforeCreate hook on top of the plugin
User.on("beforeCreate", (user) => {
  const name = user.get("name") as string
  user.set("slug", name.toLowerCase().replace(/\s+/g, "-"))
})

const user = await User.insert({ name: "Alice Johnson" })
console.log("Slug:", user.get("slug"))
console.log("Created at:", user.get("createdAt"))

// Update triggers updatedAt automatically
user.set("name", "Alice J.")
await user.$save()
console.log("Updated at:", user.get("updatedAt"))

await peta.destroy()
