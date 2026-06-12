// Peta ORM — 25-static-hooks
// asFindQuery() — preview affected rows, cancelQuery() — abort mutations
// Static hooks run once per query, not per instance

import { Database } from "bun:sqlite"
import { BunSqliteDialect } from "kysely-bun-sqlite"
import { t as columnTypes, createArkTypeSchemaConfig, createPeta, defineModel } from "../src/index.js"

const t = columnTypes({ schema: createArkTypeSchemaConfig() })

const User = defineModel("users", {
  columns: { id: t.integer().primaryKey(), name: t.string(255), active: t.integer().default(1) },
})

const database = new Database(":memory:")
database.run("CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, active INTEGER DEFAULT 1)")

const peta = createPeta({ dialect: new BunSqliteDialect({ database }) })
peta.registerAll(User)

await User.insert({ name: "Alice" })
await User.insert({ name: "Bob" })
await User.insert({ name: "Charlie" })

// beforeDelete hook — preview what will be deleted using asFindQuery()
const affectedIds: number[] = []
User.beforeDelete(async ({ asFindQuery }) => {
  const rows = await asFindQuery().select("id")
  for (const row of rows) {
    affectedIds.push(row.get("id") as number)
  }
  console.log("About to delete IDs:", affectedIds)
})

// cancelQuery — prevent the mutation and return a custom result
User.beforeDelete(({ cancelQuery }) => {
  // If the query targets too many records, cancel
  cancelQuery(0) // return 0 instead of actually deleting
})

// Perform a delete (will be cancelled by the hook)
const result = await User.query().where("active", "=", 1).all().deleteMany()
console.log("Deleted count (cancelled):", result) // 0
console.log("All users still exist:", (await User.query().count()) === 3)

// The beforeDelete hook still ran and collected the IDs
console.log("IDs that would have been deleted:", affectedIds)

await peta.destroy()
