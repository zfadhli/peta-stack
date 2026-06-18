// Peta ORM — 28-nested-create-update
// Create and update models with related data in a single call

import { createClient } from "@libsql/client"
import { LibsqlDialect } from "@libsql/kysely-libsql"
import {
  belongsTo,
  t as columnTypes,
  createArkTypeSchemaConfig,
  createORM,
  defineModel,
  hasMany,
  manyToMany,
} from "../src/index.js"

const t = columnTypes({ schema: createArkTypeSchemaConfig() })

const Tag = defineModel("tags", { columns: { id: t.integer().primaryKey(), name: t.string(255) } })

const User = defineModel("users", {
  columns: { id: t.integer().primaryKey(), name: t.string(255), email: t.text().unique() },
  relations: {},
})

const Post = defineModel("posts", {
  columns: { id: t.integer().primaryKey(), userId: t.integer(), title: t.string(255) },
  relations: {
    author: belongsTo(() => User),
    tags: manyToMany(() => Tag, { through: "post_tags", foreignPivotKey: "postId", relatedPivotKey: "tagId" }),
  },
})

User.relations.posts = hasMany(() => Post, { foreignKey: "userId" })

const client = createClient({ url: "file::memory:?cache=shared" })
await client.execute(
  "CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE)",
)
await client.execute("CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, userId INTEGER NOT NULL, title TEXT NOT NULL)")
await client.execute("CREATE TABLE tags (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)")
await client.execute("CREATE TABLE post_tags (postId INTEGER NOT NULL, tagId INTEGER NOT NULL, PRIMARY KEY (postId, tagId))")

const client = createORM({
  dialect: new LibsqlDialect({ client }),
  models: { User, Post, Tag },
})

const tagA = await Tag.insert({ name: "javascript" })
const tagB = await Tag.insert({ name: "typescript" })

// Nested create with connectOrCreate + connect
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

const author = await post!.$related("author").executeTakeFirst()
console.log("Author name:", author?.get("name"))
const tags = await post!.$related("tags")
console.log(
  "Post tags:",
  tags.map((t) => t.get("name")),
)

// Nested update: modify tags
await Post.update(post.get("id") as number, {
  title: "Updated Title",
  tags: {
    disconnect: [{ id: tagB.get("id") as number }],
    connect: [{ id: tagA.get("id") as number }],
  },
})

const updatedTags = await post!.$related("tags")
console.log(
  "After update, tags:",
  updatedTags.map((t) => t.get("name")),
)

await db.destroy()
