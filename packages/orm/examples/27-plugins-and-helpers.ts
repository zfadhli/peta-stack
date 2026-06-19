// Peta ORM — 27-plugins-and-helpers
// .use() plugin system + makeHelper()

import { createClient } from "@libsql/client"
import { LibsqlDialect } from "@libsql/kysely-libsql"
import { t, createORM, defineModel, timestamps } from "../src/index.js"
import type { Plugin } from "../src/plugins/index.js"


// Built-in plugin: timestamps()
const User = defineModel("users", {
  columns: {
    id: t.integer().primaryKey(),
    name: t.string(255),
    slug: t.string(255),
    createdAt: t.timestamp(),
    updatedAt: t.timestamp(),
  },
}).use(timestamps())

// Custom plugin: slugify from title
const slugify: Plugin = (def) => {
  def.on("beforeCreate", (model: any) => {
    const title = model.get("title") as string
    if (title && !model.get("slug")) {
      model.set("slug", title.toLowerCase().replace(/\s+/g, "-"))
    }
  })
}

const Post = defineModel("posts", {
  columns: { id: t.integer().primaryKey(), title: t.string(255), slug: t.string(255) },
}).use(slugify)

// makeHelper() — reusable query modification functions
const searchByName = User.makeHelper((qb: any, query: string) => {
  return qb.where("name", "like", `%${query}%`)
})

const client = createClient({ url: "file::memory:?cache=shared" })
await client.execute(
  "CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, slug TEXT, createdAt TEXT, updatedAt TEXT)",
)
await client.execute("CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, slug TEXT)")

const client = createORM({
  dialect: new LibsqlDialect({ client }),
  models: { User, Post },
})

const user = await User.insert({ name: "Alice" })
console.log("Created at:", user.get("createdAt"))

const post = await Post.insert({ title: "Hello World" })
console.log("Post slug:", post.get("slug"))

const results = await searchByName("Ali")
console.log("Found users:", results.length)

await db.destroy()
