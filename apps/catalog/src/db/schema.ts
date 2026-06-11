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
let _Author: ModelDefinition
let _Book: ModelDefinition
let _Category: ModelDefinition

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

export const User = defineModel("users", {
  columns: {
    id: t.integer().primaryKey(),
    email: t.text().unique(),
    passwordHash: t.string(255),
    name: t.string(255),
    role: t.enum("admin", "user"),
    deletedAt: t.timestamp().nullable(),
  },
  hidden: ["passwordHash", "deletedAt"],
})

export const Author: ModelDefinition = defineModel("authors", {
  columns: {
    id: t.integer().primaryKey(),
    name: t.string(255),
    bio: t.text().nullable(),
    deletedAt: t.timestamp().nullable(),
  },
  relations: {
    books: hasMany(() => _Book, { foreignKey: "authorId" }),
  },
  hidden: ["deletedAt"],
})
_Author = Author

export const Book: ModelDefinition = defineModel("books", {
  columns: {
    id: t.integer().primaryKey(),
    title: t.string(255),
    isbn: t.string(13).unique(),
    description: t.text().nullable(),
    publishedYear: t.integer().nullable(),
    price: t.float(),
    authorId: t.integer(),
    coverImage: t.text().nullable(),
    inStock: t.boolean(),
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
_Book = Book

export const Category: ModelDefinition = defineModel("categories", {
  columns: {
    id: t.integer().primaryKey(),
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
})
_Category = Category

export const BookCategory = defineModel("book_categories", {
  columns: {
    bookId: t.integer(),
    categoryId: t.integer(),
  },
})

export const Review = defineModel("reviews", {
  columns: {
    id: t.integer().primaryKey(),
    bookId: t.integer(),
    userId: t.integer(),
    rating: t.integer().min(1).max(5),
    body: t.text().nullable(),
    createdAt: t.timestamp(),
  },
  relations: {
    book: belongsTo(() => _Book),
    user: belongsTo(() => User),
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
      passwordHash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      deletedAt TEXT,
      createdAt TEXT,
      updatedAt TEXT
    )
  `)

  database.run(`
    CREATE TABLE IF NOT EXISTS authors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      bio TEXT,
      deletedAt TEXT,
      createdAt TEXT,
      updatedAt TEXT
    )
  `)

  database.run(`
    CREATE TABLE IF NOT EXISTS books (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      isbn TEXT NOT NULL UNIQUE,
      description TEXT,
      publishedYear INTEGER,
      price REAL NOT NULL DEFAULT 0,
      authorId INTEGER NOT NULL REFERENCES authors(id),
      coverImage TEXT,
      inStock INTEGER NOT NULL DEFAULT 1,
      deletedAt TEXT,
      createdAt TEXT,
      updatedAt TEXT
    )
  `)

  database.run(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT
    )
  `)

  database.run(`
    CREATE TABLE IF NOT EXISTS book_categories (
      bookId INTEGER NOT NULL REFERENCES books(id),
      categoryId INTEGER NOT NULL REFERENCES categories(id),
      PRIMARY KEY (bookId, categoryId)
    )
  `)

  database.run(`
    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bookId INTEGER NOT NULL REFERENCES books(id),
      userId INTEGER NOT NULL REFERENCES users(id),
      rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
      body TEXT,
      createdAt TEXT NOT NULL
    )
  `)
}

// ---------------------------------------------------------------------------
// Database + Peta instance (singleton, lazily created)
// ---------------------------------------------------------------------------

let _peta: ReturnType<typeof createPeta> | null = null

export function getPeta(): ReturnType<typeof createPeta> {
  if (!_peta) {
    const database = new Database("catalog.db", { create: true })
    createTables(database)
    _peta = createPeta({ dialect: new BunSqliteDialect({ database }) })
    _peta.registerAll(User, Author, Book, Category, BookCategory, Review)

    // Timestamps for models that have createdAt/updatedAt
    User.registerTimestamps()
    Author.registerTimestamps()
    Book.registerTimestamps()

    // Soft deletes for User, Book, and Author
    User.registerSoftDeletes()
    Book.registerSoftDeletes()
    Author.registerSoftDeletes()
  }
  return _peta
}

// Lazily initialize on first import in development
if (process.env.NODE_ENV !== "test") {
  getPeta()
}
