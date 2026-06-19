import type { Client } from "@libsql/client"
import { createClient } from "@libsql/client"
import { LibsqlDialect } from "@libsql/kysely-libsql"
import type { ModelDefinition } from "peta-orm"
import {
  belongsTo,
  t,
  createORM,
  defineModel,
  hasMany,
  manyToMany,
  timestamps,
  ulid,
} from "peta-orm"

// ---------------------------------------------------------------------------
// Lazy model references — break circular type inference with explicit casts
// ---------------------------------------------------------------------------
let _User: ModelDefinition<any>
let _Article: ModelDefinition<any>

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

export const User = defineModel("users", {
  columns: {
    id: t.string(26).primaryKey(),
    email: t.string(255).unique(),
    username: t.string(255).unique(),
    password: t.string(255),
    bio: t.text().nullable(),
    image: t.text().nullable(),
    createdAt: t.timestamp(),
    updatedAt: t.timestamp(),
  },
  relations: {
    articles: hasMany(() => _Article, { foreignKey: "authorId" }),
  },
  hidden: ["password"],
})
  .use(timestamps())
  .use(ulid())
_User = User

export const Tag = defineModel("tags", {
  columns: {
    id: t.string(26).primaryKey(),
    name: t.string(255).unique(),
  },
}).use(ulid())

export const Article = defineModel("articles", {
  columns: {
    id: t.string(26).primaryKey(),
    slug: t.string(255).unique(),
    title: t.string(255),
    description: t.text(),
    body: t.text(),
    authorId: t.string(26),
    createdAt: t.timestamp(),
    updatedAt: t.timestamp(),
  },
  relations: {
    author: belongsTo(() => _User),
    tags: manyToMany(() => Tag, {
      through: "article_tags",
      foreignPivotKey: "articleId",
      relatedPivotKey: "tagId",
    }),
    comments: hasMany(() => Comment, { foreignKey: "articleId" }),
    favoritedBy: manyToMany(() => _User, {
      through: "favorites",
      foreignPivotKey: "articleId",
      relatedPivotKey: "userId",
    }),
  },
})
  .use(timestamps())
  .use(ulid())
_Article = Article

export const ArticleTag = defineModel("article_tags", {
  columns: {
    articleId: t.string(26),
    tagId: t.string(26),
  },
})

export const Comment = defineModel("comments", {
  columns: {
    id: t.string(26).primaryKey(),
    articleId: t.string(26),
    authorId: t.string(26),
    body: t.text(),
    createdAt: t.timestamp(),
    updatedAt: t.timestamp(),
  },
  relations: {
    article: belongsTo(() => _Article),
    author: belongsTo(() => _User),
  },
})
  .use(timestamps())
  .use(ulid())

export const Favorite = defineModel("favorites", {
  columns: {
    userId: t.string(26),
    articleId: t.string(26),
  },
})

export const Follow = defineModel("follows", {
  columns: {
    followerId: t.string(26),
    followeeId: t.string(26),
  },
})

// ---------------------------------------------------------------------------
// Database setup
// ---------------------------------------------------------------------------

export async function createTables(client: Client): Promise<void> {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      bio TEXT,
      image TEXT,
      createdAt TEXT,
      updatedAt TEXT
    )
  `)

  await client.execute(`
    CREATE TABLE IF NOT EXISTS articles (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      body TEXT NOT NULL,
      authorId TEXT NOT NULL REFERENCES users(id),
      createdAt TEXT,
      updatedAt TEXT
    )
  `)

  await client.execute(`
    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE
    )
  `)

  await client.execute(`
    CREATE TABLE IF NOT EXISTS article_tags (
      articleId TEXT NOT NULL REFERENCES articles(id),
      tagId TEXT NOT NULL REFERENCES tags(id),
      PRIMARY KEY (articleId, tagId)
    )
  `)

  await client.execute(`
    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      articleId TEXT NOT NULL REFERENCES articles(id),
      authorId TEXT NOT NULL REFERENCES users(id),
      body TEXT NOT NULL,
      createdAt TEXT,
      updatedAt TEXT
    )
  `)

  await client.execute(`
    CREATE TABLE IF NOT EXISTS favorites (
      userId TEXT NOT NULL REFERENCES users(id),
      articleId TEXT NOT NULL REFERENCES articles(id),
      PRIMARY KEY (userId, articleId)
    )
  `)

  await client.execute(`
    CREATE TABLE IF NOT EXISTS follows (
      followerId TEXT NOT NULL REFERENCES users(id),
      followeeId TEXT NOT NULL REFERENCES users(id),
      PRIMARY KEY (followerId, followeeId)
    )
  `)
}

// ---------------------------------------------------------------------------
// Database + ORM instance (singleton, lazily created)
// ---------------------------------------------------------------------------

let _orm: ReturnType<typeof createORM> | null = null

/** Get or create the singleton ORM instance.
 *
 * When `dialect` is provided, a fresh ORM is created with it (bypassing the
 * singleton). This lets tests inject an in-memory database without affecting
 * the production singleton.
 */
export async function getORM(dialect?: LibsqlDialect): Promise<ReturnType<typeof createORM>> {
  if (dialect) {
    const orm = createORM({ dialect })
    orm.registerAll(User, Article, Tag, ArticleTag, Comment, Favorite, Follow)
    return orm
  }
  if (!_orm) {
    const client = createClient({ url: "file:conduit.db" })
    await client.execute("PRAGMA foreign_keys = ON")
    await createTables(client)
    _orm = createORM({ dialect: new LibsqlDialect({ client }) })
    _orm.registerAll(User, Article, Tag, ArticleTag, Comment, Favorite, Follow)
  }
  return _orm
}

// Lazily initialize on first import in development
if (process.env.NODE_ENV !== "test") {
  await getORM()
}
