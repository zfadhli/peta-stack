// Peta ORM — 21-migrations
// MigrationRunner, MigrationGenerator

import { Kysely } from "kysely"
import { createClient } from "@libsql/client"
import { LibsqlDialect } from "@libsql/kysely-libsql"
import { t as columnTypes, createArkTypeSchemaConfig, defineModel } from "../src/index.js"
import { createMigrationGenerator, createMigrationRunner } from "../src/migrations/index.js"

const t = columnTypes({ schema: createArkTypeSchemaConfig() })

const User = defineModel("users", {
  columns: { id: t.integer().primaryKey(), name: t.string(255), email: t.text().unique() },
})

const Post = defineModel("posts", {
  columns: { id: t.integer().primaryKey(), userId: t.integer(), title: t.string(255) },
})

// Migration Runner
const client = createClient({ url: "file::memory:?cache=shared" })
const kysely = new Kysely<Record<string, never>>({
  dialect: new LibsqlDialect({ client }),
})

const runner = createMigrationRunner(kysely)
await runner.ensureTable()

const migration = {
  name: "001_create_users",
  up: async (k: Kysely<unknown>) => {
    await k.schema
      .createTable("users")
      .addColumn("id", "integer", (c) => c.autoIncrement().primaryKey())
      .addColumn("name", "varchar(255)", (c) => c.notNull())
      .execute()
  },
  down: async (k: Kysely<unknown>) => {
    await k.schema.dropTable("users").execute()
  },
}

await runner.up([migration])
console.log("Completed:", (await runner.getCompleted()).length)

const status = await runner.status([migration])
console.log("Pending:", status.pending.length)

await runner.down([migration])
console.log("After rollback, completed:", (await runner.getCompleted()).length)

// Migration Generator
const models = new Map<string, any>()
models.set("users", { table: "users", columns: User.columns, relations: User.relations, name: "User" })
models.set("posts", { table: "posts", columns: Post.columns, relations: Post.relations, name: "Post" })

const gen = createMigrationGenerator()
const code = gen.generateInitialMigration(models as any)
console.log("Generated migration:")
console.log(code)

await kysely.destroy()
client.close()
