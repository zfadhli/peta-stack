// Peta ORM — 29-allow-graph
// allowGraph() — whitelist eager loading relations for security
//
// NEW: Recursive validation — nested relations are validated against
// the full dotted path, not just the base name.

import { createClient } from "@libsql/client"
import { LibsqlDialect } from "@libsql/kysely-libsql"
import {
  belongsTo,
  t as columnTypes,
  createArkTypeSchemaConfig,
  createORM,
  defineModel,
  hasMany,
  hasOne,
} from "../src/index.js"

const t = columnTypes({ schema: createArkTypeSchemaConfig() })

const User = defineModel("users", {
  columns: { id: t.integer().primaryKey(), name: t.string(255) },
  relations: {},
})

const Profile = defineModel("profiles", {
  columns: { id: t.integer().primaryKey(), userId: t.integer(), bio: t.text() },
  relations: { user: belongsTo(() => User) },
})

const Post = defineModel("posts", {
  columns: { id: t.integer().primaryKey(), userId: t.integer(), title: t.string(255) },
  relations: { author: belongsTo(() => User) },
})

const Comment = defineModel("comments", {
  columns: { id: t.integer().primaryKey(), postId: t.integer(), body: t.text() },
  relations: { post: belongsTo(() => Post) },
})

User.relations.posts = hasMany(() => Post, { foreignKey: "userId" })
User.relations.profile = hasOne(() => Profile, { foreignKey: "userId" })
User.relations.comments = hasMany(() => Comment, { foreignKey: "postId" })
Post.relations.comments = hasMany(() => Comment, { foreignKey: "postId" })

const client = createClient({ url: "file::memory:?cache=shared" })
await client.execute("CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)")
await client.execute("CREATE TABLE profiles (id INTEGER PRIMARY KEY AUTOINCREMENT, userId INTEGER NOT NULL, bio TEXT)")
await client.execute("CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, userId INTEGER NOT NULL, title TEXT NOT NULL)")
await client.execute("CREATE TABLE comments (id INTEGER PRIMARY KEY AUTOINCREMENT, postId INTEGER NOT NULL, body TEXT)")

const client = createORM({
  dialect: new LibsqlDialect({ client }),
  models: { User, Profile, Post, Comment },
})

const alice = await User.insert({ name: "Alice" })
await Profile.insert({ userId: alice.get("id") as number, bio: "Alice's bio" })
const post1 = await Post.insert({ userId: alice.get("id") as number, title: "Post 1" })
await Comment.insert({ postId: post1.get("id") as number, body: "Nice post!" })

// ─── Basic usage — single base relation ──────────────────────
// allowGraph() whitelists which relations can be eagerly loaded
const users = await User.query().allowGraph("posts").with("posts")
console.log("Users with posts:", users.length)

// ─── Blocked: non-whitelisted relation ───────────────────────
// This throws because "profile" is not in the allow list:
try {
  await User.query().allowGraph("posts").with("profile")
} catch (e) {
  console.log("Blocked by allowGraph:", (e as Error).message)
}

// ─── Nested routes via prefix matching ───────────────────────
// "posts" is in allowGraph → allows "posts.author" (prefix match)
const withAuthor = await User.query().allowGraph("posts").with("posts.author")
console.log("Users with posts + author:", withAuthor.length)

// ─── NEW: Dotted-path allowlist (recursive validation) ──────
// allowGraph("posts.author") allows "posts.author" and deeper,
// but NOT bare "posts" or "posts.comments".

// Allowed: "posts.author" matches the whitelisted path
const specific = await User.query().allowGraph("posts.author").with("posts.author")
console.log("Specific nested load:", specific.length)

// Blocked: bare "posts" is NOT whitelisted (only "posts.author" is)
try {
  await User.query().allowGraph("posts.author").with("posts")
} catch (e) {
  console.log("Bare 'posts' blocked by dotted-path allowGraph:", (e as Error).message)
}

// Blocked: sibling nested path "posts.comments" is NOT a prefix of "posts.author"
try {
  await User.query().allowGraph("posts.author").with("posts.comments")
} catch (e) {
  console.log("Sibling 'posts.comments' blocked:", (e as Error).message)
}

// ─── NEW: Multiple arguments ─────────────────────────────────
// allowGraph("posts", "profile") allows both relations
const multi = await User.query().allowGraph("posts", "profile").with("posts", "profile")
console.log("Multiple allowGraph relations:", multi.length)

// ─── Object-style with constraints ──────────────────────────
const constrained = await User.query()
  .allowGraph("posts")
  .with({ posts: (qb) => qb.orderBy("id", "asc") })
console.log("Constrained eager loading:", constrained.length)

await db.destroy()
