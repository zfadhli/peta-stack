import { Database } from "bun:sqlite"
import { BunSqliteDialect } from "kysely-bun-sqlite"
import type { ModelDefinition } from "peta-orm"
import {
  belongsTo,
  t as columnTypes,
  createArkTypeSchemaConfig,
  createPeta,
  defineModel,
  hasMany,
  manyToMany,
} from "peta-orm"

// ---------------------------------------------------------------------------
// Column type factory
// ---------------------------------------------------------------------------
const t = columnTypes({ schema: createArkTypeSchemaConfig() })

// ---------------------------------------------------------------------------
// Lazy model references — break circular type inference with explicit casts
// ---------------------------------------------------------------------------
let _User: ModelDefinition
let _Article: ModelDefinition

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

export const User = defineModel("users", {
  columns: {
    id: t.integer().primaryKey(),
    email: t.string(255).unique(),
    username: t.string(255).unique(),
    password: t.string(255),
    bio: t.text().nullable(),
    image: t.text().nullable(),
  },
  relations: {
    articles: hasMany(() => _Article, { foreignKey: "authorId" }),
  },
  hidden: ["password"],
})
_User = User

export const Tag = defineModel("tags", {
  columns: {
    id: t.integer().primaryKey(),
    name: t.string(255).unique(),
  },
})

export const Article: ModelDefinition = defineModel("articles", {
  columns: {
    id: t.integer().primaryKey(),
    slug: t.string(255).unique(),
    title: t.string(255),
    description: t.text(),
    body: t.text(),
    authorId: t.integer(),
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
_Article = Article

export const ArticleTag = defineModel("article_tags", {
  columns: {
    articleId: t.integer(),
    tagId: t.integer(),
  },
})

export const Comment = defineModel("comments", {
  columns: {
    id: t.integer().primaryKey(),
    articleId: t.integer(),
    authorId: t.integer(),
    body: t.text(),
  },
  relations: {
    article: belongsTo(() => _Article),
    author: belongsTo(() => _User),
  },
})

export const Favorite = defineModel("favorites", {
  columns: {
    userId: t.integer(),
    articleId: t.integer(),
  },
})

export const Follow = defineModel("follows", {
  columns: {
    followerId: t.integer(),
    followeeId: t.integer(),
  },
})

// ---------------------------------------------------------------------------
// Database setup
// ---------------------------------------------------------------------------

export function createTables(database: Database): void {
  database.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      bio TEXT,
      image TEXT,
      createdAt TEXT,
      updatedAt TEXT
    )
  `)

  database.run(`
    CREATE TABLE IF NOT EXISTS articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      body TEXT NOT NULL,
      authorId INTEGER NOT NULL REFERENCES users(id),
      createdAt TEXT,
      updatedAt TEXT
    )
  `)

  database.run(`
    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    )
  `)

  database.run(`
    CREATE TABLE IF NOT EXISTS article_tags (
      articleId INTEGER NOT NULL REFERENCES articles(id),
      tagId INTEGER NOT NULL REFERENCES tags(id),
      PRIMARY KEY (articleId, tagId)
    )
  `)

  database.run(`
    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      articleId INTEGER NOT NULL REFERENCES articles(id),
      authorId INTEGER NOT NULL REFERENCES users(id),
      body TEXT NOT NULL,
      createdAt TEXT,
      updatedAt TEXT
    )
  `)

  database.run(`
    CREATE TABLE IF NOT EXISTS favorites (
      userId INTEGER NOT NULL REFERENCES users(id),
      articleId INTEGER NOT NULL REFERENCES articles(id),
      PRIMARY KEY (userId, articleId)
    )
  `)

  database.run(`
    CREATE TABLE IF NOT EXISTS follows (
      followerId INTEGER NOT NULL REFERENCES users(id),
      followeeId INTEGER NOT NULL REFERENCES users(id),
      PRIMARY KEY (followerId, followeeId)
    )
  `)
}

// ---------------------------------------------------------------------------
// Database + Peta instance (singleton, lazily created)
// ---------------------------------------------------------------------------

let _peta: ReturnType<typeof createPeta> | null = null

export function getPeta(): ReturnType<typeof createPeta> {
  if (!_peta) {
    const database = new Database("conduit.db", { create: true })
    database.run("PRAGMA foreign_keys = ON")
    createTables(database)
    _peta = createPeta({ dialect: new BunSqliteDialect({ database }) })
    _peta.registerAll(User, Article, Tag, ArticleTag, Comment, Favorite, Follow)

    // Timestamps for models that have createdAt/updatedAt
    User.registerTimestamps()
    Article.registerTimestamps()
    Comment.registerTimestamps()
  }
  return _peta
}

// Lazily initialize on first import in development
if (process.env.NODE_ENV !== "test") {
  getPeta()
}
