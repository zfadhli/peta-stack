import { afterAll, beforeAll, describe, expect, it } from "bun:test"
import type { Hono } from "hono"
import { createApp } from "../src/index.js"
import { createLinkedAuthor, createTestORM, createUser } from "./setup.js"

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

describe("Authors API", () => {
  let adminCookie: string
  let authorCookie: string
  let authorUserId: string
  let authorId: string
  let userCookie: string

  beforeAll(async () => {
    // Admin user
    adminCookie = (
      await createUser(app, {
        email: "admin-authors@test.com",
        password: "password123",
        name: "Admin",
        role: "admin",
      })
    ).cookie

    // Author user — creates an author profile
    const authorUser = await createUser(app, {
      email: "author@test.com",
      password: "password123",
      name: "Author",
      role: "author",
    })
    authorCookie = authorUser.cookie
    authorUserId = authorUser.userId

    // Create the linked author record
    const a = await createLinkedAuthor(authorUserId, "Test Author")
    authorId = a.id

    // Regular user (no author profile)
    userCookie = (
      await createUser(app, {
        email: "plain-user@test.com",
        password: "password123",
        name: "User",
        role: "user",
      })
    ).cookie
  })

  it("GET /api/authors → 200 returns paginated list", async () => {
    const res = await req("GET", "/api/authors?page=1&limit=10")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toBeArray()
    expect(body.total).toBeNumber()
    expect(body.perPage).toBeNumber()
  })

  it("POST /api/authors → 403 for regular user (not author role)", async () => {
    const res = await req("POST", "/api/authors", { name: "Hacker", bio: "Not allowed" }, userCookie)
    expect(res.status).toBe(403)
  })

  it("POST /api/authors → 201 for author role user", async () => {
    const res = await req("POST", "/api/authors", { name: "New Author", bio: "My bio" }, authorCookie)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.name).toBe("New Author")
    expect(body.id).toBeString()
  })

  it("POST /api/authors auto-sets userId from session", async () => {
    const res = await req("POST", "/api/authors", { name: "Another Author" }, authorCookie)
    expect(res.status).toBe(201)
    const body = await res.json()
    // Verify via direct DB query
    const { Author } = await import("../src/db/schema.js")
    const author = await Author.find(body.id)
    expect(author?.get<string>("userId")).toBe(authorUserId)
  })

  it("GET /api/authors/:id → 200 returns author with books", async () => {
    const res = await req("GET", `/api/authors/${authorId}`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.name).toBe("Test Author")
    expect(body.books).toBeArray()
  })

  it("GET /api/authors/:id → 404 for non-existent", async () => {
    const res = await req("GET", "/api/authors/nonexistent")
    expect(res.status).toBe(404)
  })

  it("PATCH /api/authors/:id → 200 for owner author", async () => {
    const res = await req("PATCH", `/api/authors/${authorId}`, { name: "Updated Author" }, authorCookie)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.name).toBe("Updated Author")
  })

  it("PATCH /api/authors/:id → 403 for non-owner author", async () => {
    // Create another author user
    const otherUser = await createUser(app, {
      email: "other-author@test.com",
      password: "password123",
      name: "Other",
      role: "author",
    })
    const _otherAuthor = await createLinkedAuthor(otherUser.userId, "Other Author")

    const res = await req("PATCH", `/api/authors/${authorId}`, { name: "Hacked" }, otherUser.cookie)
    expect(res.status).toBe(403)
  })

  it("PATCH /api/authors/:id → 200 for admin", async () => {
    const res = await req("PATCH", `/api/authors/${authorId}`, { name: "Admin Updated" }, adminCookie)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.name).toBe("Admin Updated")
  })

  it("DELETE /api/authors/:id → 403 for non-owner author", async () => {
    const otherUser = await createUser(app, {
      email: "other-author2@test.com",
      password: "password123",
      name: "Other2",
      role: "author",
    })
    const _otherAuthor = await createLinkedAuthor(otherUser.userId, "Other Author 2")

    const res = await req("DELETE", `/api/authors/${authorId}`, undefined, otherUser.cookie)
    expect(res.status).toBe(403)
  })

  it("DELETE /api/authors/:id → 204 for owner", async () => {
    // Create a fresh author+user pair for cleanup
    const freshUser = await createUser(app, {
      email: "fresh-author@test.com",
      password: "password123",
      name: "Fresh",
      role: "author",
    })
    const freshAuthor = await createLinkedAuthor(freshUser.userId, "Fresh Author")

    const res = await req("DELETE", `/api/authors/${freshAuthor.id}`, undefined, freshUser.cookie)
    expect(res.status).toBe(204)
  })

  it("DELETE /api/authors/:id → 409 when author has books", async () => {
    const { Book } = await import("../src/db/schema.js")
    // Create a book for this author
    await Book.insert({ title: "Existing Book", isbn: "9780000000002", price: 10, authorId, inStock: true })

    const res = await req("DELETE", `/api/authors/${authorId}`, undefined, adminCookie)
    expect(res.status).toBe(409)
  })
})
