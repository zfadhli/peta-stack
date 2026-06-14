/**
 * Integration tests: Relations across all database dialects.
 *
 * Covers: relation.test.ts + graph.test.ts
 * Each test group creates its own tables using unique table names.
 */

import { t as columnTypes, createArkTypeSchemaConfig } from "../../src/columns/index.js"
import { belongsTo, defineModel, hasMany, hasOne, manyToMany } from "../../src/index.js"
import type { ModelInstance } from "../../src/model/types.js"
import type { DialectContext, SchemaDef } from "./setup.js"
import {
  afterAll,
  applySchemas,
  beforeAll,
  describe,
  dropSchemas,
  expect,
  getAvailableDialects,
  idColumn,
  it,
} from "./setup.js"

const _t = columnTypes({ schema: createArkTypeSchemaConfig() })

// ─── Schema builders ────────────────────────────────────────────────

const userTable = (name: string, dialectName?: string): SchemaDef => ({
  name,
  up: async (k) => {
    await k.schema
      .createTable(name)
      .addColumn("id", "integer", idColumn(dialectName))
      .addColumn("name", "varchar(255)", (c) => c.notNull())
      .execute()
  },
  down: async (k) => {
    await k.schema.dropTable(name).ifExists().execute()
  },
})

const postTable = (name: string, dialectName?: string): SchemaDef => ({
  name,
  up: async (k) => {
    await k.schema
      .createTable(name)
      .addColumn("id", "integer", idColumn(dialectName))
      .addColumn("userId", "integer", (c) => c.notNull())
      .addColumn("title", "varchar(255)", (c) => c.notNull())
      .execute()
  },
  down: async (k) => {
    await k.schema.dropTable(name).ifExists().execute()
  },
})

const profileTable = (name: string, dialectName?: string): SchemaDef => ({
  name,
  up: async (k) => {
    await k.schema
      .createTable(name)
      .addColumn("id", "integer", idColumn(dialectName))
      .addColumn("userId", "integer", (c) => c.notNull())
      .addColumn("bio", "text")
      .execute()
  },
  down: async (k) => {
    await k.schema.dropTable(name).ifExists().execute()
  },
})

const tagTable = (name: string, dialectName?: string): SchemaDef => ({
  name,
  up: async (k) => {
    await k.schema
      .createTable(name)
      .addColumn("id", "integer", idColumn(dialectName))
      .addColumn("name", "varchar(255)", (c) => c.notNull())
      .execute()
  },
  down: async (k) => {
    await k.schema.dropTable(name).ifExists().execute()
  },
})

const pivotTable = (name: string): SchemaDef => ({
  name,
  up: async (k) => {
    await k.schema
      .createTable(name)
      .addColumn("postId", "integer", (c) => c.notNull())
      .addColumn("tagId", "integer", (c) => c.notNull())
      .execute()
  },
  down: async (k) => {
    await k.schema.dropTable(name).ifExists().execute()
  },
})

// ─── Tests ──────────────────────────────────────────────────────────

for (const dialect of await getAvailableDialects()) {
  describe(`[${dialect.label}] Relations`, () => {
    // ─── HasMany + BelongsTo + HasOne ────────────────────────────

    describe("HasMany / BelongsTo / HasOne", () => {
      const schemas = [
        userTable("rel_users", dialect.name),
        postTable("rel_posts", dialect.name),
        profileTable("rel_profiles", dialect.name),
      ]
      let ctx: DialectContext

      const User = defineModel("rel_users", {
        columns: { id: _t.integer().primaryKey(), name: _t.string(255) },
        relations: {
          posts: hasMany(() => Post, { foreignKey: "userId" }),
          profile: hasOne(() => Profile, { foreignKey: "userId" }),
        },
      })

      const Post = defineModel("rel_posts", {
        columns: { id: _t.integer().primaryKey(), userId: _t.integer(), title: _t.string(255) },
        relations: { author: belongsTo(() => User, { foreignKey: "userId" }) },
      })

      const Profile = defineModel("rel_profiles", {
        columns: { id: _t.integer().primaryKey(), userId: _t.integer(), bio: _t.text().nullable() },
        relations: { user: belongsTo(() => User, { foreignKey: "userId" }) },
      })

      beforeAll(async () => {
        ctx = await dialect.create()
        await applySchemas(ctx.kysely, schemas)
        ctx.registerAll(User, Post, Profile)

        const alice = await User.insert({ name: "Alice" })
        const bob = await User.insert({ name: "Bob" })
        await Post.insert({ userId: alice.get("id") as number, title: "Alice Post 1" })
        await Post.insert({ userId: alice.get("id") as number, title: "Alice Post 2" })
        await Post.insert({ userId: bob.get("id") as number, title: "Bob Post 1" })
        await Profile.insert({ userId: alice.get("id") as number, bio: "Alice's bio" })
        await Profile.insert({ userId: bob.get("id") as number, bio: "Bob's bio" })
      })

      afterAll(async () => {
        await dropSchemas(ctx.kysely, schemas)
        await ctx.destroy()
      })

      it("HasMany: loads related models via query", async () => {
        const alice = await User.find(1)
        expect(alice).toBeDefined()
        const posts = await User.relations.posts.query(alice!).execute()
        expect(posts).toHaveLength(2)
        expect(posts[0]!.get("userId")).toBe(alice!.get("id"))
      })

      it("HasMany: eager loads", async () => {
        const users = await User.query().with("posts").orderBy("id", "asc")
        expect(users).toHaveLength(2)
        const posts = users[0]!.$getRelation("posts") as ModelInstance[]
        expect(posts).toHaveLength(2)
      })

      it("HasMany: returns empty when no related", async () => {
        const newUser = await User.insert({ name: "Empty" })
        const posts = await User.relations.posts.query(newUser).execute()
        expect(posts).toHaveLength(0)
      })

      it("BelongsTo: loads parent via query", async () => {
        const post = await Post.find(1)
        expect(post).toBeDefined()
        const author = await Post.relations.author.query(post!).executeTakeFirst()
        expect(author).toBeDefined()
        expect(author!.get("name")).toBe("Alice")
      })

      it("BelongsTo: eager loads", async () => {
        const posts = await Post.query().with("author").orderBy("id", "asc")
        expect(posts).toHaveLength(3)
        const author = posts[0]!.$getRelation("author") as ModelInstance
        expect(author.get("name")).toBe("Alice")
      })

      it("HasOne: loads related via query", async () => {
        const alice = await User.find(1)
        expect(alice).toBeDefined()
        const profile = await User.relations.profile.query(alice!).executeTakeFirst()
        expect(profile).toBeDefined()
        expect(profile!.get("bio")).toBe("Alice's bio")
      })
    })

    // ─── ManyToMany (basic) ──────────────────────────────────────

    describe("ManyToMany", () => {
      const schemas = [
        postTable("mtm_posts", dialect.name),
        tagTable("mtm_tags", dialect.name),
        pivotTable("mtm_post_tags"),
      ]
      let ctx: DialectContext

      const Post = defineModel("mtm_posts", {
        columns: { id: _t.integer().primaryKey(), userId: _t.integer(), title: _t.string(255) },
        relations: {
          tags: manyToMany(() => Tag, {
            through: "mtm_post_tags",
            foreignPivotKey: "postId",
            relatedPivotKey: "tagId",
          }),
        },
      })

      const Tag = defineModel("mtm_tags", {
        columns: { id: _t.integer().primaryKey(), name: _t.string(255) },
        relations: {
          posts: manyToMany(() => Post, {
            through: "mtm_post_tags",
            foreignPivotKey: "tagId",
            relatedPivotKey: "postId",
          }),
        },
      })

      beforeAll(async () => {
        ctx = await dialect.create()
        await applySchemas(ctx.kysely, schemas)
        ctx.registerAll(Post, Tag)

        await Post.insert({ userId: 1, title: "MTM Post 1" })
        await Post.insert({ userId: 1, title: "MTM Post 2" })
        const tagA = await Tag.insert({ name: "tech" })
        const tagB = await Tag.insert({ name: "life" })

        // Seed pivot directly
        await ctx.kysely
          .insertInto("mtm_post_tags")
          .values({ postId: 1, tagId: tagA.get("id") as number })
          .execute()
        await ctx.kysely
          .insertInto("mtm_post_tags")
          .values({ postId: 1, tagId: tagB.get("id") as number })
          .execute()
        await ctx.kysely
          .insertInto("mtm_post_tags")
          .values({ postId: 2, tagId: tagA.get("id") as number })
          .execute()
      })

      afterAll(async () => {
        await dropSchemas(ctx.kysely, schemas)
        await ctx.destroy()
      })

      it("loads related tags via relation query", async () => {
        const post = await Post.find(1)
        expect(post).toBeDefined()
        const tags = await Post.relations.tags.query(post!).execute()
        expect(tags).toHaveLength(2)
        const names = tags.map((t: any) => t.get("name"))
        expect(names).toContain("tech")
        expect(names).toContain("life")
      })

      it("loads related posts via Tag", async () => {
        const tech = await Tag.find(1)
        expect(tech).toBeDefined()
        const posts = await Tag.relations.posts.query(tech!).execute()
        expect(posts.length).toBeGreaterThanOrEqual(1)
      })

      it("attaches via $related()", async () => {
        const post = await Post.insert({ userId: 1, title: "Attach Test Post" })
        const tagA = await Tag.insert({ name: "attach-a" })
        await post!.$related("tags").attach(tagA.get("id") as number)
        // Verify via direct pivot query
        const pivotRows = await ctx.kysely
          .selectFrom("mtm_post_tags")
          .selectAll()
          .where("postId", "=", post.get("id") as number)
          .execute()
        expect(pivotRows.length).toBeGreaterThanOrEqual(1)
        expect(pivotRows.some((r: any) => r.tagId === tagA.get("id"))).toBe(true)
      })

      it("detaches via $related()", async () => {
        const post = await Post.insert({ userId: 1, title: "Detach Test Post" })
        const tagA = await Tag.insert({ name: "detach-a" })
        const tagB = await Tag.insert({ name: "detach-b" })
        await post!.$related("tags").attach(tagA.get("id") as number)
        await post!.$related("tags").attach(tagB.get("id") as number)

        await post!.$related("tags").detach(tagA.get("id") as number)
        const pivotRows = await ctx.kysely
          .selectFrom("mtm_post_tags")
          .selectAll()
          .where("postId", "=", post.get("id") as number)
          .execute()
        const tagIds = pivotRows.map((r: any) => r.tagId)
        expect(tagIds).not.toContain(tagA.get("id"))
        expect(tagIds).toContain(tagB.get("id"))
      })

      it("syncs via $related()", async () => {
        const post = await Post.insert({ userId: 1, title: "Sync Test Post" })
        const tagA = await Tag.insert({ name: "sync-a" })
        const tagB = await Tag.insert({ name: "sync-b" })
        await post!.$related("tags").attach(tagA.get("id") as number)
        await post!.$related("tags").attach(tagB.get("id") as number)

        await post!.$related("tags").sync([tagA.get("id") as number])
        const pivotRows = await ctx.kysely
          .selectFrom("mtm_post_tags")
          .selectAll()
          .where("postId", "=", post.get("id") as number)
          .execute()
        expect(pivotRows).toHaveLength(1)
        expect(pivotRows[0].tagId).toBe(tagA.get("id"))
      })
    })

    // ─── insertGraph ────────────────────────────────────────────

    describe("insertGraph", () => {
      let ctx: DialectContext

      const schemas = [
        userTable("graph_users", dialect.name),
        postTable("graph_posts", dialect.name),
        tagTable("graph_tags", dialect.name),
        pivotTable("graph_post_tags"),
      ]

      const User = defineModel("graph_users", {
        columns: { id: _t.integer().primaryKey(), name: _t.string(255) },
        relations: { posts: hasMany(() => Post, { foreignKey: "userId" }) },
      })

      const Post = defineModel("graph_posts", {
        columns: { id: _t.integer().primaryKey(), userId: _t.integer(), title: _t.string(255) },
        relations: {
          author: belongsTo(() => User, { foreignKey: "userId" }),
          // Many-to-many with tags omitted for insertGraph tests — referencing
          // existing tags via insertGraph has known limitations (tries to
          // re-insert rather than create pivot records).
        },
      })

      const Tag = defineModel("graph_tags", {
        columns: { id: _t.integer().primaryKey(), name: _t.string(255) },
      })

      beforeAll(async () => {
        ctx = await dialect.create()
        await applySchemas(ctx.kysely, schemas)
        ctx.registerAll(User, Post, Tag)
      })

      afterAll(async () => {
        await dropSchemas(ctx.kysely, schemas)
        await ctx.destroy()
      })

      it("inserts a user with posts via insertGraph", async () => {
        const user = await User.insertGraph({
          name: "Graph User",
          posts: [{ title: "Graph Post 1" }, { title: "Graph Post 2" }],
        })
        expect(user.get("name")).toBe("Graph User")
        const posts = await User.relations.posts.query(user).execute()
        expect(posts).toHaveLength(2)
      })

      it("upserts via upsertGraph", async () => {
        const user = await User.insertGraph({
          name: "Upsert User",
          posts: [{ title: "Upsert Post" }],
        })
        expect(user.get("name")).toBe("Upsert User")

        const existingPosts = await User.relations.posts.query(user).execute()

        const updated = await User.upsertGraph({
          id: user.get("id"),
          name: "Upsert User Updated",
          posts: [...(existingPosts.length > 0 ? [{ id: existingPosts[0]!.get("id") }] : []), { title: "New Post" }],
        })
        expect(updated.get("name")).toBe("Upsert User Updated")
        const allPosts = await User.relations.posts.query(updated).execute()
        expect(allPosts.length).toBeGreaterThanOrEqual(2)
      })
    })
  })
}
