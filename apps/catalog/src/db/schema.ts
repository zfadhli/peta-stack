import type { Client } from "@libsql/client"
import { createClient } from "@libsql/client"
import { LibsqlDialect } from "@libsql/kysely-libsql"
import type { ModelDefinition } from "peta-orm"
import {
  belongsTo,
  createORM,
  defineModel,
  hasMany,
  hasOne,
  manyToMany,
  softDeletes,
  t,
  timestamps,
  ulid,
} from "peta-orm"

// ---------------------------------------------------------------------------
// Lazy model references — break circular type inference with explicit casts
// ---------------------------------------------------------------------------
let _Author: ModelDefinition<any>
let _Book: ModelDefinition<any>
let _Category: ModelDefinition<any>

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

export const User = defineModel("users", {
  columns: {
    id: t.string(26).primaryKey(),
    email: t.text().unique(),
    passwordHash: t.string(255),
    name: t.string(255),
    role: t.enum("admin", "user", "author"),
    createdAt: t.timestamp().nullable(),
    updatedAt: t.timestamp().nullable(),
    deletedAt: t.timestamp().nullable(),
  },
  relations: {
    author: hasOne(() => _Author, { foreignKey: "userId" }),
  },
  hidden: ["passwordHash", "deletedAt"],
})
  .use(timestamps())
  .use(softDeletes())
  .use(ulid())

export const Author = defineModel("authors", {
  columns: {
    id: t.string(26).primaryKey(),
    name: t.string(255),
    bio: t.text().nullable(),
    userId: t.string(26).nullable(),
    createdAt: t.timestamp().nullable(),
    updatedAt: t.timestamp().nullable(),
    deletedAt: t.timestamp().nullable(),
  },
  relations: {
    user: belongsTo(() => User),
    books: hasMany(() => _Book, { foreignKey: "authorId" }),
  },
  hidden: ["deletedAt"],
})
  .use(timestamps())
  .use(softDeletes())
  .use(ulid())
_Author = Author

export const Book = defineModel("books", {
  columns: {
    id: t.string(26).primaryKey(),
    title: t.string(255),
    isbn: t.string(13).unique(),
    description: t.text().nullable(),
    publishedYear: t.integer().nullable(),
    price: t.float(),
    authorId: t.string(26),
    coverImage: t.text().nullable(),
    inStock: t.boolean(),
    createdAt: t.timestamp().nullable(),
    updatedAt: t.timestamp().nullable(),
    deletedAt: t.timestamp().nullable(),
  },
  relations: {
    author: belongsTo(() => _Author),
    categories: manyToMany(() => _Category, {
      through: "book_categories",
      foreignPivotKey: "bookId",
      relatedPivotKey: "categoryId",
    }),
    reviews: hasMany(() => Review, { foreignKey: "bookId" }),
  },
  hidden: ["deletedAt"],
  casts: {
    inStock: "boolean",
  },
})
  .use(timestamps())
  .use(softDeletes())
  .use(ulid())
_Book = Book

export const Category = defineModel("categories", {
  columns: {
    id: t.string(26).primaryKey(),
    name: t.string(255).unique(),
    description: t.text().nullable(),
  },
  relations: {
    books: manyToMany(() => _Book, {
      through: "book_categories",
      foreignPivotKey: "categoryId",
      relatedPivotKey: "bookId",
    }),
  },
}).use(ulid())
_Category = Category

export const BookCategory = defineModel("book_categories", {
  columns: {
    bookId: t.string(26),
    categoryId: t.string(26),
  },
})

export const Review = defineModel("reviews", {
  columns: {
    id: t.string(26).primaryKey(),
    bookId: t.string(26),
    userId: t.string(26),
    rating: t.integer().min(1).max(5),
    body: t.text().nullable(),
    createdAt: t.timestamp(),
  },
  relations: {
    book: belongsTo(() => _Book),
    user: belongsTo(() => User),
  },
}).use(ulid())

// ---------------------------------------------------------------------------
// Database setup
// ---------------------------------------------------------------------------

export async function createTables(client: Client): Promise<void> {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      passwordHash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      deletedAt TEXT,
      createdAt TEXT,
      updatedAt TEXT
    )
  `)

  await client.execute(`
    CREATE TABLE IF NOT EXISTS authors (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      bio TEXT,
      userId TEXT REFERENCES users(id),
      deletedAt TEXT,
      createdAt TEXT,
      updatedAt TEXT
    )
  `)

  await client.execute(`
    CREATE TABLE IF NOT EXISTS books (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      isbn TEXT NOT NULL UNIQUE,
      description TEXT,
      publishedYear INTEGER,
      price REAL NOT NULL DEFAULT 0,
      authorId TEXT NOT NULL REFERENCES authors(id),
      coverImage TEXT,
      inStock INTEGER NOT NULL DEFAULT 1,
      deletedAt TEXT,
      createdAt TEXT,
      updatedAt TEXT
    )
  `)

  await client.execute(`
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT
    )
  `)

  await client.execute(`
    CREATE TABLE IF NOT EXISTS book_categories (
      bookId TEXT NOT NULL REFERENCES books(id),
      categoryId TEXT NOT NULL REFERENCES categories(id),
      PRIMARY KEY (bookId, categoryId)
    )
  `)

  await client.execute(`
    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY,
      bookId TEXT NOT NULL REFERENCES books(id),
      userId TEXT NOT NULL REFERENCES users(id),
      rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
      body TEXT,
      createdAt TEXT NOT NULL
    )
  `)
}

// ---------------------------------------------------------------------------
// Database + Peta instance (singleton, lazily created)
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
    orm.registerAll(User, Author, Book, Category, BookCategory, Review)
    return orm
  }
  if (!_orm) {
    const client = createClient({ url: "file:catalog.db" })
    await client.execute("PRAGMA foreign_keys = ON")
    await createTables(client)
    _orm = createORM({ dialect: new LibsqlDialect({ client }) })
    _orm.registerAll(User, Author, Book, Category, BookCategory, Review)
  }
  return _orm
}

// Note: No eager initialization at module scope.
// getORM() is called explicitly in the entry point (index.ts) and in route handlers.
// This avoids module-level side effects that break testing and HMR.
