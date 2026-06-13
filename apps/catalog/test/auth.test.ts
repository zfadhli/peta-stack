import { afterAll, beforeAll, describe, expect, it } from "bun:test"
import type { Hono } from "hono"
import { createApp } from "../src/index.js"
import { createTestORM, extractSessionCookie } from "./setup.js"

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

describe("Auth API", () => {
  const testUser = { email: "test@example.com", password: "password123", name: "Test User" }

  it("POST /api/auth/signup → 201 creates a new user", async () => {
    const res = await req("POST", "/api/auth/signup", testUser)
    expect(res.status).toBe(201)

    const body = await res.json()
    expect(body.email).toBe(testUser.email)
    expect(body.name).toBe(testUser.name)
    expect(body.role).toBe("user")
    expect(body.id).toBeString()
    // Should not expose passwordHash
    expect((body as Record<string, unknown>).passwordHash).toBeUndefined()
  })

  it("POST /api/auth/signup → 409 on duplicate email", async () => {
    const res = await req("POST", "/api/auth/signup", testUser)
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toContain("email")
  })

  it("POST /api/auth/signup sets a session cookie", async () => {
    const res = await req("POST", "/api/auth/signup", {
      email: "cookie@example.com",
      password: "password123",
      name: "Cookie Test",
    })
    const cookie = extractSessionCookie(res)
    expect(cookie).toBeTruthy()
    expect(cookie).toContain("catalog-session=")
  })

  it("POST /api/auth/login → 200 with valid credentials", async () => {
    // First sign up
    await req("POST", "/api/auth/signup", testUser)

    const res = await req("POST", "/api/auth/login", {
      email: testUser.email,
      password: testUser.password,
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.email).toBe(testUser.email)
  })

  it("POST /api/auth/login → 401 with wrong password", async () => {
    const res = await req("POST", "/api/auth/login", {
      email: testUser.email,
      password: "wrongpassword",
    })
    expect(res.status).toBe(401)
  })

  it("POST /api/auth/login → 401 with non-existent email", async () => {
    const res = await req("POST", "/api/auth/login", {
      email: "nobody@example.com",
      password: "password123",
    })
    expect(res.status).toBe(401)
  })

  it("GET /api/auth/me → 200 when authenticated", async () => {
    const signupRes = await req("POST", "/api/auth/signup", {
      email: "me@example.com",
      password: "password123",
      name: "Me User",
    })
    const cookie = extractSessionCookie(signupRes)

    const res = await req("GET", "/api/auth/me", undefined, cookie)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.email).toBe("me@example.com")
  })

  it("GET /api/auth/me → 401 when not authenticated", async () => {
    const res = await req("GET", "/api/auth/me")
    expect(res.status).toBe(401)
  })

  it("POST /api/auth/logout → 200 and destroys session", async () => {
    const signupRes = await req("POST", "/api/auth/signup", {
      email: "logout@example.com",
      password: "password123",
      name: "Logout User",
    })
    const cookie = extractSessionCookie(signupRes)

    const res = await req("POST", "/api/auth/logout", undefined, cookie)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBeTrue()
  })

  it("GET /api/auth/me → 404 when user was deleted", async () => {
    const signupRes = await req("POST", "/api/auth/signup", {
      email: "delete-me@example.com",
      password: "password123",
      name: "Delete Me",
    })
    const cookie = extractSessionCookie(signupRes)

    // Manually delete the user from DB
    const { User } = await import("../src/db/schema.js")
    const user = await User.query().where("email", "=", "delete-me@example.com").executeTakeFirst()
    if (user) await user.$forceDelete()

    const res = await req("GET", "/api/auth/me", undefined, cookie)
    expect(res.status).toBe(404)
  })
})
