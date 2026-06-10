// Peta ORM — 10-elysia-integration
// Elysia plugin — self-contained test using app.fetch()

import { Database } from "bun:sqlite"
import { Elysia } from "elysia"
import { BunSqliteDialect } from "kysely-bun-sqlite"
import { t as columnTypes, createArkTypeSchemaConfig, createPeta, defineModel } from "../src/index.js"
import { petaPlugin } from "../src/integrations/elysia.js"

const t = columnTypes({ schema: createArkTypeSchemaConfig() })

const User = defineModel("users", {
  columns: { id: t.integer().primaryKey(), name: t.string(255) },
})

const database = new Database(":memory:")
database.run("CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)")

const peta = createPeta({ dialect: new BunSqliteDialect({ database }) })
peta.registerAll(User)

const app = new Elysia().use(petaPlugin({ peta })).get("/users", async () => {
  const users = await User.query().execute()
  return users.map((u) => u.$toJSON())
})

// ── Self-test using app.fetch() ──
await User.insert({ name: "Alice" })
await User.insert({ name: "Bob" })

const res = await app.fetch(new Request("http://localhost/users"))
const body = await res.json()
console.log("GET /users →", res.status, JSON.stringify(body))

await peta.destroy()
