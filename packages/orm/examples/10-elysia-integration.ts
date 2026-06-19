// Peta ORM — 10-elysia-integration
// Elysia plugin — self-contained test using app.fetch()

import { Elysia } from "elysia"
import { createClient } from "@libsql/client"
import { LibsqlDialect } from "@libsql/kysely-libsql"
import { t, createORM, defineModel } from "../src/index.js"
import { petaPlugin } from "../src/integrations/elysia.js"


const User = defineModel("users", {
  columns: { id: t.integer().primaryKey(), name: t.string(255) },
})

const client = createClient({ url: "file::memory:?cache=shared" })
await client.execute("CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)")

const client = createORM({
  dialect: new LibsqlDialect({ client }),
  models: { User },
})

const app = new Elysia().use(petaPlugin({ peta: db })).get("/users", async () => {
  const users = await User.query()
  return users.map((u) => u.$toJSON())
})

// ── Self-test using app.fetch() ──
await User.insert({ name: "Alice" })
await User.insert({ name: "Bob" })

const res = await app.fetch(new Request("http://localhost/users"))
const body = await res.json()
console.log("GET /users →", res.status, JSON.stringify(body))

await db.destroy()
