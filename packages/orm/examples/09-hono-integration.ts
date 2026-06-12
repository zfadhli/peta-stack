// Peta ORM — 09-hono-integration
// Hono app + error handling with DatabaseError
// Runs as a self-contained test using Hono's app.fetch()

import { Database } from "bun:sqlite"
import { Hono } from "hono"
import { BunSqliteDialect } from "kysely-bun-sqlite"
import { t as columnTypes, createArkTypeSchemaConfig, createPeta, DatabaseError, defineModel } from "../src/index.js"
import { petaMiddleware } from "../src/integrations/hono.js"

const t = columnTypes({ schema: createArkTypeSchemaConfig() })

const User = defineModel("users", {
  columns: { id: t.integer().primaryKey(), name: t.string(255) },
})

const database = new Database(":memory:")
database.run("CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)")

const peta = createPeta({ dialect: new BunSqliteDialect({ database }) })
peta.registerAll(User)

// Seed
await User.insert({ name: "Alice" })
await User.insert({ name: "Bob" })

const app = new Hono()

app.use("*", petaMiddleware({ peta }))

// GET /users — list all (no .execute() needed)
app.get("/users", async (c) => {
  const users = await User.query()
  return c.json(users.map((u) => u.$toJSON()))
})

// POST /users — create
app.post("/users", async (c) => {
  try {
    const body = await c.req.json()
    const user = await User.insert(body)
    return c.json(user.$toJSON(), 201)
  } catch (e) {
    if (e instanceof DatabaseError) {
      return c.json({ error: e.code, message: e.message }, 409)
    }
    throw e
  }
})

// GET /users/:id — find by PK
app.get("/users/:id", async (c) => {
  const id = Number(c.req.param("id"))
  const user = await User.find(id)
  if (!user) return c.json({ error: "not_found" }, 404)
  return c.json(user.$toJSON())
})

// ── Self-test ──────────────────────────────────────────

let res = await app.fetch(new Request("http://localhost/users"))
console.log("GET /users →", res.status, JSON.stringify(await res.json()))

res = await app.fetch(new Request("http://localhost/users/1"))
console.log("GET /users/1 →", res.status, JSON.stringify(await res.json()))

res = await app.fetch(new Request("http://localhost/users/999"))
console.log("GET /users/999 →", res.status, JSON.stringify(await res.json()))

res = await app.fetch(
  new Request("http://localhost/users", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Charlie" }),
  }),
)
console.log("POST /users →", res.status, JSON.stringify(await res.json()))

res = await app.fetch(
  new Request("http://localhost/users", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "X" }),
  }),
)
console.log("POST /users (short name) →", res.status, JSON.stringify(await res.json()))

res = await app.fetch(new Request("http://localhost/users"))
const all = (await res.json()) as any[]
console.log("Total users:", all.length)

await peta.destroy()
