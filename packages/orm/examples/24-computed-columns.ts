// Peta ORM — 24-computed-columns
// Runtime + batch async computed columns

import { createClient } from "@libsql/client"
import { LibsqlDialect } from "@libsql/kysely-libsql"
import { t as columnTypes, createArkTypeSchemaConfig, createORM, defineModel } from "../src/index.js"
import { computeAtRuntime, computeBatchAtRuntime, setComputedConfig } from "../src/model/computed.js"

const t = columnTypes({ schema: createArkTypeSchemaConfig() })

const User = defineModel("users", {
  columns: {
    id: t.integer().primaryKey(),
    firstName: t.string(100),
    lastName: t.string(100),
    country: t.string(100),
  },
})

const client = createClient({ url: "file::memory:?cache=shared" })
await client.execute(
  "CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, firstName TEXT NOT NULL, lastName TEXT NOT NULL, country TEXT NOT NULL)",
)

const client = createORM({
  dialect: new LibsqlDialect({ client }),
  models: { User },
})

await User.insert({ firstName: "John", lastName: "Doe", country: "US" })
await User.insert({ firstName: "Jane", lastName: "Smith", country: "UK" })

// Add computed columns
setComputedConfig(User as any, {
  fullName: computeAtRuntime(["firstName", "lastName"], (record) => {
    return `${record.get("firstName")} ${record.get("lastName")}`
  }),
  greeting: computeBatchAtRuntime(["firstName"], async (records) => {
    return records.map((r) => `Hello, ${r.get("firstName")}!`)
  }),
})

// Select computed columns alongside regular ones
const users = await User.query().select("firstName", "lastName", "country", "fullName", "greeting")
for (const u of users) {
  console.log(`${u.get("fullName")} (${u.get("country")}): ${u.get("greeting")}`)
}

await db.destroy()
