// Peta ORM — 11-many-to-many
// ManyToMany via pivot table, $related(), attach/detach/sync

import { Database } from "bun:sqlite"
import { BunSqliteDialect } from "kysely-bun-sqlite"
import { t as columnTypes, createArkTypeSchemaConfig, createORM, defineModel, manyToMany } from "../src/index.js"

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

const db = createORM({
  dialect: new BunSqliteDialect({ database }),
  models: { Post, Tag },
})

const post = await Post.insert({ title: "My Post" })
const jsTag = await Tag.insert({ name: "js" })
const tsTag = await Tag.insert({ name: "ts" })

// Attach tags via $related() (inserts pivot rows)
await post.$related("tags").attach(jsTag.get("id") as number)
await post.$related("tags").attach(tsTag.get("id") as number)

// Query tags via $related()
const tags = await post.$related("tags")
console.log(
  "Post tags:",
  tags.map((t: any) => t.get("name")),
)

// Detach a tag
await post.$related("tags").detach(jsTag.get("id") as number)
console.log("After detach:", (await post.$related("tags")).length)

// Sync to exact set
await post.$related("tags").sync([jsTag.get("id") as number, tsTag.get("id") as number])
console.log("After sync:", (await post.$related("tags")).length)

await db.destroy()
