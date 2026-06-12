// Peta ORM — 23-attach-detach-sync
// Many-to-many pivot management via $related()

import { Database } from "bun:sqlite"
import { BunSqliteDialect } from "kysely-bun-sqlite"
import { t as columnTypes, createArkTypeSchemaConfig, createORM, defineModel, manyToMany } from "../src/index.js"

const t = columnTypes({ schema: createArkTypeSchemaConfig() })

const Post = defineModel("posts", {
  columns: { id: t.integer().primaryKey(), title: t.string(255) },
  relations: {},
})

const Tag = defineModel("tags", {
  columns: { id: t.integer().primaryKey(), name: t.string(255) },
  relations: {},
})

// Wire up after all models exist
Post.relations.tags = manyToMany(() => Tag, { through: "post_tags", foreignPivotKey: "postId", relatedPivotKey: "tagId" })

const database = new Database(":memory:")
database.run("CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL)")
database.run("CREATE TABLE tags (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)")
database.run("CREATE TABLE post_tags (postId INTEGER NOT NULL, tagId INTEGER NOT NULL, PRIMARY KEY (postId, tagId))")

const db = createORM({
  dialect: new BunSqliteDialect({ database }),
  models: { Post, Tag },
})

const post = await Post.insert({ title: "My Post" })
const tagA = await Tag.insert({ name: "javascript" })
const tagB = await Tag.insert({ name: "typescript" })
const tagC = await Tag.insert({ name: "rust" })

// Attach — add pivot rows
await post.$related("tags").attach(tagA.get("id") as number)
await post.$related("tags").attach(tagB.get("id") as number)

// Detach — remove specific pivot rows
await post.$related("tags").detach(tagB.get("id") as number)

// Sync — replace all with exact set
await post.$related("tags").sync([tagA.get("id") as number, tagC.get("id") as number])

// Sync without detaching — only add, don't remove
await post.$related("tags").syncWithoutDetaching([tagB.get("id") as number])

// Query current tags
const currentTags = await post.$related("tags")
console.log(
  "Current tags:",
  currentTags.map((t) => t.get("name")),
)

await db.destroy()
