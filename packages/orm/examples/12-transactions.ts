// Peta ORM — 12-transactions
// orm.transaction(), rollback

import { Database } from "bun:sqlite"
import { BunSqliteDialect } from "kysely-bun-sqlite"
import { t as columnTypes, createArkTypeSchemaConfig, createORM, defineModel } from "../src/index.js"

const t = columnTypes({ schema: createArkTypeSchemaConfig() })

const User = defineModel("users", {
  columns: { id: t.integer().primaryKey(), name: t.string(255) },
})

const database = new Database(":memory:")
database.run("CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)")

const db = createORM({
  dialect: new BunSqliteDialect({ database }),
  models: { User },
})

// Successful transaction
const result = await db.transaction(async (trx) => {
  await trx.insertInto("users").values({ name: "Alice" }).execute()
  await trx.insertInto("users").values({ name: "Bob" }).execute()
  return "done"
})
console.log("Transaction result:", result)
console.log("Users after commit:", await User.query().count())

// Rolled-back transaction
try {
  await db.transaction(async (trx) => {
    await trx.insertInto("users").values({ name: "Charlie" }).execute()
    throw new Error("something went wrong")
  })
} catch {}
console.log("Users after rollback (should be 2):", await User.query().count())

await db.destroy()
