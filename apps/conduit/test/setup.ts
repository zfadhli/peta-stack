import { Database } from "bun:sqlite"
import type { Hono } from "hono"
import { BunSqliteDialect } from "kysely-bun-sqlite"
import { createApp } from "../src/index.js"
import { createTables, getORM } from "../src/db/schema.js"

// ─── Test Database Factory ────────────────────────────────────────────────

/**
 * Create an ORM instance backed by an in-memory SQLite database.
 * Tables are created automatically. Returns both the ORM and the raw DB
 * reference (for direct queries in test assertions).
 */
export function createTestORM(): { orm: ReturnType<typeof getORM>; db: Database } {
  const db = new Database(":memory:")
  db.run("PRAGMA foreign_keys = ON")
  createTables(db)
  const orm = getORM(new BunSqliteDialect({ database: db }))
  return { orm, db }
}

/**
 * Create a test app with an in-memory database.
 */
export function createTestApp(): { app: Hono; orm: ReturnType<typeof getORM> } {
  const { orm } = createTestORM()
  const app = createApp(orm)
  return { app, orm }
}

// ─── Auth Helpers ─────────────────────────────────────────────────────────

/**
 * Extract a JWT token from a response body.
 */
export function extractToken(res: Response): string {
  // The response body should be JSON with a user.token field
  return "" // Overridden below via the actual extractor
}

/**
 * Register a new user via the API and return the token + user info.
 */
export async function signupUser(
  app: Hono,
  props: { username: string; email: string; password: string },
): Promise<{ token: string; username: string; email: string }> {
  const res = await app.fetch(
    new Request("http://localhost/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user: props }),
    }),
  )
  if (res.status !== 201) {
    const text = await res.text()
    throw new Error(`signup failed (${res.status}): ${text}`)
  }
  const body = await res.json()
  return {
    token: body.user.token,
    username: body.user.username,
    email: body.user.email,
  }
}

/**
 * Login a user via the API and return the token.
 */
export async function loginUser(
  app: Hono,
  props: { email: string; password: string },
): Promise<{ token: string; username: string; email: string }> {
  const res = await app.fetch(
    new Request("http://localhost/api/users/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user: props }),
    }),
  )
  if (res.status !== 200) {
    const text = await res.text()
    throw new Error(`login failed (${res.status}): ${text}`)
  }
  const body = await res.json()
  return {
    token: body.user.token,
    username: body.user.username,
    email: body.user.email,
  }
}

// ─── Seed Data Helpers ────────────────────────────────────────────────────

/**
 * Create an article via the API.
 */
export async function createArticle(
  app: Hono,
  token: string,
  article: { title: string; description: string; body: string; tagList?: string[] },
): Promise<{ slug: string; title: string }> {
  const res = await app.fetch(
    new Request("http://localhost/api/articles", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Token ${token}` },
      body: JSON.stringify({ article }),
    }),
  )
  if (res.status !== 201) {
    const text = await res.text()
    throw new Error(`create article failed (${res.status}): ${text}`)
  }
  const body = await res.json()
  return { slug: body.article.slug, title: body.article.title }
}
