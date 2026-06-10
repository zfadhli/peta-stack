// Peta ORM — 09-hono-integration
// Hono app + error handling with DatabaseError

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

const app = new Hono()

app.use("*", petaMiddleware({ peta }))

app.get("/users", async (c) => {
  const users = await User.query().execute()
  return c.json(users.map((u) => u.$toJSON()))
})

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

app.get("/users/:id", async (c) => {
  const id = Number(c.req.param("id"))
  const user = await User.find(id)
  if (!user) return c.json({ error: "not_found" }, 404)
  return c.json(user.$toJSON())
})

await peta.destroy()
