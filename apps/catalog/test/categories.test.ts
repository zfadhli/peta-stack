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

describe("Categories API", () => {
  let adminCookie: string
  let userCookie: string

  beforeAll(async () => {
    adminCookie = (
      await createUser(app, {
        email: "admin@test.com",
        password: "password123",
        name: "Admin",
        role: "admin",
      })
    ).cookie

    userCookie = (
      await createUser(app, {
        email: "user@test.com",
        password: "password123",
        name: "User",
        role: "user",
      })
    ).cookie
  })

  it("GET /api/categories → 200 returns empty array initially", async () => {
    const res = await req("GET", "/api/categories")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toBeArray()
    expect(body).toBeEmpty()
  })

  it("POST /api/categories → 403 for non-admin user", async () => {
    const res = await req("POST", "/api/categories", { name: "Test", description: "Test" }, userCookie)
    expect(res.status).toBe(403)
  })

  it("POST /api/categories → 201 for admin", async () => {
    const res = await req("POST", "/api/categories", { name: "Fiction", description: "Fiction books" }, adminCookie)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.name).toBe("Fiction")
    expect(body.id).toBeString()
  })

  it("POST /api/categories → 409 duplicate name", async () => {
    const res = await req("POST", "/api/categories", { name: "Fiction" }, adminCookie)
    expect(res.status).toBe(409)
  })

  it("GET /api/categories → 200 returns categories", async () => {
    const res = await req("GET", "/api/categories")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.length).toBeGreaterThanOrEqual(1)
  })

  it("GET /api/categories/:id → 200 returns a category", async () => {
    const createRes = await req("POST", "/api/categories", { name: "Science", description: "Science" }, adminCookie)
    const created = await createRes.json()

    const res = await req("GET", `/api/categories/${created.id}`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.name).toBe("Science")
  })

  it("GET /api/categories/:id → 404 for non-existent id", async () => {
    const res = await req("GET", "/api/categories/nonexistent")
    expect(res.status).toBe(404)
  })

  it("PATCH /api/categories/:id → 403 for non-admin", async () => {
    const createRes = await req("POST", "/api/categories", { name: "ToPatch", description: "Old" }, adminCookie)
    const created = await createRes.json()

    const res = await req("PATCH", `/api/categories/${created.id}`, { name: "Patched" }, userCookie)
    expect(res.status).toBe(403)
  })

  it("PATCH /api/categories/:id → 200 for admin", async () => {
    const createRes = await req("POST", "/api/categories", { name: "ToUpdate", description: "Old" }, adminCookie)
    const created = await createRes.json()

    const res = await req(
      "PATCH",
      `/api/categories/${created.id}`,
      { name: "Updated", description: "New" },
      adminCookie,
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.name).toBe("Updated")
    expect(body.description).toBe("New")
  })

  it("DELETE /api/categories/:id → 403 for non-admin", async () => {
    const createRes = await req("POST", "/api/categories", { name: "ToDeleteByUser" }, adminCookie)
    const created = await createRes.json()

    const res = await req("DELETE", `/api/categories/${created.id}`, undefined, userCookie)
    expect(res.status).toBe(403)
  })

  it("DELETE /api/categories/:id → 204 for admin", async () => {
    const createRes = await req("POST", "/api/categories", { name: "ToDelete", description: "Bye" }, adminCookie)
    const created = await createRes.json()

    const res = await req("DELETE", `/api/categories/${created.id}`, undefined, adminCookie)
    expect(res.status).toBe(204)
  })

  it("DELETE /api/categories/:id → 409 when category has books", async () => {
    const { Author, Book, BookCategory } = await import("../src/db/schema.js")

    // Create author and book directly (bypass API for setup)
    const adminUser = await createUser(app, {
      email: "admin2@test.com",
      password: "password123",
      name: "Admin2",
      role: "admin",
    })
    const author = await Author.insert({ name: "Test Auth", userId: adminUser.userId })

    // Create category directly via admin API
    const catRes = await req("POST", "/api/categories", { name: "HasBooks99" }, adminCookie)
    expect(catRes.status).toBe(201)
    const cat = await catRes.json()

    // Create book directly (bypass API)
    const book = await Book.insert({
      title: "Linked Book",
      isbn: "9780000000098",
      price: 10,
      authorId: author.get<string>("id"),
      inStock: true,
    })

    // Link book to category directly
    await BookCategory.insert({
      bookId: book.get<string>("id"),
      categoryId: cat.id,
    })

    // Now try to delete — should be 409
    const res = await req("DELETE", `/api/categories/${cat.id}`, undefined, adminCookie)
    expect(res.status).toBe(409)
  })
})
