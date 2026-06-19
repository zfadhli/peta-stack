import { afterAll, beforeAll, describe, expect, it } from "bun:test"
import { createClient } from "@libsql/client"
import { LibsqlDialect } from "@libsql/kysely-libsql"
import { t as columnTypes, createArkTypeSchemaConfig } from "../src/columns/index.js"
import {
  belongsTo,
  createPeta,
  defineModel,
  hasMany,
  hasOne,
  manyToMany,
  RelationNotAllowedError,
} from "../src/index.js"

const t = columnTypes({ schema: createArkTypeSchemaConfig() })

// ─── Models ────────────────────────────────────────────────────

const User = defineModel("graph_users", {
  columns: {
    id: t.integer().primaryKey(),
    name: t.string(255),
  },
  relations: {},
})

const Profile = defineModel("graph_profiles", {
  columns: {
    id: t.integer().primaryKey(),
    userId: t.integer().nullable(),
    bio: t.text(),
  },
  relations: { user: belongsTo(() => User) },
})

const Post = defineModel("graph_posts", {
  columns: {
    id: t.integer().primaryKey(),
    userId: t.integer(),
    title: t.string(255),
  },
  relations: { author: belongsTo(() => User) },
})

const Comment = defineModel("graph_comments", {
  columns: {
    id: t.integer().primaryKey(),
    postId: t.integer(),
    body: t.text(),
  },
  relations: { post: belongsTo(() => Post) },
})

const Tag = defineModel("graph_tags", {
  columns: {
    id: t.integer().primaryKey(),
    name: t.string(255),
  },
  relations: {},
})

// Wire up the remaining relations after all definitions exist
User.relations.posts = hasMany(() => Post, { foreignKey: "userId" })
User.relations.profile = hasOne(() => Profile, { foreignKey: "userId" })
User.relations.comments = hasMany(() => Comment, { foreignKey: "postId" })
Post.relations.author = belongsTo(() => User, { foreignKey: "userId" })
Post.relations.comments = hasMany(() => Comment, { foreignKey: "postId" })
Post.relations.tags = manyToMany(() => Tag, {
  through: "graph_post_tags",
  foreignPivotKey: "postId",
  relatedPivotKey: "tagId",
})
Comment.relations.post = belongsTo(() => Post, { foreignKey: "postId" })
Profile.relations.user = belongsTo(() => User, { foreignKey: "userId" })

// ─── Setup ─────────────────────────────────────────────────────

let db: ReturnType<typeof createClient>
let peta: ReturnType<typeof createPeta>

beforeAll(async () => {
  db = createClient({ url: ":memory:" })
  await db.execute("PRAGMA journal_mode = WAL")
  await db.execute("CREATE TABLE graph_users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)")
  await db.execute("CREATE TABLE graph_profiles (id INTEGER PRIMARY KEY AUTOINCREMENT, userId INTEGER, bio TEXT)")
  await db.execute(
    "CREATE TABLE graph_posts (id INTEGER PRIMARY KEY AUTOINCREMENT, userId INTEGER NOT NULL, title TEXT NOT NULL)",
  )
  await db.execute(
    "CREATE TABLE graph_comments (id INTEGER PRIMARY KEY AUTOINCREMENT, postId INTEGER NOT NULL, body TEXT NOT NULL)",
  )
  await db.execute("CREATE TABLE graph_tags (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)")
  await db.execute("CREATE TABLE graph_post_tags (postId INTEGER NOT NULL, tagId INTEGER NOT NULL)")

  peta = createPeta({ dialect: new LibsqlDialect({ client: db }) })
  peta.registerAll(User, Profile, Post, Comment, Tag)
})

afterAll(async () => {
  await peta.destroy()
  db.close()
})

// ─── Tests: insertGraph ───────────────────────────────────────

describe("insertGraph", () => {
  it("1. inserts a root node with hasMany children", async () => {
    const user = await User.insertGraph({
      name: "Alice",
      posts: [{ title: "Post 1" }, { title: "Post 2" }],
    })

    expect(user.get("name")).toBe("Alice")
    expect(user.get("id")).toBeGreaterThan(0)

    // Children should be in DB with FK set
    const posts = await Post.query().where("userId", "=", user.get("id") as number)
    expect(posts).toHaveLength(2)
    expect(posts.map((p: any) => p.get("title")).sort()).toEqual(["Post 1", "Post 2"])
  })

  it("2. inserts a root node with belongsTo (creates parent first)", async () => {
    const post = await Post.insertGraph({
      title: "Belongs To Post",
      author: { name: "Author Bob" },
    })

    expect(post.get("title")).toBe("Belongs To Post")
    const authorId = post.get("userId") as number
    expect(authorId).toBeGreaterThan(0)

    const author = await User.find(authorId)
    expect(author).toBeDefined()
    expect(author!.get("name")).toBe("Author Bob")
  })

  it("3. inserts with belongsTo via connect (existing parent)", async () => {
    const existing = await User.insert({ name: "Existing User" })

    const post = await Post.insertGraph({
      title: "Connected Post",
      author: { connect: { id: existing.get("id") as number } },
    })

    expect(post.get("userId")).toBe(existing.get("id"))
  })

  it("4. inserts a mixed graph (hasMany + hasOne)", async () => {
    const user = await User.insertGraph({
      name: "Mixed Graph",
      profile: { bio: "My bio" },
      posts: [{ title: "Mixed Post" }],
    })

    expect(user.get("name")).toBe("Mixed Graph")

    const profile = await Profile.query()
      .where("userId", "=", user.get("id") as number)
      .executeTakeFirst()
    expect(profile).toBeDefined()
    expect(profile!.get("bio")).toBe("My bio")

    const posts = await Post.query().where("userId", "=", user.get("id") as number)
    expect(posts).toHaveLength(1)
  })

  it("5. inserts a manyToMany graph", async () => {
    // First create some tags
    const tag1 = await Tag.insert({ name: "tech" })
    const tag2 = await Tag.insert({ name: "news" })

    const post = await Post.insertGraph({
      title: "ManyToMany Post",
      userId: 1, // FK to existing user
      tags: {
        connect: [tag1.get("id") as number, tag2.get("id") as number],
      },
    })

    expect(post.get("title")).toBe("ManyToMany Post")

    // Check pivot rows
    const pivots = (await db.execute({ sql: "SELECT * FROM graph_post_tags WHERE postId = ?", args: [post.get("id") as number] })).rows
    expect(pivots).toHaveLength(2)
  })

  it("6. creates new related items via manyToMany graph", async () => {
    const post = await Post.insertGraph({
      title: "New Tags Post",
      userId: 1,
      tags: {
        create: [{ name: "new-tag-1" }, { name: "new-tag-2" }],
      },
    })

    const pivots = (await db.execute({ sql: "SELECT * FROM graph_post_tags WHERE postId = ?", args: [post.get("id") as number] })).rows
    expect(pivots).toHaveLength(2)
  })

  it("7. returns a single model for object input", async () => {
    const result = await User.insertGraph({ name: "Single Result" })
    expect(Array.isArray(result)).toBe(false)
    expect(result.get("name")).toBe("Single Result")
  })

  it("8. returns an array for array input", async () => {
    const results = await User.insertGraph([{ name: "Multi 1" }, { name: "Multi 2" }])
    expect(Array.isArray(results)).toBe(true)
    expect(results).toHaveLength(2)
    expect(results[0]!.get("name")).toBe("Multi 1")
    expect(results[1]!.get("name")).toBe("Multi 2")
  })

  it("9. inserts graph with #id/#ref shared references", async () => {
    const results = await User.insertGraph(
      [
        {
          "#id": "alice",
          name: "Ref Alice",
          posts: [{ "#ref": "sharedPost" }],
        },
        {
          "#id": "bob",
          name: "Ref Bob",
          posts: [{ "#ref": "sharedPost" }],
        },
        {
          "#id": "sharedPost",
          title: "Shared Post",
          userId: 1,
        },
      ],
      { allowRefs: true },
    )

    expect(results).toHaveLength(3)

    // The shared post should be in the DB once
    const posts = await Post.query().where("title", "=", "Shared Post")
    expect(posts).toHaveLength(1)

    const sharedPost = posts[0]!
    // Both users should have pivot relationships (actually hasMany FK)
    const _alice = results.find((r: any) => r.get("name") === "Ref Alice")
    const _bob = results.find((r: any) => r.get("name") === "Ref Bob")

    // The post's userId should be set to one of the users
    expect(sharedPost.get("userId")).toBeGreaterThan(0)
  })

  it("10. throws when #ref used without allowRefs", async () => {
    expect(User.insertGraph([{ "#id": "x", name: "X" }, { "#ref": "x" }])).rejects.toThrow("allowRefs")
  })

  it("11. inserts with #dbRef (relate to existing)", async () => {
    const tag = await Tag.insert({ name: "dbref-tag" })

    const post = await Post.insertGraph({
      title: "DbRef Post",
      userId: 1,
      tags: {
        create: [{ "#dbRef": tag.get("id") as number }],
      },
    })

    const pivots = (await db.execute({ sql: "SELECT * FROM graph_post_tags WHERE postId = ?", args: [post.get("id") as number] })).rows
    expect(pivots).toHaveLength(1)
    expect(pivots[0] as any).toMatchObject({ tagId: tag.get("id") })
  })

  it("12. supports nested hasMany (posts → comments)", async () => {
    const user = await User.insertGraph({
      name: "Nested Graph",
      posts: [
        {
          title: "Parent Post",
          comments: [{ body: "Comment 1" }, { body: "Comment 2" }],
        },
      ],
    })

    const posts = await Post.query().where("userId", "=", user.get("id") as number)
    expect(posts).toHaveLength(1)

    const comments = await Comment.query().where("postId", "=", posts[0]!.get("id") as number)
    expect(comments).toHaveLength(2)
  })
})

// ─── Tests: upsertGraph ───────────────────────────────────────

describe("upsertGraph", () => {
  it("13. updates existing root node fields", async () => {
    const user = await User.insert({ name: "Before Update" })

    const updated = await User.upsertGraph({
      id: user.get("id") as number,
      name: "After Update",
    })

    expect(updated.get("name")).toBe("After Update")

    // Verify in DB
    const fetched = await User.find(user.get("id") as number)
    expect(fetched!.get("name")).toBe("After Update")
  })

  it("14. inserts new root node when no id", async () => {
    const user = await User.upsertGraph({ name: "New Via Upsert" })
    expect(user.get("id")).toBeGreaterThan(0)
    expect(user.get("name")).toBe("New Via Upsert")
  })

  it("15. creates new children and updates existing in hasMany", async () => {
    const user = await User.insert({ name: "Upsert User" })
    const userId = user.get("id") as number

    // Create some initial posts
    const post1 = await Post.insert({ title: "Keep Me", userId })
    const _post2 = await Post.insert({ title: "Update Me", userId })

    await User.upsertGraph({
      id: userId,
      name: "Upsert User",
      posts: [
        { id: post1.get("id") as number, title: "Keep Me Updated" },
        { title: "New Post" },
        // post2 is missing — should be deleted
      ],
    })

    const remaining = await Post.query().where("userId", "=", userId).orderBy("id", "asc")
    expect(remaining).toHaveLength(2)
    expect(remaining[0]!.get("title")).toBe("Keep Me Updated")
    expect(remaining[1]!.get("title")).toBe("New Post")
  })

  it("16. unrelates instead of deleting with unrelate option", async () => {
    const user = await User.insert({ name: "Unrelate Test" })
    const userId = user.get("id") as number

    // Profile uses a nullable FK — ideal for unrelate testing
    const profile = await Profile.insert({ bio: "Will be unrelated", userId })

    await User.upsertGraph(
      {
        id: userId,
        name: "Unrelate Test",
        profile: null,
        // profile is null — should be unrelated (FK set to null) with unrelate option
      },
      { unrelate: true },
    )

    const unrelated = await Profile.find(profile.get("id") as number)
    expect(unrelated).toBeDefined()
    expect(unrelated!.get("userId")).toBeNull()
  })

  it("17. does not delete with noDelete option", async () => {
    const user = await User.insert({ name: "NoDelete Test" })
    const userId = user.get("id") as number

    const post1 = await Post.insert({ title: "Should Remain", userId })

    await User.upsertGraph(
      {
        id: userId,
        name: "NoDelete Test",
        posts: [
          // post1 is missing but noDelete is set
        ],
      },
      { noDelete: ["posts"] },
    )

    const remaining = await Post.find(post1.get("id") as number)
    expect(remaining).toBeDefined()
    expect(remaining!.get("title")).toBe("Should Remain")
  })

  it("18. updates nested hasMany children via upsertGraph", async () => {
    const user = await User.insert({ name: "Nested Upsert" })
    const userId = user.get("id") as number

    const post = await Post.insert({ title: "Nested Parent", userId })
    const comment1 = await Comment.insert({ body: "Old Comment", postId: post.get("id") as number })

    await User.upsertGraph({
      id: userId,
      name: "Nested Upsert",
      posts: [
        {
          id: post.get("id") as number,
          title: "Nested Parent Updated",
          comments: [{ id: comment1.get("id") as number, body: "Updated Comment" }, { body: "New Comment" }],
        },
      ],
    })

    const updatedPost = await Post.find(post.get("id") as number)
    expect(updatedPost!.get("title")).toBe("Nested Parent Updated")

    const comments = await Comment.query()
      .where("postId", "=", post.get("id") as number)
      .orderBy("id", "asc")
    expect(comments).toHaveLength(2)
    expect(comments[0]!.get("body")).toBe("Updated Comment")
    expect(comments[1]!.get("body")).toBe("New Comment")
  })

  it("19. manyToMany upsert with relate/unrelate", async () => {
    const user = await User.insert({ name: "M2M Upsert" })

    const tag1 = await Tag.insert({ name: "keep" })
    const tag2 = await Tag.insert({ name: "remove" })
    const tag3 = await Tag.insert({ name: "add" })

    // Create post with tags
    const post = await Post.insertGraph({
      title: "M2M Upsert Post",
      userId: user.get("id") as number,
      tags: { connect: [tag1.get("id") as number, tag2.get("id") as number] },
    })

    // Now upsert: keep tag1, remove tag2, add tag3
    await Post.upsertGraph({
      id: post.get("id") as number,
      title: "M2M Upsert Post",
      tags: {
        connect: [tag1.get("id") as number, tag3.get("id") as number],
      },
    })

    const pivots = (await db.execute({ sql: "SELECT tagId FROM graph_post_tags WHERE postId = ?", args: [post.get("id") as number] })).rows as {
      tagId: number
    }[]
    const pivotTagIds = pivots.map((p) => p.tagId)

    expect(pivotTagIds).toContain(tag1.get("id") as number)
    expect(pivotTagIds).toContain(tag3.get("id") as number)
    expect(pivotTagIds).not.toContain(tag2.get("id") as number)
  })
})

// ─── Tests: allowGraph + insertGraph/upsertGraph ─────────────

describe("allowGraph with insertGraph/upsertGraph", () => {
  it("20. passes when whitelisted relation is used in insertGraph via QB", async () => {
    const user = await User.query()
      .allowGraph("posts")
      .insertGraph({ name: "AG User 1", posts: [{ title: "AG Post 1" }] })

    expect(user.get("name")).toBe("AG User 1")
    const posts = await Post.query().where("userId", "=", user.get("id") as number)
    expect(posts).toHaveLength(1)
  })

  it("21. throws when non-whitelisted relation is used in insertGraph via QB", async () => {
    await expect(
      User.query()
        .allowGraph("posts")
        .insertGraph({ name: "AG User 2", profile: { bio: "Not allowed" } }),
    ).rejects.toThrow(RelationNotAllowedError)
  })

  it("22. allows nested relation under whitelisted prefix", async () => {
    const user = await User.query()
      .allowGraph("posts")
      .insertGraph({
        name: "AG User 3",
        posts: [{ title: "Parent", comments: [{ body: "Nested allowed" }] }],
      })

    const posts = await Post.query().where("userId", "=", user.get("id") as number)
    expect(posts).toHaveLength(1)
    const comments = await Comment.query().where("postId", "=", posts[0]!.get("id") as number)
    expect(comments).toHaveLength(1)
  })

  it("23. throws when nested relation sibling is not under a whitelisted prefix", async () => {
    await expect(
      User.query()
        .allowGraph("posts.author")
        .insertGraph({
          name: "AG User 4",
          posts: [{ title: "Parent", tags: { create: [{ name: "blocked-tag" }] } }],
        }),
    ).rejects.toThrow(RelationNotAllowedError)
  })

  it("24. passes when allowGraph is passed via options on model-level insertGraph", async () => {
    const user = await User.insertGraph(
      { name: "AG User 5", posts: [{ title: "Option Post" }] },
      { allowGraph: ["posts"] },
    )

    expect(user.get("name")).toBe("AG User 5")
    const posts = await Post.query().where("userId", "=", user.get("id") as number)
    expect(posts).toHaveLength(1)
  })

  it("25. passes when whitelisted relation is used in upsertGraph via QB", async () => {
    const user = await User.insert({ name: "AG Upsert" })
    const userId = user.get("id") as number

    const updated = await User.query()
      .allowGraph("posts")
      .upsertGraph({
        id: userId,
        name: "AG Upsert Updated",
        posts: [{ title: "AG Upsert Post" }],
      })

    expect(updated.get("name")).toBe("AG Upsert Updated")
    const posts = await Post.query().where("userId", "=", userId)
    expect(posts).toHaveLength(1)
  })

  it("26. throws when non-whitelisted relation is used in upsertGraph via QB", async () => {
    const user = await User.insert({ name: "AG Upsert Block" })
    const userId = user.get("id") as number

    await expect(
      User.query()
        .allowGraph("posts")
        .upsertGraph({
          id: userId,
          name: "AG Upsert Block",
          profile: { bio: "Blocked" },
        }),
    ).rejects.toThrow(RelationNotAllowedError)
  })
})
