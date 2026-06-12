// Peta ORM — 30-polymorphic-relations
// Polymorphic relationships via defineMorphMany / defineMorphOne
// Note: defineMorphTo (inverse) is a stub — use direct FK lookups

import { Database } from "bun:sqlite"
import { BunSqliteDialect } from "kysely-bun-sqlite"
import {
  t as columnTypes,
  createArkTypeSchemaConfig,
  createORM,
  defineModel,
  defineMorphMany,
} from "../src/index.js"

const t = columnTypes({ schema: createArkTypeSchemaConfig() })

// Both Post and Video can have comments via a polymorphic relation
const Post = defineModel("posts", {
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
    commentableType: t.string(50),
    commentableId: t.integer(),
  },
})

const database = new Database(":memory:")
database.run("CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL)")
database.run("CREATE TABLE videos (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL)")
database.run("CREATE TABLE comments (id INTEGER PRIMARY KEY AUTOINCREMENT, body TEXT NOT NULL, commentableType TEXT NOT NULL, commentableId INTEGER NOT NULL)")

const db = createORM({
  dialect: new BunSqliteDialect({ database }),
  models: { Post, Video, Comment },
})

const post = await Post.insert({ title: "My Post" })
const video = await Video.insert({ title: "My Video" })

// Create comments manually (MorphTo inverse is a stub)
await Comment.insert({ body: "Great post!", commentableType: "posts", commentableId: post.get("id") as number })
await Comment.insert({ body: "Nice video!", commentableType: "videos", commentableId: video.get("id") as number })

// Eager load comments on the post
const posts = await Post.query().with("comments")
for (const p of posts) {
  const comments = p.$getRelation("comments") as any[]
  console.log(`"${p.get("title")}" has ${comments.length} comments`)
  for (const c of comments) console.log(`  - ${c.get("body")}`)
}

// Same for videos
const videos = await Video.query().with("comments")
for (const v of videos) {
  const comments = v.$getRelation("comments") as any[]
  console.log(`"${v.get("title")}" has ${comments.length} comments`)
  for (const c of comments) console.log(`  - ${c.get("body")}`)
}

await db.destroy()
