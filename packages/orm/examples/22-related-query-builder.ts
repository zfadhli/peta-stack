// Peta ORM — 22-related-query-builder
// $related() — scoped query builder for relations

import { createClient } from "@libsql/client"
import { LibsqlDialect } from "@libsql/kysely-libsql"
import {
  belongsTo,
  t,
  createORM,
  defineModel,
  hasMany,
} from "../src/index.js"


const User = defineModel("users", {
  columns: { id: t.integer().primaryKey(), name: t.string(255) },
  relations: {},
})

const Post = defineModel("posts", {
  columns: {
    id: t.integer().primaryKey(),
    userId: t.integer(),
    title: t.string(255),
    published: t.integer().default(1),
  },
  relations: { author: belongsTo(() => User) },
})

User.relations.posts = hasMany(() => Post, { foreignKey: "userId" })

const client = createClient({ url: "file::memory:?cache=shared" })
await client.execute("CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)")
await client.execute(
  "CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, userId INTEGER NOT NULL, title TEXT NOT NULL, published INTEGER DEFAULT 1)",
)

const client = createORM({
  dialect: new LibsqlDialect({ client }),
  models: { User, Post },
})

const alice = await User.insert({ name: "Alice" })
await Post.insert({ userId: alice.get("id") as number, title: "Public Post", published: 1 })
await Post.insert({ userId: alice.get("id") as number, title: "Draft Post", published: 0 })
await Post.insert({ userId: alice.get("id") as number, title: "Another Public", published: 1 })

// $related('posts') returns a QueryBuilder scoped to the user's posts
const allPosts = await alice.$related("posts")
console.log("All posts:", allPosts.length)

const publicPosts = await alice.$related("posts").where("published", "=", 1)
console.log("Public posts:", publicPosts.length)
console.log(
  "Titles:",
  publicPosts.map((p) => p.get("title")),
)

const recent = await alice.$related("posts").orderBy("id", "desc").limit(1)
console.log("Most recent:", recent[0]?.get("title"))

// Inverse: belongsTo via $related
const post = await Post.find(1)
const author = await post!.$related("author").executeTakeFirst()
console.log("Post author:", author?.get("name"))

await db.destroy()
