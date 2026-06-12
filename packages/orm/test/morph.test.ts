import { Database } from "bun:sqlite"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test"
import { BunSqliteDialect } from "kysely-bun-sqlite"
import { t as columnTypes, createArkTypeSchemaConfig } from "../src/columns/index.js"
import { createPeta, defineModel, defineMorphMany, defineMorphTo } from "../src/index.js"
import { resolveMorphRelation } from "../src/relations/morph.js"

const _t = columnTypes({ schema: createArkTypeSchemaConfig() })

// ─── Models ────────────────────────────────────────────────────

const Post = defineModel("morph_posts", {
  columns: {
    id: _t.integer().primaryKey(),
    title: _t.string(255),
  },
  relations: {},
})

const Video = defineModel("morph_videos", {
  columns: {
    id: _t.integer().primaryKey(),
    title: _t.string(255),
  },
  relations: {},
})

// A "likeable" polymorphic relation: both Post and Video can be liked
const Like = defineModel("morph_likes", {
  columns: {
    id: _t.integer().primaryKey(),
    likeableType: _t.string(50),
    likeableId: _t.integer(),
    userId: _t.string(255).nullable(),
  },
  relations: {},
})

// A "commentable" polymorphic relation (with MorphTo for the inverse)
const Comment = defineModel("morph_comments", {
  columns: {
    id: _t.integer().primaryKey(),
    body: _t.text(),
    commentableType: _t.string(50),
    commentableId: _t.integer(),
  },
  relations: {},
})

// A model without any morph map entry (for error testing)
const Orphan = defineModel("morph_orphans", {
  columns: {
    id: _t.integer().primaryKey(),
    commentableType: _t.string(50),
    commentableId: _t.integer(),
    label: _t.string(255),
  },
  relations: {},
})

// Wire up relations
Post.relations.likes = defineMorphMany({
  name: "likeable",
  related: () => Like,
  type: "likeableType",
  id: "likeableId",
  typeValue: "morph_posts",
})

Video.relations.likes = defineMorphMany({
  name: "likeable",
  related: () => Like,
  type: "likeableType",
  id: "likeableId",
  typeValue: "morph_videos",
})

Like.relations.likeable = defineMorphTo({
  name: "likeable",
  type: "likeableType",
  id: "likeableId",
  morphMap: {
    morph_posts: () => Post,
    morph_videos: () => Video,
  },
})

Post.relations.comments = defineMorphMany({
  name: "commentable",
  related: () => Comment,
  typeValue: "morph_posts",
})

Video.relations.comments = defineMorphMany({
  name: "commentable",
  related: () => Comment,
  typeValue: "morph_videos",
})

Comment.relations.commentable = defineMorphTo({
  name: "commentable",
  morphMap: {
    morph_posts: () => Post,
    morph_videos: () => Video,
  },
})

// Orphan has a morphTo with NO morphMap (for error testing)
Orphan.relations.commentable = defineMorphTo({
  name: "commentable",
  // No morphMap — will fail on resolve
})

// ─── Setup ─────────────────────────────────────────────────────

let db: Database
let peta: ReturnType<typeof createPeta>

beforeAll(async () => {
  db = new Database(":memory:")
  db.run("PRAGMA journal_mode = WAL")
  db.run("CREATE TABLE morph_posts (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL)")
  db.run("CREATE TABLE morph_videos (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL)")
  db.run(
    "CREATE TABLE morph_likes (id INTEGER PRIMARY KEY AUTOINCREMENT, likeableType TEXT NOT NULL, likeableId INTEGER NOT NULL, userId TEXT)",
  )
  db.run(
    "CREATE TABLE morph_comments (id INTEGER PRIMARY KEY AUTOINCREMENT, body TEXT NOT NULL, commentableType TEXT NOT NULL, commentableId INTEGER NOT NULL)",
  )
  db.run(
    "CREATE TABLE morph_orphans (id INTEGER PRIMARY KEY AUTOINCREMENT, commentableType TEXT, commentableId INTEGER, label TEXT)",
  )

  peta = createPeta({ dialect: new BunSqliteDialect({ database: db }) })
  peta.registerAll(Post, Video, Like, Comment, Orphan)
})

afterAll(async () => {
  await peta.destroy()
  db.close()
})

// Clean all tables between tests for isolation
beforeEach(() => {
  db.run("DELETE FROM morph_likes")
  db.run("DELETE FROM morph_comments")
  db.run("DELETE FROM morph_orphans")
  db.run("DELETE FROM morph_posts")
  db.run("DELETE FROM morph_videos")
})

// ─── Tests ─────────────────────────────────────────────────────

describe("defineMorphTo", () => {
  it("1. creates a MorphTo relation with a morph map", () => {
    const relation = Like.relations.likeable
    expect(relation).toBeDefined()
    expect(relation.type).toBe("belongsTo")
    expect(relation.foreignKey).toBe("likeableId")
    expect((relation as any)._morphMap).toBeDefined()
    expect(Object.keys((relation as any)._morphMap)).toContain("morph_posts")
  })
})

describe("resolveMorphRelation", () => {
  it("2. resolves the correct model for a given parent", async () => {
    const post = await Post.insert({ title: "Resolve Test" })
    const like = await Like.insert({
      likeableType: "morph_posts",
      likeableId: post.get("id") as number,
    })

    const resolved = resolveMorphRelation(Like.relations.likeable, like)
    expect(resolved).toBeDefined()
    expect(resolved!.table).toBe("morph_posts")
  })

  it("3. returns undefined when type column is null", async () => {
    const like = await Like.insert({
      likeableType: "",
      likeableId: 0,
    })
    // Override the type to null
    like.set("likeableType", null)
    like.set("likeableId", null)

    const resolved = resolveMorphRelation(Like.relations.likeable, like)
    expect(resolved).toBeUndefined()
  })
})

describe("MorphTo query", () => {
  it("4. queries the correct related model per type", async () => {
    const post = await Post.insert({ title: "Query Test Post" })
    const video = await Video.insert({ title: "Query Test Video" })

    const likeOnPost = await Like.insert({
      likeableType: "morph_posts",
      likeableId: post.get("id") as number,
    })
    const likeOnVideo = await Like.insert({
      likeableType: "morph_videos",
      likeableId: video.get("id") as number,
    })

    // Query the likeable for the post like
    const qb = Like.relations.likeable.query(likeOnPost)
    const result = await qb.executeTakeFirst()
    expect(result).toBeDefined()
    expect(result!.get("title")).toBe("Query Test Post")

    // Query the likeable for the video like
    const qb2 = Like.relations.likeable.query(likeOnVideo)
    const result2 = await qb2.executeTakeFirst()
    expect(result2).toBeDefined()
    expect(result2!.get("title")).toBe("Query Test Video")
  })
})

describe("MorphTo getResults", () => {
  it("5. returns the correct related record", async () => {
    const post = await Post.insert({ title: "GetResults Post" })
    const like = await Like.insert({
      likeableType: "morph_posts",
      likeableId: post.get("id") as number,
    })

    const result = await Like.relations.likeable.getResults(like)
    expect(result).toBeDefined()
    expect(result!.get("title")).toBe("GetResults Post")
  })
})

describe("MorphTo eager loading", () => {
  it("6. eagerly loads MorphTo (single type)", async () => {
    const post = await Post.insert({ title: "Eager Post" })
    await Like.insert({
      likeableType: "morph_posts",
      likeableId: post.get("id") as number,
      userId: "user1",
    })

    const likes = await Like.query().with("likeable")
    expect(likes.length).toBeGreaterThanOrEqual(1)

    for (const like of likes) {
      const likeable = like.$getRelation("likeable")
      expect(likeable).toBeDefined()
      expect(likeable.get("id")).toBe(like.get("likeableId"))
    }
  })

  it("7. eagerly loads MorphTo (mixed types)", async () => {
    const post = await Post.insert({ title: "Mixed Post" })
    const video = await Video.insert({ title: "Mixed Video" })

    await Like.insert({
      likeableType: "morph_posts",
      likeableId: post.get("id") as number,
    })
    await Like.insert({
      likeableType: "morph_videos",
      likeableId: video.get("id") as number,
    })

    const likes = await Like.query().with("likeable").orderBy("id", "asc")

    expect(likes).toHaveLength(2)

    // First like → Post
    expect(likes[0]!.$getRelation("likeable").get("title")).toBe("Mixed Post")
    // Second like → Video
    expect(likes[1]!.$getRelation("likeable").get("title")).toBe("Mixed Video")
  })
})

describe("MorphTo error handling", () => {
  it("8. throws on missing morph map entry", async () => {
    const like = await Like.insert({
      likeableType: "nonexistent_type",
      likeableId: 1,
    })

    expect(() => Like.relations.likeable.query(like)).toThrow(/No model registered for morph type/)
  })

  it("9. throws on null type column", async () => {
    const like = await Like.insert({
      likeableType: "",
      likeableId: 1,
    })
    like.set("likeableType", null)

    expect(() => Like.relations.likeable.query(like)).toThrow(/"likeableType" is null/)
  })

  it("10. throws on nested eager loading through morphTo", async () => {
    // The with() call itself is synchronous and doesn't throw.
    // The error occurs when the query is executed (thenable / await).
    const qb = Like.query().with("likeable.id")
    await expect(qb.execute()).rejects.toThrow(/Nested eager loading through polymorphic belongsTo is not supported/)
  })
})

describe("MorphMany (forward direction)", () => {
  it("still works — eagerly loads children via MorphMany", async () => {
    const post = await Post.insert({ title: "MorphMany Post" })
    await Like.insert({
      likeableType: "morph_posts",
      likeableId: post.get("id") as number,
    })
    await Like.insert({
      likeableType: "morph_posts",
      likeableId: post.get("id") as number,
    })

    const posts = await Post.query()
      .with("likes")
      .where("id", "=", post.get("id") as number)
    expect(posts).toHaveLength(1)
    const likes = posts[0]!.$getRelation("likes") as any[]
    expect(likes).toHaveLength(2)
  })
})

describe("MorphTo + MorphMany bidirectional", () => {
  it("eager loads both directions", async () => {
    const post = await Post.insert({ title: "Bidirectional Post" })
    const comment = await Comment.insert({
      body: "Bidirectional comment",
      commentableType: "morph_posts",
      commentableId: post.get("id") as number,
    })

    // MorphMany: Post → comments
    const posts = await Post.query()
      .with("comments")
      .where("id", "=", post.get("id") as number)
    expect(posts[0]!.$getRelation("comments")).toHaveLength(1)

    // MorphTo: Comment → commentable
    const comments = await Comment.query()
      .with("commentable")
      .where("id", "=", comment.get("id") as number)
    expect(comments[0]!.$getRelation("commentable").get("title")).toBe("Bidirectional Post")
  })
})
