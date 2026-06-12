// Peta ORM — 16-discover
// createPeta, registerAll, peta.models

import { Database } from "bun:sqlite"
import { BunSqliteDialect } from "kysely-bun-sqlite"
import { t as columnTypes, createArkTypeSchemaConfig, createPeta, defineModel } from "../src/index.js"

const t = columnTypes({ schema: createArkTypeSchemaConfig() })

const database = new Database(":memory:")
database.run("CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)")

const peta = createPeta({ dialect: new BunSqliteDialect({ database }) })

// Models can be defined anywhere and registered explicitly
const User = defineModel("users", {
  columns: { id: t.integer().primaryKey(), name: t.string(255) },
})

// Register with rest params (no array wrapper needed)
peta.registerAll(User)
console.log("Model count:", [...peta.models.keys()])

const user = await User.insert({ name: "Alice" })
console.log("Inserted:", user.get("name"))

await peta.destroy()
