// Peta ORM — 20-advanced-relations
// HasManyThrough, polymorphic morphs, pivot extras

import { Database } from "bun:sqlite"
import { BunSqliteDialect } from "kysely-bun-sqlite"
import { t as columnTypes, createArkTypeSchemaConfig, createPeta, defineModel, hasManyThrough } from "../src/index.js"

const t = columnTypes({ schema: createArkTypeSchemaConfig() })

// HasManyThrough: User → Profile → Post
const User = defineModel("users", {
  columns: { id: t.integer().primaryKey(), name: t.string(255) },
  relations: {
    posts: hasManyThrough(
      () => Post,
      () => Profile,
    ),
  },
})

const Profile = defineModel("profiles", {
  columns: { id: t.integer().primaryKey(), userId: t.integer(), bio: t.text() },
})

const Post = defineModel("posts", {
  columns: { id: t.integer().primaryKey(), profileId: t.integer(), title: t.string(255) },
})

const database = new Database(":memory:")
database.run("CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)")
database.run("CREATE TABLE profiles (id INTEGER PRIMARY KEY AUTOINCREMENT, userId INTEGER NOT NULL, bio TEXT)")
database.run(
  "CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, profileId INTEGER NOT NULL, title TEXT NOT NULL)",
)

const peta = createPeta({ dialect: new BunSqliteDialect({ database }) })
peta.registerAll(User, Profile, Post)

const user = await User.insert({ name: "Alice" })
const profile = await Profile.insert({ userId: user.get("id") as number, bio: "Hi!" })
await Post.insert({ profileId: profile.get("id") as number, title: "Post 1" })
await Post.insert({ profileId: profile.get("id") as number, title: "Post 2" })

// HasManyThrough should retrieve posts via profile
const users = await User.query().with("posts").execute()
for (const u of users) {
  const posts = u.$getRelation("posts") as any[]
  console.log(`${u.get("name")} has ${posts?.length ?? 0} posts`)
}

await peta.destroy()
