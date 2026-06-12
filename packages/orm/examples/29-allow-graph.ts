// Peta ORM — 29-allow-graph
// allowGraph() — whitelist eager loading relations for security

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

// Handle circular refs: define User first with empty relations, mutate later
const User = defineModel("users", {
  columns: { id: t.integer().primaryKey(), name: t.string(255) },
  relations: {}, // Will be set after Profile and Post
})

const Profile = defineModel("profiles", {
  columns: { id: t.integer().primaryKey(), userId: t.integer(), bio: t.text() },
  relations: { user: belongsTo(() => User) },
})

const Post = defineModel("posts", {
  columns: { id: t.integer().primaryKey(), userId: t.integer(), title: t.string(255) },
  relations: { author: belongsTo(() => User) },
})

// Set the circular relations now
User.relations.posts = hasMany(() => Post, { foreignKey: "userId" })
User.relations.profile = hasOne(() => Profile, { foreignKey: "userId" })

const database = new Database(":memory:")
database.run("CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)")
database.run("CREATE TABLE profiles (id INTEGER PRIMARY KEY AUTOINCREMENT, userId INTEGER NOT NULL, bio TEXT)")
database.run("CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, userId INTEGER NOT NULL, title TEXT NOT NULL)")

const peta = createPeta({ dialect: new BunSqliteDialect({ database }) })
peta.registerAll(User, Profile, Post)

const alice = await User.insert({ name: "Alice" })
await Profile.insert({ userId: alice.get("id") as number, bio: "Alice's bio" })
await Post.insert({ userId: alice.get("id") as number, title: "Post 1" })

// allowGraph() whitelists which relations can be eagerly loaded
// Important when the relation expression comes from user input

const users = await User.query()
  .allowGraph("posts")
  .with("posts") // OK — "posts" is whitelisted
console.log("Users with posts:", users.length)

// This would throw because "profile" is not in the allow list:
try {
  await User.query()
    .allowGraph("posts")
    .with("profile") // ERROR — not whitelisted
} catch (e) {
  console.log("Blocked by allowGraph:", (e as Error).message)
}

// allowGraph also works for nested routes
const withAuthor = await User.query()
  .allowGraph("posts")
  .with("posts.author") // OK — base relation "posts" is whitelisted
console.log("Users with posts + author:", withAuthor.length)

await peta.destroy()
