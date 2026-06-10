// Peta ORM — 17-instance-methods
// fill, dirty, reset, $reload, $load, $relatedQuery

import { Database } from "bun:sqlite"
import { BunSqliteDialect } from "kysely-bun-sqlite"
import { t as columnTypes, createArkTypeSchemaConfig, createPeta, defineModel, hasMany } from "../src/index.js"

const t = columnTypes({ schema: createArkTypeSchemaConfig() })

const User = defineModel("users", {
  columns: { id: t.integer().primaryKey(), name: t.string(255), email: t.text() },
  relations: { posts: hasMany(() => Post) },
})

const Post = defineModel("posts", {
  columns: { id: t.integer().primaryKey(), userId: t.integer(), title: t.string(255) },
})

const database = new Database(":memory:")
database.run("CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT)")
database.run("CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, userId INTEGER NOT NULL, title TEXT NOT NULL)")

const peta = createPeta({ dialect: new BunSqliteDialect({ database }) })
peta.registerAll(User, Post)

const user = await User.insert({ name: "Alice", email: "alice@example.com" })

// Fill multiple attributes
user.fill({ name: "Alice Smith", email: "alice.smith@example.com" })
console.log("Dirty after fill:", user.isDirty, "—", user.dirtyAttributes)

// Save changes
await user.$save()
console.log("Dirty after save:", user.isDirty)

// Reset to original
user.set("name", "Temporary")
console.log("Before reset:", user.get("name"))
user.reset()
console.log("After reset:", user.get("name"))

// $load — lazy load relations
const _post = await Post.insert({ userId: user.get("id") as number, title: "My Post" })
await user.$load("posts")
console.log("Loaded posts:", (user.$getRelation("posts") as any[])?.length)

// $reload — refresh from database
user.set("name", "Gone")
await user.$reload()
console.log("After reload:", user.get("name")) // back to "Alice Smith"

await peta.destroy()
