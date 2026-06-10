// Peta ORM — 04-relations
// HasMany, BelongsTo, HasOne, eager loading, nested, lazy load

import { Database } from "bun:sqlite"
import { BunSqliteDialect } from "kysely-bun-sqlite"
import {
  belongsTo,
  t as columnTypes,
  createArkTypeSchemaConfig,
  createPeta,
  defineModel,
  hasMany,
  hasOne,
} from "../src/index.js"

const t = columnTypes({ schema: createArkTypeSchemaConfig() })

const User = defineModel("users", {
  columns: { id: t.integer().primaryKey(), name: t.string(255) },
  relations: {
    posts: hasMany(() => Post, { foreignKey: "userId" }),
    profile: hasOne(() => Profile, { foreignKey: "userId" }),
  },
})

const Profile = defineModel("profiles", {
  columns: { id: t.integer().primaryKey(), userId: t.integer(), bio: t.text() },
  relations: { user: belongsTo(() => User) },
})

const Post = defineModel("posts", {
  columns: { id: t.integer().primaryKey(), userId: t.integer(), title: t.string(255) },
  relations: { author: belongsTo(() => User) },
})

const database = new Database(":memory:")
database.run("CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)")
database.run("CREATE TABLE profiles (id INTEGER PRIMARY KEY AUTOINCREMENT, userId INTEGER NOT NULL, bio TEXT)")
database.run("CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, userId INTEGER NOT NULL, title TEXT NOT NULL)")

const peta = createPeta({ dialect: new BunSqliteDialect({ database }) })
peta.registerAll(User, Profile, Post)

const alice = await User.insert({ name: "Alice" })
await Profile.insert({ userId: alice.get("id") as number, bio: "Hello!" })
await Post.insert({ userId: alice.get("id") as number, title: "Post 1" })
await Post.insert({ userId: alice.get("id") as number, title: "Post 2" })

// Eager load relations
const users = await User.query().with("posts", "profile").collect()
console.log(users.toJSON())
for (const u of users) {
  console.log(`${u.get("name")}'s posts:`, (u.$getRelation("posts") as any[]).length)
  console.log(`${u.get("name")}'s profile:`, u.$getRelation("profile"))
}

// Lazy load
const users2 = await User.query().execute()
const first = users2[0]!
await first.$load("posts")
console.log("Lazy-loaded posts:", first.$getRelation("posts"))

await peta.destroy()
