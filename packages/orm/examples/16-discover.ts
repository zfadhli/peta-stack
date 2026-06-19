// Peta ORM — 16-discover
// Auto-discover model definitions from the filesystem using a glob pattern.
//
// `peta.discover(pattern)` scans files matching the glob, dynamically imports
// them, and returns any exported ModelDefinition values. Use registerAll to
// register them with the ORM.

import { createClient } from "@libsql/client"
import { LibsqlDialect } from "@libsql/kysely-libsql"
import { createORM, t } from "../src/index.js"


const client = createClient({ url: ":memory:" })
await client.execute("CREATE TABLE discovered (id INTEGER PRIMARY KEY AUTOINCREMENT, label TEXT NOT NULL)")

const db = createORM({ dialect: new LibsqlDialect({ client }) })

// Discover models from the test fixture directory
// (pattern is relative to cwd; when run from packages/orm/, use ./test/fixtures/*.ts)
const models = await db.discover("./test/fixtures/*.ts")
console.log(`Discovered ${models.length} model(s): ${models.map((m) => m.table).join(", ")}`)

// Register them with the ORM
db.registerAll(...models)

// Now we can use the discovered model
const item = await models[0]!.insert({ label: "auto-discovered" })
console.log("Inserted:", item.get("id"), item.get("label"))

await db.destroy()
