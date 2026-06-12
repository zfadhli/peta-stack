// Peta ORM — 30-polymorphic-relations
// Polymorphic relationships via defineMorphMany and defineMorphOne
// Note: defineMorphTo (inverse) is a stub — runtime type resolution
// is not yet implemented. Use direct foreign key lookups for the inverse side.

import { Database } from "bun:sqlite"
import { BunSqliteDialect } from "kysely-bun-sqlite"
import {
  t as columnTypes,
  createArkTypeSchemaConfig,
  createPeta,
  defineModel,
  defineMorphMany,
  defineMorphOne,
} from "../src/index.js"

const t = columnTypes({ schema: createArkTypeSchemaConfig() })

// A "commentable" polymorphic relation:
// Both Post and Video can have comments.
// The comments table has a `commentableType` (discriminator) and `commentableId` (FK).

const Post = defineModel("posts", {
  columns: { id: t.integer().primaryKey(), title: t.string(255) },
  relations: {
    // MorphMany: a post has many comments
    // "commentable" is the name of the polymorphic relationship
    // The related table has commentableType and commentableId columns
    comments: defineMorphMany({
      name: "commentable",
      related: () => Comment,
      type: "commentableType",
      id: "commentableId",
    }),
  },
})

const Video = defineModel("videos", {
  columns: { id: t.integer().primaryKey(), title: t.string(255) },
  relations: {
    comments: defineMorphMany({
      name: "commentable",
      related: () => Comment,
      type: "commentableType",
      id: "commentableId",
    }),
  },
})

const Comment = defineModel("comments", {
  columns: {
    id: t.integer().primaryKey(),
    body: t.text(),
    commentableType: t.string(50),   // discriminator: "posts" or "videos"
    commentableId: t.integer(),      // FK to the parent
  },
})

const database = new Database(":memory:")
database.run("CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL)")
database.run("CREATE TABLE videos (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL)")
database.run(
  "CREATE TABLE comments (id INTEGER PRIMARY KEY AUTOINCREMENT, body TEXT NOT NULL, commentableType TEXT NOT NULL, commentableId INTEGER NOT NULL)",
)

const peta = createPeta({ dialect: new BunSqliteDialect({ database }) })
peta.registerAll(Post, Video, Comment)

// Create a post and a video
const post = await Post.insert({ title: "My Post" })
const video = await Video.insert({ title: "My Video" })

// Create comments manually (MorphTo inverse is a stub — set FK directly)
await Comment.insert({
  body: "Great post!",
  commentableType: "posts",
  commentableId: post.get("id") as number,
})
await Comment.insert({
  body: "Nice video!",
  commentableType: "videos",
  commentableId: video.get("id") as number,
})

// Eager load comments on the post (defineMorphMany works for eager loading)
const posts = await Post.query().with("comments")
for (const p of posts) {
  const comments = p.$getRelation("comments") as any[]
  console.log(`"${p.get("title")}" has ${comments.length} comments`)
  for (const c of comments) {
    console.log(`  - ${c.get("body")}`)
  }
}

// Same for videos
const videos = await Video.query().with("comments")
for (const v of videos) {
  const comments = v.$getRelation("comments") as any[]
  console.log(`"${v.get("title")}" has ${comments.length} comments`)
  for (const c of comments) {
    console.log(`  - ${c.get("body")}`)
  }
}

await peta.destroy()
