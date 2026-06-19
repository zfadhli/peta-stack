import { afterAll, beforeAll, describe, expect, it } from "bun:test"
import { createClient } from "@libsql/client"
import { LibsqlDialect } from "@libsql/kysely-libsql"
import { t as columnTypes, createArkTypeSchemaConfig } from "../src/columns/index.js"
import { belongsTo, createPeta, defineModel, hasMany, hasManyThrough, hasOne, manyToMany } from "../src/index.js"
import type { ModelInstance } from "../src/model/types.js"

const t = columnTypes({ schema: createArkTypeSchemaConfig() })

const User = defineModel("users", {
  columns: {
    id: t.integer().primaryKey(),
    name: t.string(255),
  },
  relations: {},
})

const Profile = defineModel("profiles", {
  columns: {
    id: t.integer().primaryKey(),
    userId: t.integer(),
    bio: t.text().nullable(),
  },
  relations: {
    user: belongsTo(() => User, { foreignKey: "userId" }),
  },
})

const Post = defineModel("posts", {
  columns: {
    id: t.integer().primaryKey(),
    userId: t.integer(),
    title: t.string(255),
  },
  relations: {
    author: belongsTo(() => User, { foreignKey: "userId" }),
  },
})

const Tag = defineModel("tags", {
  columns: {
    id: t.integer().primaryKey(),
    name: t.string(255),
  },
})

const CategoryPost = defineModel("category_posts", {
  columns: {
    id: t.integer().primaryKey(),
    categoryId: t.integer(),
    postId: t.integer(),
  },
})

const Category = defineModel("categories", {
  columns: {
    id: t.integer().primaryKey(),
    name: t.string(255),
  },
  relations: {
    posts: hasManyThrough(
      () => Post,
      () => CategoryPost,
    ),
  },
})

// Add circular relations now that all models are defined
User.relations.posts = hasMany(() => Post, { foreignKey: "userId" })
User.relations.profile = hasOne(() => Profile, { foreignKey: "userId" })
Post.relations.tags = manyToMany(() => Tag, {
  through: "post_tags",
  foreignPivotKey: "postId",
  relatedPivotKey: "tagId",
})
Tag.relations.posts = manyToMany(() => Post, {
  through: "post_tags",
  foreignPivotKey: "tagId",
  relatedPivotKey: "postId",
})

let peta: ReturnType<typeof createPeta>

beforeAll(async () => {
  const client = createClient({ url: ":memory:" })
  await client.execute("PRAGMA journal_mode = WAL")
  peta = createPeta({
    dialect: new LibsqlDialect({ client }),
  })
  peta.registerAll(User, Profile, Post, Tag, Category, CategoryPost)

  await client.execute("CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)")
  await client.execute("CREATE TABLE profiles (id INTEGER PRIMARY KEY AUTOINCREMENT, userId INTEGER NOT NULL, bio TEXT)")
  await client.execute("CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, userId INTEGER NOT NULL, title TEXT NOT NULL)")
  await client.execute("CREATE TABLE tags (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)")
  await client.execute("CREATE TABLE post_tags (id INTEGER PRIMARY KEY AUTOINCREMENT, postId INTEGER NOT NULL, tagId INTEGER NOT NULL)")
  await client.execute("CREATE TABLE categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)")
  await client.execute("CREATE TABLE category_posts (id INTEGER PRIMARY KEY AUTOINCREMENT, categoryId INTEGER NOT NULL, postId INTEGER NOT NULL)")

  const alice = await User.insert({ name: "Alice" })
  const bob = await User.insert({ name: "Bob" })

  await Profile.insert({ userId: alice.get("id"), bio: "Alice's bio" })
  await Profile.insert({ userId: bob.get("id"), bio: "Bob's bio" })

  const p1 = await Post.insert({ userId: alice.get("id"), title: "Alice Post 1" })
  const p2 = await Post.insert({ userId: alice.get("id"), title: "Alice Post 2" })
  const p3 = await Post.insert({ userId: bob.get("id"), title: "Bob Post 1" })

  const tagA = await Tag.insert({ name: "tech" })
  const tagB = await Tag.insert({ name: "life" })

  await peta.kysely
    .insertInto("post_tags")
    .values({ postId: p1.get("id"), tagId: tagA.get("id") })
    .execute()
  await peta.kysely
    .insertInto("post_tags")
    .values({ postId: p1.get("id"), tagId: tagB.get("id") })
    .execute()
  await peta.kysely
    .insertInto("post_tags")
    .values({ postId: p2.get("id"), tagId: tagA.get("id") })
    .execute()
  await peta.kysely
    .insertInto("post_tags")
    .values({ postId: p3.get("id"), tagId: tagB.get("id") })
    .execute()
})

afterAll(async () => {
  await peta.destroy()
})

describe("HasMany", () => {
  it("loads related models query", async () => {
    const alice = await User.find(1)
    expect(alice).toBeDefined()
    const posts = await User.relations.posts.query(alice!).execute()
    expect(posts).toHaveLength(2)
    expect(posts[0]!.get("userId")).toBe(alice!.get("id"))
  })

  it("eager loads HasMany", async () => {
    const users = await User.query().with("posts").orderBy("id", "asc")
    expect(users).toHaveLength(2)
    const alice = users[0]!
    const posts = alice.$getRelation("posts") as ModelInstance[]
    expect(posts).toHaveLength(2)
    expect(posts[0]!.get("title")).toBe("Alice Post 1")
  })

  it("eager loads with constraints", async () => {
    const users = await User.query()
      .with({ posts: (q) => q.where("title", "=", "Alice Post 1") })
      .orderBy("id", "asc")
    const alice = users[0]!
    const posts = alice.$getRelation("posts") as ModelInstance[]
    expect(posts).toHaveLength(1)
    expect(posts[0]!.get("title")).toBe("Alice Post 1")
  })

  it("returns empty array when no related", async () => {
    const newUser = await User.insert({ name: "Empty" })
    const posts = await User.relations.posts.query(newUser).execute()
    expect(posts).toHaveLength(0)
  })
})

describe("BelongsTo", () => {
  it("loads parent via query", async () => {
    const post = await Post.find(1)
    expect(post).toBeDefined()
    const author = await Post.relations.author.query(post!).executeTakeFirst()
    expect(author).toBeDefined()
    expect(author!.get("name")).toBe("Alice")
  })

  it("eager loads BelongsTo", async () => {
    const posts = await Post.query().with("author").orderBy("id", "asc")
    expect(posts).toHaveLength(3)
    const post1 = posts[0]!
    const author = post1.$getRelation("author") as ModelInstance
    expect(author).not.toBeNull()
    expect(author.get("name")).toBe("Alice")
  })
})

describe("HasOne", () => {
  it("loads related via query", async () => {
    const alice = await User.find(1)
    expect(alice).toBeDefined()
    const profile = await User.relations.profile.query(alice!).executeTakeFirst()
    expect(profile).toBeDefined()
    expect(profile!.get("bio")).toBe("Alice's bio")
  })

  it("eager loads HasOne", async () => {
    const users = await User.query().with("profile").orderBy("id", "asc")
    const bob = users[1]!
    const profile = bob.$getRelation("profile") as ModelInstance
    expect(profile).not.toBeNull()
    expect(profile.get("bio")).toBe("Bob's bio")
  })

  it("returns undefined when no related", async () => {
    const newUser = await User.insert({ name: "NoProfile" })
    const profile = await User.relations.profile.query(newUser).executeTakeFirst()
    expect(profile).toBeUndefined()
  })
})

describe("Nested eager loading", () => {
  it("loads nested relations via dot notation", async () => {
    const users = await User.query().with("posts.author").orderBy("id", "asc")
    const alice = users[0]!
    const posts = alice.$getRelation("posts") as ModelInstance[]
    expect(posts).toHaveLength(2)
    for (const post of posts) {
      const author = post.$getRelation("author") as ModelInstance
      expect(author).not.toBeNull()
      expect(author.get("name")).toBe("Alice")
    }
  })
})

describe("$load (lazy eager loading)", () => {
  it("loads a relation after fetch", async () => {
    const alice = await User.find(1)
    expect(alice).toBeDefined()
    expect(alice!.$hasRelation("posts")).toBe(false)
    await alice!.$load("posts")
    expect(alice!.$hasRelation("posts")).toBe(true)
    const posts = alice!.$getRelation("posts") as ModelInstance[]
    expect(posts).toHaveLength(2)
  })
})

describe("$toJSON with relations", () => {
  it("includes relations in JSON output", async () => {
    const users = await User.query().with("posts").orderBy("id", "asc")
    const alice = users[0]!
    const json = alice.$toJSON()
    expect(json).toHaveProperty("name", "Alice")
    expect(json).toHaveProperty("posts")
    expect(Array.isArray(json.posts)).toBe(true)
    const posts = json.posts as Array<Record<string, unknown>>
    expect(posts).toHaveLength(2)
    expect(posts[0]!).toHaveProperty("title")
  })
})

describe("has / whereHas", () => {
  it("filters by relation existence", async () => {
    const users = await User.query().has("posts").orderBy("id", "asc")
    expect(users).toHaveLength(2)
  })
})

describe("allowGraph security", () => {
  it("allows whitelisted relations", async () => {
    const users = await User.query().allowGraph("posts").with("posts").orderBy("id", "asc")
    expect(users.length).toBeGreaterThanOrEqual(2)
    const first = users[0]!
    expect(first.$hasRelation("posts")).toBe(true)
  })

  it("throws on non-whitelisted relations", async () => {
    expect(() => User.query().allowGraph("profile").with("posts")).toThrow()
  })

  it("allows nested routes in whitelist", async () => {
    const users = await User.query().allowGraph("posts").with("posts.author").orderBy("id", "asc")
    expect(users.length).toBeGreaterThanOrEqual(2)
  })

  // ── Recursive validation ─────────────────────────────────

  it("allows dotted path when full path is whitelisted", async () => {
    const users = await User.query().allowGraph("posts.author").with("posts.author").orderBy("id", "asc")
    expect(users.length).toBeGreaterThanOrEqual(2)
  })

  it("allows deeper nested path when prefix is whitelisted", () => {
    // Verifies that allowGraph validation passes for nested paths deeper than the
    // whitelisted prefix (the sync with() call does not throw RelationNotFoundError)
    expect(() => User.query().allowGraph("posts.author").with("posts.author.profile")).not.toThrow()
  })

  it("throws when base name is not in dotted-path whitelist", async () => {
    expect(() => User.query().allowGraph("posts.author").with("posts")).toThrow()
  })

  it("throws when sibling nested path is not in whitelist", async () => {
    expect(() => User.query().allowGraph("posts.author").with("posts.comments")).toThrow()
  })

  it("throws when unrelated relation is not in whitelist", async () => {
    expect(() => User.query().allowGraph("posts.author").with("profile")).toThrow()
  })

  it("allows multiple relations via rest args", async () => {
    const users = await User.query().allowGraph("posts", "profile").with("posts.author").orderBy("id", "asc")
    expect(users.length).toBeGreaterThanOrEqual(2)
  })

  it("allows each from multiple rest args", async () => {
    const users = await User.query().allowGraph("posts", "profile").with("profile").orderBy("id", "asc")
    expect(users.length).toBeGreaterThanOrEqual(2)
  })

  it("allows object-style relation in whitelist", async () => {
    const users = await User.query()
      .allowGraph("posts")
      .with({ posts: (qb) => qb.orderBy("id", "asc") })
      .orderBy("id", "asc")
    expect(users.length).toBeGreaterThanOrEqual(2)
  })

  it("throws on object-style relation not in whitelist", async () => {
    expect(() =>
      User.query()
        .allowGraph("profile")
        .with({ posts: (qb) => qb }),
    ).toThrow()
  })
})

describe("ManyToMany", () => {
  it("loads tags for a post query", async () => {
    const post = await Post.find(1)
    expect(post).toBeDefined()
    const tags = await Post.relations.tags.query(post!).execute()
    expect(tags).toHaveLength(2)
  })
})

describe("$related() relation query builder", () => {
  it("queries hasMany through $related", async () => {
    const alice = await User.find(1)
    expect(alice).toBeDefined()
    const posts = await alice!.$related("posts").orderBy("id", "asc")
    expect(posts).toHaveLength(2)
    expect(posts[0]!.get("userId")).toBe(alice!.get("id"))
  })

  it("queries belongsTo through $related", async () => {
    const post = await Post.find(1)
    expect(post).toBeDefined()
    const author = await post!.$related("author").executeTakeFirst()
    expect(author).toBeDefined()
    expect(author!.get("name")).toBe("Alice")
  })

  it("queries hasOne through $related", async () => {
    const alice = await User.find(1)
    expect(alice).toBeDefined()
    const profile = await alice!.$related("profile").executeTakeFirst()
    expect(profile).toBeDefined()
    expect(profile!.get("bio")).toBe("Alice's bio")
  })

  it("queries manyToMany through $related", async () => {
    const post = await Post.find(1)
    expect(post).toBeDefined()
    const tags = await post!.$related("tags")
    expect(tags).toHaveLength(2)
  })

  it("supports chaining additional query methods", async () => {
    const alice = await User.find(1)
    expect(alice).toBeDefined()
    const posts = await alice!.$related("posts").where("title", "like", "%Post 1%").orderBy("id", "asc")
    expect(posts).toHaveLength(1)
    expect(posts[0]!.get("title")).toBe("Alice Post 1")
  })

  it("returns empty array when no related", async () => {
    const newUser = await User.insert({ name: "Orphan" })
    const posts = await newUser!.$related("posts")
    expect(posts).toHaveLength(0)
  })

  it("throws RelationNotFoundError for invalid relation name", async () => {
    const alice = await User.find(1)
    expect(alice).toBeDefined()
    expect(() => alice!.$related("nonexistent")).toThrow()
  })
})

describe("Nested create through relations", () => {
  it("creates with belongsTo via connect", async () => {
    const author = await User.query().orderBy("id", "asc").first()
    expect(author).toBeDefined()
    const authorId = author!.get("id")

    const post = await Post.create({
      title: "Nested Connect Post",
      author: {
        connect: { id: authorId },
      },
    })

    expect(post.get("title")).toBe("Nested Connect Post")
    expect(post.get("userId")).toBe(authorId)
  })

  it("creates with belongsTo via connectOrCreate", async () => {
    const post = await Post.create({
      title: "Connect Or Create Post",
      author: {
        connectOrCreate: {
          where: { name: "New Author" },
          create: { name: "New Author" },
        },
      },
    })

    expect(post.get("title")).toBe("Connect Or Create Post")
    expect(post.get("userId")).toBeGreaterThan(0)
  })

  it("creates with hasMany children", async () => {
    const alice = await User.find(1)
    expect(alice).toBeDefined()
    const authorId = alice!.get("id")

    // Post.create with embedded tags (manyToMany)
    const tag1 = await Tag.insert({ name: "nested-tag-1" })
    const tag2 = await Tag.insert({ name: "nested-tag-2" })

    const post = await Post.create({
      title: "Post With Tags",
      userId: authorId,
      tags: {
        connect: [tag1.get("id"), tag2.get("id")],
      },
    })

    expect(post.get("title")).toBe("Post With Tags")

    // Verify tags were connected
    const tags = await post.$related("tags")
    expect(tags.length).toBeGreaterThanOrEqual(2)
  })
})

describe("Nested update through relations", () => {
  it("updates belongsTo via update", async () => {
    const alice = await User.find(1)
    expect(alice).toBeDefined()
    const posts = await alice!.$related("posts")
    expect(posts.length).toBeGreaterThan(0)

    const post = posts[0]!
    const _oldAuthorName = alice!.get("name")

    await Post.update(post.get("id"), {
      title: "Updated Title",
      author: {
        update: { name: "Updated Author" },
      },
    })

    const updated = await Post.find(post.get("id"))
    expect(updated!.get("title")).toBe("Updated Title")

    // Verify the author was updated
    const author = await User.find(alice!.get("id"))
    expect(author!.get("name")).toBe("Updated Author")
  })

  it("creates new related via hasMany create in update", async () => {
    const alice = await User.find(1)
    expect(alice).toBeDefined()
    const aliceId = alice!.get("id")

    await User.update(aliceId, {
      posts: {
        create: [{ title: "Updated Create Post 1" }, { title: "Updated Create Post 2" }],
      },
    })

    const posts = await alice!.$related("posts").orderBy("id", "desc").limit(2)
    const titles = posts.map((p) => p.get("title"))
    expect(titles).toContain("Updated Create Post 1")
    expect(titles).toContain("Updated Create Post 2")
  })

  it("connects many-to-many via update", async () => {
    const alice = await User.find(1)
    expect(alice).toBeDefined()
    const posts = await alice!.$related("posts")
    expect(posts.length).toBeGreaterThan(0)

    const post = posts[0]!
    const newTag = await Tag.insert({ name: "update-connect-tag" })

    await Post.update(post.get("id"), {
      tags: {
        connect: [newTag.get("id")],
      },
    })

    const tags = await post!.$related("tags").orderBy("id", "desc")
    expect(tags.some((t) => t.get("name") === "update-connect-tag")).toBe(true)
  })
})

describe("attach/detach/sync for many-to-many", () => {
  let post: Awaited<ReturnType<typeof Post.find>>
  let tagA: Awaited<ReturnType<typeof Tag.find>>
  let tagB: Awaited<ReturnType<typeof Tag.find>>

  beforeAll(async () => {
    // Create fresh tags for clean testing
    const ta = await Tag.insert({ name: "attach-a" })
    const tb = await Tag.insert({ name: "attach-b" })
    tagA = ta
    tagB = tb

    // Create a fresh post
    const alice = await User.find(1)
    const p = await Post.insert({ userId: alice!.get("id"), title: "Attach Test Post" })
    post = p
  })

  it("attach adds pivot rows", async () => {
    await post!.$related("tags").attach(tagA!.get("id"))
    const tags = await post!.$related("tags")
    expect(tags.some((t) => t.get("id") === tagA!.get("id"))).toBe(true)
  })

  it("detach removes pivot rows", async () => {
    const tagId = tagA!.get("id")
    await post!.$related("tags").detach(tagId)
    const tags = await post!.$related("tags")
    expect(tags.some((t) => t.get("id") === tagId)).toBe(false)
  })

  it("sync replaces all pivot rows", async () => {
    await post!.$related("tags").sync([tagA!.get("id"), tagB!.get("id")])
    const tags = await post!.$related("tags")
    expect(tags).toHaveLength(2)
  })

  it("syncWithoutDetaching adds without removing", async () => {
    // First detach everything
    await post!.$related("tags").detach()

    // Then syncWithoutDetaching
    await post!.$related("tags").syncWithoutDetaching([tagA!.get("id")])
    const tags = await post!.$related("tags")
    expect(tags).toHaveLength(1)
    expect(tags[0]!.get("id")).toBe(tagA!.get("id"))
  })
})
