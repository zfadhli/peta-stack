// Peta ORM — 10-elysia-integration
// Elysia plugin

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

const _app = new Elysia()
  .use(petaPlugin({ peta }))
  .get("/users", async () => {
    const users = await User.query().execute()
    return users.map((u) => u.$toJSON())
  })
  .listen(3000)

console.log("Elysia running on port 3000")
await peta.destroy()
