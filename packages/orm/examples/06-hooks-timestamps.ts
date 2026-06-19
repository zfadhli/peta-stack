// Peta ORM — 06-hooks-timestamps
// Instance hooks + plugin-based timestamps

import { createClient } from "@libsql/client"
import { LibsqlDialect } from "@libsql/kysely-libsql"
import { t, createORM, defineModel, timestamps } from "../src/index.js"


const User = defineModel("users", {
  columns: {
    id: t.integer().primaryKey(),
    name: t.string(255),
    slug: t.string(255),
    createdAt: t.timestamp(),
    updatedAt: t.timestamp(),
  },
}).use(timestamps())

const client = createClient({ url: "file::memory:?cache=shared" })
await client.execute(
  "CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, slug TEXT, createdAt TEXT, updatedAt TEXT)",
)

const client = createORM({
  dialect: new LibsqlDialect({ client }),
  models: { User },
})

// Custom beforeCreate hook on top of the plugin
User.on("beforeCreate", (user) => {
  const name = user.get("name") as string
  user.set("slug", name.toLowerCase().replace(/\s+/g, "-"))
})

const user = await User.insert({ name: "Alice Johnson" })
console.log("Slug:", user.get("slug"))
console.log("Created at:", user.get("createdAt"))

user.set("name", "Alice J.")
await user.$save()
console.log("Updated at:", user.get("updatedAt"))

await db.destroy()
