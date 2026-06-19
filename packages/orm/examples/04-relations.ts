// Peta ORM — 04-relations
// HasMany, BelongsTo, HasOne, eager loading, nested, lazy load

import { createClient } from "@libsql/client"
import { LibsqlDialect } from "@libsql/kysely-libsql"
import {
  belongsTo,
  t,
  createORM,
  defineModel,
  hasMany,
  hasOne,
} from "../src/index.js"


const User = defineModel("users", {
  columns: { id: t.integer().primaryKey(), name: t.string(255) },
  relations: {},
})

const Profile = defineModel("profiles", {
  columns: { id: t.integer().primaryKey(), userId: t.integer(), bio: t.text() },
  relations: {},
})

const Post = defineModel("posts", {
  columns: { id: t.integer().primaryKey(), userId: t.integer(), title: t.string(255) },
  relations: {},
})

// Wire up relations after all models exist (avoids TDZ issues with thunks)
User.relations.posts = hasMany(() => Post, { foreignKey: "userId" })
User.relations.profile = hasOne(() => Profile, { foreignKey: "userId" })
Profile.relations.user = belongsTo(() => User)
Post.relations.author = belongsTo(() => User)

const client = createClient({ url: "file::memory:?cache=shared" })
await client.execute("CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)")
await client.execute("CREATE TABLE profiles (id INTEGER PRIMARY KEY AUTOINCREMENT, userId INTEGER NOT NULL, bio TEXT)")
await client.execute("CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, userId INTEGER NOT NULL, title TEXT NOT NULL)")

const client = createORM({
  dialect: new LibsqlDialect({ client }),
  models: { User, Profile, Post },
})

const alice = await User.insert({ name: "Alice" })
await Profile.insert({ userId: alice.get("id") as number, bio: "Hello!" })
await Post.insert({ userId: alice.get("id") as number, title: "Post 1" })
await Post.insert({ userId: alice.get("id") as number, title: "Post 2" })

// Eager load relations (no .execute() needed)
const users = await User.query().with("posts", "profile")
for (const u of users) {
  console.log(`${u.get("name")}'s posts:`, (u.$getRelation("posts") as any[]).length)
  console.log(`${u.get("name")}'s profile:`, u.$getRelation("profile"))
}

// Lazy load (load relation after the model is fetched)
const users2 = await User.query()
const first = users2[0]!
await first.$load("posts")
console.log("Lazy-loaded posts:", first.$getRelation("posts"))

await db.destroy()
