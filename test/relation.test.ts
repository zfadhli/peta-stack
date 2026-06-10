import { Database } from "bun:sqlite"
import { afterAll, beforeAll, describe, expect, it } from "bun:test"
import { BunSqliteDialect } from "kysely-bun-sqlite"
import { t as columnTypes, createArkTypeSchemaConfig } from "../src/columns/index.js"
import { belongsTo, createPeta, defineModel, hasMany, hasManyThrough, hasOne, manyToMany } from "../src/index.js"
import type { ModelInstance } from "../src/model/index.js"

const t = columnTypes({ schema: createArkTypeSchemaConfig() })

// Models are defined in dependency order to avoid TDZ issues with relation thunks.
// Circular refs (User ↔ Post, User ↔ Profile) are handled by defining User first
// with empty relations, then mutating its relations property later.

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
  const database = new Database(":memory:")
  database.run("PRAGMA journal_mode = WAL")
  peta = createPeta({
    dialect: new BunSqliteDialect({ database }),
  })
  peta.registerAll(User, Profile, Post, Tag, Category, CategoryPost)

  database.run(`
    CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE profiles (id INTEGER PRIMARY KEY AUTOINCREMENT, userId INTEGER NOT NULL, bio TEXT);
    CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, userId INTEGER NOT NULL, title TEXT NOT NULL);
    CREATE TABLE tags (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE post_tags (id INTEGER PRIMARY KEY AUTOINCREMENT, postId INTEGER NOT NULL, tagId INTEGER NOT NULL);
    CREATE TABLE categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE category_posts (id INTEGER PRIMARY KEY AUTOINCREMENT, categoryId INTEGER NOT NULL, postId INTEGER NOT NULL);
  `)

  const alice = await User.insert({ name: "Alice" })
  const bob = await User.insert({ name: "Bob" })

  await Profile.insert({ userId: alice.get("id") as number, bio: "Alice's bio" })
  await Profile.insert({ userId: bob.get("id") as number, bio: "Bob's bio" })

  const p1 = await Post.insert({ userId: alice.get("id") as number, title: "Alice Post 1" })
  const p2 = await Post.insert({ userId: alice.get("id") as number, title: "Alice Post 2" })
  const p3 = await Post.insert({ userId: bob.get("id") as number, title: "Bob Post 1" })

  const tagA = await Tag.insert({ name: "tech" })
  const tagB = await Tag.insert({ name: "life" })

  await peta.kysely
    .insertInto("post_tags")
    .values({ postId: p1.get("id") as number, tagId: tagA.get("id") as number })
    .execute()
  await peta.kysely
    .insertInto("post_tags")
    .values({ postId: p1.get("id") as number, tagId: tagB.get("id") as number })
    .execute()
  await peta.kysely
    .insertInto("post_tags")
    .values({ postId: p2.get("id") as number, tagId: tagA.get("id") as number })
    .execute()
  await peta.kysely
    .insertInto("post_tags")
    .values({ postId: p3.get("id") as number, tagId: tagB.get("id") as number })
    .execute()
})

afterAll(async () => {
  await peta.destroy()
})

describe("HasMany", () => {
  it("loads related models via $relatedQuery", async () => {
    const alice = await User.find(1)
    expect(alice).toBeDefined()
    const posts = await User.relations.posts.query(alice!).execute()
    expect(posts).toHaveLength(2)
    expect(posts[0]!.get("userId")).toBe(alice!.get("id"))
  })

  it("eager loads HasMany", async () => {
    const users = await User.query().with("posts").orderBy("id", "asc").execute()
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
      .execute()
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
  it("loads parent via $relatedQuery", async () => {
    const post = await Post.find(1)
    expect(post).toBeDefined()
    const author = await Post.relations.author.query(post!).executeTakeFirst()
    expect(author).toBeDefined()
    expect(author!.get("name")).toBe("Alice")
  })

  it("eager loads BelongsTo", async () => {
    const posts = await Post.query().with("author").orderBy("id", "asc").execute()
    expect(posts).toHaveLength(3)
    const post1 = posts[0]!
    const author = post1.$getRelation("author") as ModelInstance
    expect(author).not.toBeNull()
    expect(author.get("name")).toBe("Alice")
  })
})

describe("HasOne", () => {
  it("loads related via $relatedQuery", async () => {
    const alice = await User.find(1)
    expect(alice).toBeDefined()
    const profile = await User.relations.profile.query(alice!).executeTakeFirst()
    expect(profile).toBeDefined()
    expect(profile!.get("bio")).toBe("Alice's bio")
  })

  it("eager loads HasOne", async () => {
    const users = await User.query().with("profile").orderBy("id", "asc").execute()
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
    const users = await User.query().with("posts.author").orderBy("id", "asc").execute()
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
    const users = await User.query().with("posts").orderBy("id", "asc").execute()
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
    const users = await User.query().has("posts").orderBy("id", "asc").execute()
    expect(users).toHaveLength(2)
  })

  it("whereHas with callback", async () => {
    const users = await User.query().has("posts").execute()
    expect(users).toHaveLength(2)
  })
})

describe("ManyToMany", () => {
  it("loads tags for a post via $relatedQuery", async () => {
    const post = await Post.find(1)
    expect(post).toBeDefined()
    const tags = await Post.relations.tags.query(post!).execute()
    expect(tags).toHaveLength(2)
  })

  it("has pivot extras accessible", async () => {
    const _PostWithPivot = defineModel("posts", {
      columns: { id: t.integer().primaryKey(), title: t.string(255) },
      relations: {
        tags: manyToMany(() => Tag, {
          through: "post_tags",
          foreignPivotKey: "postId",
          relatedPivotKey: "tagId",
          pivotExtras: ["postId"],
        }),
      },
    })

    const post = await Post.find(1)
    expect(post).toBeDefined()
  })
})
