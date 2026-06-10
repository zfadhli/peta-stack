// Peta ORM — 01-basic-setup
// Peta init + SQLite setup + insert/find

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

const user = await User.insert({ name: "Alice", email: "alice@example.com" })
console.log("Created:", user.$toJSON())

const found = await User.find(1)
console.log("Found:", found?.$toJSON())

await peta.destroy()
