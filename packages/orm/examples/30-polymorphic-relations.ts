// Peta ORM — 30-polymorphic-relations
// Polymorphic relationships with MorphTo runtime resolution
//
// Both Post and Video can have comments via a polymorphic relation.
// Comment.commentable resolves to the correct parent (Post or Video)
// at runtime based on the commentableType column.

import { Database } from "bun:sqlite"
import { BunSqliteDialect } from "kysely-bun-sqlite"
import {
  t as columnTypes,
  createArkTypeSchemaConfig,
  createORM,
  defineModel,
  defineMorphMany,
  defineMorphTo,
} from "../src/index.js"

const t = columnTypes({ schema: createArkTypeSchemaConfig() })

// ─── Models ────────────────────────────────────────────────────

const Post = defineModel("posts_morph", {
  columns: { id: t.integer().primaryKey(), title: t.string(255) },
  relations: {},
})

const Video = defineModel("videos_morph", {
  columns: { id: t.integer().primaryKey(), title: t.string(255) },
  relations: {},
})

// Comment model with polymorphic columns
const Comment = defineModel("comments_morph", {
  columns: {
    id: t.integer().primaryKey(),
    body: t.text(),
    commentableType: t.string(50),
    commentableId: t.integer(),
  },
  relations: {},
})

// Wire up polymorphic relations (after all models exist)
Post.relations.comments = defineMorphMany({
  name: "commentable",
  related: () => Comment,
  type: "commentableType",
  id: "commentableId",
  typeValue: "posts_morph", // explicit: the value stored in commentableType for posts
})

Video.relations.comments = defineMorphMany({
  name: "commentable",
  related: () => Comment,
  type: "commentableType",
  id: "commentableId",
  typeValue: "videos_morph",
})

// MorphTo: the inverse — resolves commentable to Post or Video at runtime
Comment.relations.commentable = defineMorphTo({
  name: "commentable",
  type: "commentableType",
  id: "commentableId",
  morphMap: {
    posts_morph: () => Post,
    videos_morph: () => Video,
  },
})

// ─── Setup ─────────────────────────────────────────────────────

const database = new Database(":memory:")
database.run("CREATE TABLE posts_morph (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL)")
database.run("CREATE TABLE videos_morph (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL)")
database.run(
  "CREATE TABLE comments_morph (id INTEGER PRIMARY KEY AUTOINCREMENT, body TEXT NOT NULL, commentableType TEXT NOT NULL, commentableId INTEGER NOT NULL)",
)

const db = createORM({
  dialect: new BunSqliteDialect({ database }),
  models: { Post, Video, Comment },
})

// ─── Demo ──────────────────────────────────────────────────────

// Create a post and a video
const post = await Post.insert({ title: "My Post" })
const video = await Video.insert({ title: "My Video" })

// Create comments for both (note: commentableType stores the parent table name)
await Comment.insert({
  body: "Great post!",
  commentableType: "posts_morph",
  commentableId: post.get("id") as number,
})
await Comment.insert({
  body: "Nice video!",
  commentableType: "videos_morph",
  commentableId: video.get("id") as number,
})

// ─── MorphMany: Post → comments ───────────────────────────────
console.log("=== MorphMany: Post → comments ===")
const posts = await Post.query().with("comments")
for (const p of posts) {
  const comments = p.$getRelation("comments") as any[]
  console.log(`"${p.get("title")}" has ${comments.length} comments`)
  for (const c of comments) console.log(`  - ${c.get("body")}`)
}

// ─── MorphMany: Video → comments ──────────────────────────────
console.log("\n=== MorphMany: Video → comments ===")
const videos = await Video.query().with("comments")
for (const v of videos) {
  const comments = v.$getRelation("comments") as any[]
  console.log(`"${v.get("title")}" has ${comments.length} comments`)
  for (const c of comments) console.log(`  - ${c.get("body")}`)
}

// ─── MorphTo: Comment → commentable (Post or Video) ───────────
console.log("\n=== MorphTo: Comment → commentable ===")
const comments = await Comment.query().with("commentable").orderBy("id", "asc")
for (const c of comments) {
  const commentable = c.$getRelation("commentable")
  const type = c.get("commentableType")
  console.log(
    `Comment "${c.get("body")}" belongs to ${type} "${commentable.get("title")}" (id=${commentable.get("id")})`,
  )
}

// ─── Query a single MorphTo relation ──────────────────────────
console.log("\n=== Single MorphTo lookup ===")
const singleComment = await Comment.find(1)
if (singleComment) {
  const commentable = await Comment.relations.commentable.getResults(singleComment)
  console.log(
    `Comment "${singleComment.get("body")}" → ${commentable?.get("title")}`,
  )
}

await db.destroy()
