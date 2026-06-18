// Peta ORM — 31-graph-operations
// insertGraph() / upsertGraph() — full graph operations with #id/#ref
//
// Insert or upsert an entire object graph (model + nested relations of any depth)
// in a single call, with support for shared references via #id/#ref.

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
  manyToMany,
} from "../src/index.js"

const t = columnTypes({ schema: createArkTypeSchemaConfig() })

// ─── Models ────────────────────────────────────────────────────

const User = defineModel("users_30", {
  columns: { id: t.integer().primaryKey(), name: t.string(255) },
  relations: {},
})

const Profile = defineModel("profiles_30", {
  columns: { id: t.integer().primaryKey(), userId: t.integer().nullable(), bio: t.text() },
  relations: {},
})

const Post = defineModel("posts_30", {
  columns: { id: t.integer().primaryKey(), userId: t.integer(), title: t.string(255) },
  relations: {},
})

const Tag = defineModel("tags_30", {
  columns: { id: t.integer().primaryKey(), name: t.string(255) },
  relations: {},
})

// Wire up relations (must be done after all models are defined to avoid circular deps)
User.relations.posts = hasMany(() => Post, { foreignKey: "userId" })
User.relations.profile = hasOne(() => Profile, { foreignKey: "userId" })
Post.relations.author = belongsTo(() => User, { foreignKey: "userId" })
Post.relations.tags = manyToMany(() => Tag, {
  through: "post_tags_30",
  foreignPivotKey: "postId",
  relatedPivotKey: "tagId",
})

// ─── Setup ─────────────────────────────────────────────────────

const client = createClient({ url: "file::memory:?cache=shared" })
await client.execute("CREATE TABLE users_30 (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)")
await client.execute("CREATE TABLE profiles_30 (id INTEGER PRIMARY KEY AUTOINCREMENT, userId INTEGER, bio TEXT)")
await client.execute(
  "CREATE TABLE posts_30 (id INTEGER PRIMARY KEY AUTOINCREMENT, userId INTEGER NOT NULL, title TEXT NOT NULL)",
)
await client.execute("CREATE TABLE tags_30 (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)")
await client.execute("CREATE TABLE post_tags_30 (postId INTEGER NOT NULL, tagId INTEGER NOT NULL)")

const client = createORM({
  dialect: new LibsqlDialect({ client }),
  models: { User, Profile, Post, Tag },
})

// ─── 1. Simple graph insert ───────────────────────────────────

console.log("=== 1. Simple graph insert ===")
const alice = await User.insertGraph({
  name: "Alice",
  posts: [{ title: "Post 1" }, { title: "Post 2" }],
})
console.log(`Created user: ${alice.get("name")} (id=${alice.get("id")})`)

const posts = await Post.query().where("userId", "=", alice.get("id") as number)
for (const p of posts) {
  console.log(`  Post: ${p.get("title")} (id=${p.get("id")})`)
}

// ─── 2. Mixed relations ───────────────────────────────────────

console.log("\n=== 2. Mixed relations ===")
const bob = await User.insertGraph({
  name: "Bob",
  profile: { bio: "Bob's bio" },
  posts: [{ title: "Bob's Post" }],
})
console.log(`Created user: ${bob.get("name")} with profile and post`)

// ─── 3. belongsTo (nested parent) ──────────────────────────────

console.log("\n=== 3. belongsTo (nested parent) ===")
const post = await Post.insertGraph({
  title: "Orphan Post",
  author: { name: "Charlie" },
})
const author = await User.find(post.get("userId") as number)
console.log(`Post "${post.get("title")}" has author "${author?.get("name")}" (userId=${post.get("userId")})`)

// ─── 4. #id / #ref (shared references) ────────────────────────

console.log("\n=== 4. #id / #ref (shared references) ===")
const [p1, p2, sharedPost] = (await User.insertGraph(
  [
    { "#id": "userA", name: "User A", posts: [{ "#ref": "shared" }] },
    { "#id": "userB", name: "User B", posts: [{ "#ref": "shared" }] },
    { "#id": "shared", title: "Shared Post", userId: 1 },
  ],
  { allowRefs: true },
)) as any[]

console.log(`Created ${p1.get("name")} and ${p2.get("name")}`)
console.log(`Shared post "${sharedPost.get("title")}" referenced by both`)

// ─── 5. manyToMany graph ──────────────────────────────────────

console.log("\n=== 5. manyToMany graph ===")
const tagPost = await Post.insertGraph({
  title: "Tagged Post",
  userId: alice.get("id") as number,
  tags: {
    create: [{ name: "graphql" }, { name: "database" }],
  },
})
console.log(`Post with tags: ${tagPost.get("title")}`)
const pivots = database.query("SELECT tagId FROM post_tags_30 WHERE postId = ?").all(tagPost.get("id") as number)
console.log(`  ${pivots.length} tag(s) associated`)

// ─── 6. #dbRef (relate to existing) ────────────────────────────

console.log("\n=== 6. #dbRef (relate to existing) ===")
const existingTag = await Tag.insert({ name: "existing-tag" })
const _dbRefPost = await Post.insertGraph({
  title: "DbRef Post",
  userId: alice.get("id") as number,
  tags: {
    create: [{ "#dbRef": existingTag.get("id") as number }],
  },
})
console.log(`Post related to existing tag "#${existingTag.get("id")}"`)

// ─── 7. upsertGraph — update + insert + delete ────────────────

console.log("\n=== 7. upsertGraph (update + insert + delete) ===")
const upsertUser = await User.insert({ name: "Upsert Me" })
const uid = upsertUser.get("id") as number

// Create some initial posts
await Post.insert({ title: "Keep", userId: uid })
await Post.insert({ title: "Update", userId: uid })
await Post.insert({ title: "Delete", userId: uid })

// Upsert: keep "Keep" (update title), update "Update", delete "Delete", insert "New"
const updated = await User.upsertGraph({
  id: uid,
  name: "Upsert Me Updated",
  posts: [
    {
      id: (await Post.query().where("title", "=", "Keep").where("userId", "=", uid).executeTakeFirst())!.get("id"),
      title: "Keep Updated",
    },
    {
      id: (await Post.query().where("title", "=", "Update").where("userId", "=", uid).executeTakeFirst())!.get("id"),
      title: "Update Updated",
    },
    { title: "New Post" },
  ],
})
console.log(`Upserted user: ${updated.get("name")}`)

const remainingPosts = await Post.query().where("userId", "=", uid).orderBy("title", "asc")
console.log(`Remaining posts (${remainingPosts.length}):`)
for (const p of remainingPosts) {
  console.log(`  - ${p.get("title")}`)
}

// ─── 8. upsertGraph with noDelete ─────────────────────────────

console.log("\n=== 8. upsertGraph with noDelete ===")
const noDelUser = await User.insert({ name: "No Delete" })
const ndu = noDelUser.get("id") as number
await Post.insert({ title: "Protected Post", userId: ndu })
await Post.insert({ title: "Unprotected Post", userId: ndu })

await User.upsertGraph(
  {
    id: ndu,
    name: "No Delete",
    posts: [{ title: "New Post" }],
  },
  { noDelete: ["posts"] },
)

const afterNoDel = await Post.query().where("userId", "=", ndu).orderBy("title", "asc")
console.log(`Posts remaining after noDelete upsert (${afterNoDel.length}):`)
for (const p of afterNoDel) {
  console.log(`  - ${p.get("title")}`)
}

await db.destroy()
