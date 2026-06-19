import { afterAll, beforeAll, describe, expect, it } from "bun:test"
import type { Hono } from "hono"
import { createApp } from "../src/index.js"
import { createTestORM, createUser } from "./setup.js"

let app: Hono
let close: () => void

beforeAll(async () => {
  const { orm, client } = await createTestORM()
  app = await createApp(orm)
  close = () => client.close()
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

describe("Reviews API", () => {
  let userCookie: string
  let userId: string
  let anotherUserCookie: string
  let _anotherUserId: string
  let bookId: string

  beforeAll(async () => {
    const { Author, Book } = await import("../src/db/schema.js")

    // Create users directly via ORM
    const _admin = await createUser(app, {
      email: "admin-rev@test.com",
      password: "password123",
      name: "Admin",
      role: "admin",
    })
    const authorUser = await createUser(app, {
      email: "author-rev@test.com",
      password: "password123",
      name: "Author",
      role: "author",
    })

    // Create author record linked to the author user
    const author = await Author.insert({
      name: "Reviewable Author",
      bio: "Bio",
      userId: authorUser.userId,
    })
    const authorId = author.get("id")

    // Create a book directly (bypass API)
    const book = await Book.insert({
      title: "Reviewable Book",
      isbn: "9780000000030",
      price: 9.99,
      authorId,
      inStock: true,
    })
    bookId = book.get("id")

    // Create reviewer users
    const user = await createUser(app, {
      email: "reviewer@test.com",
      password: "password123",
      name: "Reviewer",
      role: "user",
    })
    userCookie = user.cookie
    userId = user.userId

    const another = await createUser(app, {
      email: "another-reviewer@test.com",
      password: "password123",
      name: "Another",
      role: "user",
    })
    anotherUserCookie = another.cookie
    _anotherUserId = another.userId
  })

  it("GET /api/books/:id/reviews → 200 returns empty list initially", async () => {
    const res = await req("GET", `/api/books/${bookId}/reviews?page=1&limit=10`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toBeArray()
    expect(body.total).toBe(0)
  })

  it("POST /api/books/:id/reviews → 401 when not authenticated", async () => {
    const res = await req("POST", `/api/books/${bookId}/reviews`, { rating: 5, body: "Great!" })
    expect(res.status).toBe(401)
  })

  it("POST /api/books/:id/reviews → 201 for authenticated user", async () => {
    const res = await req("POST", `/api/books/${bookId}/reviews`, { rating: 5, body: "Amazing book!" }, userCookie)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.rating).toBe(5)
    expect(body.body).toBe("Amazing book!")
    expect(body.bookId).toBe(bookId)
    expect(body.userId).toBe(userId)
  })

  it("POST /api/books/:id/reviews → 404 for non-existent book", async () => {
    const res = await req("POST", "/api/books/nonexistent/reviews", { rating: 3 }, userCookie)
    expect(res.status).toBe(404)
  })

  it("GET /api/books/:id/reviews → 200 returns reviews", async () => {
    const res = await req("GET", `/api/books/${bookId}/reviews?page=1&limit=10`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.length).toBeGreaterThanOrEqual(1)
  })

  it("GET /api/books/:id/reviews/:reviewId → 200 returns a review", async () => {
    const createRes = await req("POST", `/api/books/${bookId}/reviews`, { rating: 4, body: "Nice" }, userCookie)
    const created = await createRes.json()

    const res = await req("GET", `/api/books/${bookId}/reviews/${created.id}`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.rating).toBe(4)
  })

  it("PATCH /api/books/:id/reviews/:reviewId → 200 for owner", async () => {
    const createRes = await req("POST", `/api/books/${bookId}/reviews`, { rating: 3, body: "Meh" }, userCookie)
    const created = await createRes.json()

    const res = await req(
      "PATCH",
      `/api/books/${bookId}/reviews/${created.id}`,
      { rating: 4, body: "Updated" },
      userCookie,
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.rating).toBe(4)
    expect(body.body).toBe("Updated")
  })

  it("PATCH /api/books/:id/reviews/:reviewId → 403 for non-owner", async () => {
    const createRes = await req("POST", `/api/books/${bookId}/reviews`, { rating: 5, body: "Mine" }, userCookie)
    const created = await createRes.json()

    const res = await req("PATCH", `/api/books/${bookId}/reviews/${created.id}`, { rating: 1 }, anotherUserCookie)
    expect(res.status).toBe(403)
  })

  it("DELETE /api/books/:id/reviews/:reviewId → 204 for owner", async () => {
    const createRes = await req("POST", `/api/books/${bookId}/reviews`, { rating: 2, body: "Will delete" }, userCookie)
    const created = await createRes.json()

    const res = await req("DELETE", `/api/books/${bookId}/reviews/${created.id}`, undefined, userCookie)
    expect(res.status).toBe(204)
  })

  it("DELETE /api/books/:id/reviews/:reviewId → 403 for non-owner", async () => {
    const createRes = await req("POST", `/api/books/${bookId}/reviews`, { rating: 4, body: "Keep me" }, userCookie)
    const created = await createRes.json()

    const res = await req("DELETE", `/api/books/${bookId}/reviews/${created.id}`, undefined, anotherUserCookie)
    expect(res.status).toBe(403)
  })
})
