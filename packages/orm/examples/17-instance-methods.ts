// Peta ORM — 17-instance-methods
// fill, dirty, reset, $reload, $load, $related

import { createClient } from "@libsql/client"
import { LibsqlDialect } from "@libsql/kysely-libsql"
import { t as columnTypes, createArkTypeSchemaConfig, createORM, defineModel, hasMany } from "../src/index.js"

const t = columnTypes({ schema: createArkTypeSchemaConfig() })

const User = defineModel("users", {
  columns: { id: t.integer().primaryKey(), name: t.string(255), email: t.text() },
  relations: {},
})

const Post = defineModel("posts", {
  columns: { id: t.integer().primaryKey(), userId: t.integer(), title: t.string(255) },
  relations: {},
})

// Wire up after all models exist
User.relations.posts = hasMany(() => Post, { foreignKey: "userId" })

const client = createClient({ url: "file::memory:?cache=shared" })
await client.execute("CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT)")
await client.execute("CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, userId INTEGER NOT NULL, title TEXT NOT NULL)")

const client = createORM({
  dialect: new LibsqlDialect({ client }),
  models: { User, Post },
})

const user = await User.insert({ name: "Alice", email: "alice@example.com" })

// Fill multiple attributes at once
user.fill({ name: "Alice Smith", email: "alice.smith@example.com" })
console.log("Dirty after fill:", user.isDirty, "—", user.dirtyAttributes)

// Save changes
await user.$save()
console.log("Dirty after save:", user.isDirty)

// Reset to original values
user.set("name", "Temporary")
console.log("Before reset:", user.get("name"))
user.reset()
console.log("After reset:", user.get("name"))

// $load — lazy load relations
const _post = await Post.insert({ userId: user.get("id") as number, title: "My Post" })
await user.$load("posts")
console.log("Loaded posts:", (user.$getRelation("posts") as any[])?.length)

// $related() — query builder scoped to a relation
const relatedPosts = await user.$related("posts")
console.log("Related posts:", relatedPosts.length)

// $reload — refresh from database
user.set("name", "Gone")
await user.$reload()
console.log("After reload:", user.get("name")) // back to "Alice Smith"

await db.destroy()
