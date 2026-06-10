// Peta ORM — 20-advanced-relations
// HasManyThrough, polymorphic morphs, pivot extras

import { Database } from "bun:sqlite"
import { BunSqliteDialect } from "kysely-bun-sqlite"
import { t as columnTypes, createArkTypeSchemaConfig, createPeta, defineModel, hasManyThrough } from "../src/index.js"

const t = columnTypes({ schema: createArkTypeSchemaConfig() })

// HasManyThrough: User → Profile → Post
// The through table (profiles) carries the FK to the related table (posts).
const User = defineModel("users", {
  columns: { id: t.integer().primaryKey(), name: t.string(255) },
  relations: {
    posts: hasManyThrough(
      () => Post,
      () => Profile,
      { foreignKey: "userId", throughForeignKey: "postId" },
    ),
  },
})

const Profile = defineModel("profiles", {
  columns: { id: t.integer().primaryKey(), userId: t.integer(), postId: t.integer(), bio: t.text() },
})

const Post = defineModel("posts", {
  columns: { id: t.integer().primaryKey(), title: t.string(255) },
})

const database = new Database(":memory:")
database.run("CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)")
database.run(
  "CREATE TABLE profiles (id INTEGER PRIMARY KEY AUTOINCREMENT, userId INTEGER NOT NULL, postId INTEGER NOT NULL, bio TEXT)",
)
database.run("CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL)")

const peta = createPeta({ dialect: new BunSqliteDialect({ database }) })
peta.registerAll(User, Profile, Post)

const user = await User.insert({ name: "Alice" })
const post1 = await Post.insert({ title: "Post 1" })
const post2 = await Post.insert({ title: "Post 2" })
await Profile.insert({ userId: user.get("id") as number, postId: post1.get("id") as number, bio: "Hi!" })
await Profile.insert({ userId: user.get("id") as number, postId: post2.get("id") as number, bio: "Hi again!" })

// Eager load via with()
const users = await User.query().with("posts").execute()
for (const u of users) {
  const userPosts = u.$getRelation("posts") as any[]
  console.log(`${u.get("name")} has ${userPosts.length} posts via hasManyThrough`)
  for (const p of userPosts) {
    console.log(`  - ${p.get("title")}`)
  }
}

await peta.destroy()
