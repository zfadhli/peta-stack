// Peta ORM — 28-nested-create-update
// Create and update models with related data in a single call

import { Database } from "bun:sqlite"
import { BunSqliteDialect } from "kysely-bun-sqlite"
import {
  belongsTo,
  t as columnTypes,
  createArkTypeSchemaConfig,
  createPeta,
  defineModel,
  hasMany,
  manyToMany,
} from "../src/index.js"

const t = columnTypes({ schema: createArkTypeSchemaConfig() })

// Handle circular refs: define models with empty relations, mutate later
const Tag = defineModel("tags", {
  columns: { id: t.integer().primaryKey(), name: t.string(255) },
})

const User = defineModel("users", {
  columns: { id: t.integer().primaryKey(), name: t.string(255), email: t.text().unique() },
  relations: {}, // Will be set after Post
})

const Post = defineModel("posts", {
  columns: { id: t.integer().primaryKey(), userId: t.integer(), title: t.string(255) },
  relations: {
    author: belongsTo(() => User),
    tags: manyToMany(() => Tag, { through: "post_tags", foreignPivotKey: "postId", relatedPivotKey: "tagId" }),
  },
})

// Set the circular relation now
User.relations.posts = hasMany(() => Post, { foreignKey: "userId" })

const database = new Database(":memory:")
database.run("CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE)")
database.run("CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, userId INTEGER NOT NULL, title TEXT NOT NULL)")
database.run("CREATE TABLE tags (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)")
database.run("CREATE TABLE post_tags (postId INTEGER NOT NULL, tagId INTEGER NOT NULL, PRIMARY KEY (postId, tagId))")

const peta = createPeta({ dialect: new BunSqliteDialect({ database }) })
peta.registerAll(User, Post, Tag)

// Pre-create some tags
const tagA = await Tag.insert({ name: "javascript" })
const tagB = await Tag.insert({ name: "typescript" })

// Nested create: create a post with author (connectOrCreate) and tags (connect)
const post = await Post.create({
  title: "My First Post",
  author: {
    connectOrCreate: {
      where: { email: "alice@test.com" },
      create: { name: "Alice", email: "alice@test.com" },
    },
  },
  tags: {
    connect: [tagA.get("id") as number, tagB.get("id") as number],
  },
})

console.log("Created post:", post.get("title"))
console.log("Author ID:", post.get("userId"))

// Verify relations
const author = await post!.$related("author").executeTakeFirst()
console.log("Author name:", author?.get("name"))
const tags = await post!.$related("tags")
console.log("Post tags:", tags.map((t) => t.get("name")))

// Nested update: update post and modify its relations
await Post.update(post.get("id") as number, {
  title: "Updated Title",
  tags: {
    disconnect: [{ id: tagB.get("id") as number }],
    connect: [{ id: tagA.get("id") as number }],
  },
})

const updatedTags = await post!.$related("tags")
console.log("After update, tags:", updatedTags.map((t) => t.get("name")))

await peta.destroy()
