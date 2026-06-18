// Peta ORM — 20-advanced-relations
// HasManyThrough, eager loading

import { createClient } from "@libsql/client"
import { LibsqlDialect } from "@libsql/kysely-libsql"
import { t as columnTypes, createArkTypeSchemaConfig, createORM, defineModel, hasManyThrough } from "../src/index.js"

const t = columnTypes({ schema: createArkTypeSchemaConfig() })

const User = defineModel("users", {
  columns: { id: t.integer().primaryKey(), name: t.string(255) },
  relations: {},
})

const Profile = defineModel("profiles", {
  columns: { id: t.integer().primaryKey(), userId: t.integer(), postId: t.integer(), bio: t.text() },
  relations: {},
})

const Post = defineModel("posts", {
  columns: { id: t.integer().primaryKey(), title: t.string(255) },
  relations: {},
})

// Wire up after all models exist (avoids TDZ issues with thunks)
User.relations.posts = hasManyThrough(
  () => Post,
  () => Profile,
  {
    foreignKey: "userId",
    throughForeignKey: "postId",
  },
)

const client = createClient({ url: "file::memory:?cache=shared" })
await client.execute("CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)")
await client.execute(
  "CREATE TABLE profiles (id INTEGER PRIMARY KEY AUTOINCREMENT, userId INTEGER NOT NULL, postId INTEGER NOT NULL, bio TEXT)",
)
await client.execute("CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL)")

const client = createORM({
  dialect: new LibsqlDialect({ client }),
  models: { User, Profile, Post },
})

const user = await User.insert({ name: "Alice" })
const post1 = await Post.insert({ title: "Post 1" })
const post2 = await Post.insert({ title: "Post 2" })
await Profile.insert({ userId: user.get("id") as number, postId: post1.get("id") as number, bio: "Hi!" })
await Profile.insert({ userId: user.get("id") as number, postId: post2.get("id") as number, bio: "Hi again!" })

// Eager load (no .execute() needed)
const users = await User.query().with("posts")
for (const u of users) {
  const posts = u.$getRelation("posts") as any[]
  console.log(`${u.get("name")} has ${posts.length} posts via hasManyThrough`)
  for (const p of posts) {
    console.log(`  - ${p.get("title")}`)
  }
}

await db.destroy()
