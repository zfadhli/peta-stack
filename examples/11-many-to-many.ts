// Peta ORM — 11-many-to-many
// ManyToMany via pivot table

import { Database } from "bun:sqlite"
import { BunSqliteDialect } from "kysely-bun-sqlite"
import { t as columnTypes, createArkTypeSchemaConfig, createPeta, defineModel, manyToMany } from "../src/index.js"

const t = columnTypes({ schema: createArkTypeSchemaConfig() })

const Post = defineModel("posts", {
  columns: { id: t.integer().primaryKey(), title: t.string(255) },
  relations: {
    tags: manyToMany(() => Tag, { through: "post_tags", foreignPivotKey: "postId", relatedPivotKey: "tagId" }),
  },
})

const Tag = defineModel("tags", {
  columns: { id: t.integer().primaryKey(), name: t.string(255) },
  relations: {
    posts: manyToMany(() => Post, { through: "post_tags", foreignPivotKey: "tagId", relatedPivotKey: "postId" }),
  },
})

const database = new Database(":memory:")
database.run("CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL)")
database.run("CREATE TABLE tags (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)")
database.run("CREATE TABLE post_tags (postId INTEGER NOT NULL, tagId INTEGER NOT NULL, PRIMARY KEY (postId, tagId))")

const peta = createPeta({ dialect: new BunSqliteDialect({ database }) })
peta.registerAll(Post, Tag)

const post = await Post.insert({ title: "My Post" })
const jsTag = await Tag.insert({ name: "js" })
const tsTag = await Tag.insert({ name: "ts" })

// Manually insert pivot rows
const db = database
db.prepare("INSERT INTO post_tags (postId, tagId) VALUES (?, ?)").run(post.get("id"), jsTag.get("id"))
db.prepare("INSERT INTO post_tags (postId, tagId) VALUES (?, ?)").run(post.get("id"), tsTag.get("id"))

// Query relation via the relation descriptor
const posts = await Post.query().execute()
for (const p of posts) {
  const tags = await Post.relations.tags.query(p).execute()
  console.log(`"${p.get("title")}" tags:`, tags.map((t) => t.get("name")))
}

await peta.destroy()
