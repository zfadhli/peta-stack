import { afterAll, beforeAll, describe, expect, it } from "bun:test"
import type { Hono } from "hono"
import { createApp } from "../src/index.js"
import { createCategory, createLinkedAuthor, createTestORM, createUser } from "./setup.js"

let app: Hono
let close: () => void

beforeAll(() => {
  const { orm, db } = createTestORM()
  app = createApp(orm)
  close = () => db.close()
})

afterAll(() => {
  close?.()
})

function req(method: string, path: string, body?: Record<string, unknown>, cookie?: string): Promise<Response> {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (cookie) headers.Cookie = cookie
  const init: RequestInit = { method, headers }
  if (body) init.body = JSON.stringify(body)
  return app.fetch(new Request(`http://localhost${path}`, init))
}

describe("Books API", () => {
  let adminCookie: string
  let authorCookie: string
  let authorId: string
  let userCookie: string
  let categoryId: string

  beforeAll(async () => {
    const { Author, Book } = await import("../src/db/schema.js")

    // Admin user
    const adminUser = await createUser(app, {
      email: "admin-books@test.com",
      password: "password123",
      name: "Admin",
      role: "admin",
    })
    adminCookie = adminUser.cookie

    // Author user with linked author
    const authorUser = await createUser(app, {
      email: "author-books@test.com",
      password: "password123",
      name: "Author",
      role: "author",
    })
    authorCookie = authorUser.cookie
    const linked = await createLinkedAuthor(authorUser.userId, "Book Author")
    authorId = linked.id

    // Regular user (no author profile)
    userCookie = (
      await createUser(app, {
        email: "user-books@test.com",
        password: "password123",
        name: "User",
        role: "user",
      })
    ).cookie

    // Create a category for tests
    const cat = await createCategory("BookCategory")
    categoryId = cat.id
  })

  it("GET /api/books → 200 returns paginated empty list", async () => {
    const res = await req("GET", "/api/books?page=1&limit=10")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toBeArray()
    expect(body.total).toBe(0)
  })

  it("POST /api/books → 403 for user without author profile", async () => {
    const res = await req(
      "POST",
      "/api/books",
      {
        title: "Hacked Book",
        isbn: "9780000000010",
        price: 10,
        authorId: "some-id",
        inStock: true,
      },
      userCookie,
    )
    expect(res.status).toBe(403)
  })

  it("POST /api/books → 201 for author, auto-sets authorId", async () => {
    const res = await req(
      "POST",
      "/api/books",
      {
        title: "My Book",
        isbn: "9780000000011",
        price: 14.99,
        inStock: true,
      },
      authorCookie,
    )
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.title).toBe("My Book")
    expect(body.authorId).toBe(authorId)
    expect(body.id).toBeString()
  })

  it("POST /api/books → 201 for admin with explicit authorId", async () => {
    const res = await req(
      "POST",
      "/api/books",
      {
        title: "Admin Book",
        isbn: "9780000000012",
        price: 9.99,
        authorId,
        inStock: true,
      },
      adminCookie,
    )
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.title).toBe("Admin Book")
    expect(body.authorId).toBe(authorId)
  })

  it("POST /api/books → 201 with categoryIds", async () => {
    const res = await req(
      "POST",
      "/api/books",
      {
        title: "Categorized Book",
        isbn: "9780000000013",
        price: 12.99,
        authorId,
        inStock: true,
        categoryIds: [categoryId],
      },
      adminCookie,
    )
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.title).toBe("Categorized Book")
  })

  it("GET /api/books → 200 with filters", async () => {
    const { Book } = await import("../src/db/schema.js")
    await Book.insert({ title: "Filterable", isbn: "9780000000099", price: 5, authorId, inStock: true })

    const res = await req("GET", `/api/books?page=1&limit=10&authorId=${authorId}`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.length).toBeGreaterThanOrEqual(1)
  })

  it("GET /api/books/:id → 200 returns a book", async () => {
    const { Book } = await import("../src/db/schema.js")
    const book = await Book.insert({
      title: "Specific Book",
      isbn: "9780000000014",
      price: 5.99,
      authorId,
      inStock: true,
    })

    const res = await req("GET", `/api/books/${book.get<string>("id")}`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.title).toBe("Specific Book")
  })

  it("GET /api/books/:id → 404 for non-existent", async () => {
    const res = await req("GET", "/api/books/nonexistent")
    expect(res.status).toBe(404)
  })

  it("PATCH /api/books/:id → 200 for owner author", async () => {
    const { Book } = await import("../src/db/schema.js")
    const book = await Book.insert({ title: "Patchable", isbn: "9780000000015", price: 8.99, authorId, inStock: true })
    const bookId = book.get<string>("id")

    const res = await req("PATCH", `/api/books/${bookId}`, { title: "Patched", price: 11.99 }, authorCookie)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.title).toBe("Patched")
    expect(body.price).toBe(11.99)
  })

  it("PATCH /api/books/:id → 403 for non-owner author", async () => {
    const { Book } = await import("../src/db/schema.js")
    const otherUser = await createUser(app, {
      email: "other-book-auth@test.com",
      password: "password123",
      name: "Other",
      role: "author",
    })
    await createLinkedAuthor(otherUser.userId, "Other Book Auth")
    const book = await Book.insert({ title: "Not Yours", isbn: "9780000000016", price: 7.99, authorId, inStock: true })
    const bookId = book.get<string>("id")

    const res = await req("PATCH", `/api/books/${bookId}`, { title: "Hacked" }, otherUser.cookie)
    expect(res.status).toBe(403)
  })

  it("PATCH /api/books/:id → 200 for admin", async () => {
    const { Book } = await import("../src/db/schema.js")
    const book = await Book.insert({ title: "Admin Edit", isbn: "9780000000017", price: 6.99, authorId, inStock: true })
    const bookId = book.get<string>("id")

    const res = await req("PATCH", `/api/books/${bookId}`, { title: "Admin Edited" }, adminCookie)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.title).toBe("Admin Edited")
  })

  it("PATCH /api/books/:id → 200 syncs categories", async () => {
    const { Book } = await import("../src/db/schema.js")
    const cat2 = await createCategory("SyncCat")
    const book = await Book.insert({
      title: "Category Sync",
      isbn: "9780000000018",
      price: 5.99,
      authorId,
      inStock: true,
    })
    const bookId = book.get<string>("id")

    const res = await req("PATCH", `/api/books/${bookId}`, { categoryIds: [cat2.id] }, adminCookie)
    expect(res.status).toBe(200)
  })

  it("DELETE /api/books/:id → 204 for owner", async () => {
    const { Book } = await import("../src/db/schema.js")
    const book = await Book.insert({ title: "Delete Me", isbn: "9780000000019", price: 4.99, authorId, inStock: true })
    const bookId = book.get<string>("id")

    const res = await req("DELETE", `/api/books/${bookId}`, undefined, authorCookie)
    expect(res.status).toBe(204)
  })

  it("DELETE /api/books/:id → 403 for non-owner author", async () => {
    const { Book } = await import("../src/db/schema.js")
    const otherUser = await createUser(app, {
      email: "other-book-del@test.com",
      password: "password123",
      name: "OtherDel",
      role: "author",
    })
    await createLinkedAuthor(otherUser.userId, "Other Del Auth")
    const book = await Book.insert({
      title: "Not Yours Del",
      isbn: "9780000000020",
      price: 3.99,
      authorId,
      inStock: true,
    })
    const bookId = book.get<string>("id")

    const res = await req("DELETE", `/api/books/${bookId}`, undefined, otherUser.cookie)
    expect(res.status).toBe(403)
  })

  it("DELETE /api/books/:id → 204 for admin", async () => {
    const { Book } = await import("../src/db/schema.js")
    const book = await Book.insert({
      title: "Admin Delete",
      isbn: "9780000000021",
      price: 2.99,
      authorId,
      inStock: true,
    })
    const bookId = book.get<string>("id")

    const res = await req("DELETE", `/api/books/${bookId}`, undefined, adminCookie)
    expect(res.status).toBe(204)
  })
})
