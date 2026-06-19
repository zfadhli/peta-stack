import type { Client } from "@libsql/client"
import { createClient } from "@libsql/client"
import { LibsqlDialect } from "@libsql/kysely-libsql"
import type { Hono } from "hono"
import { hashPassword } from "peta-auth"
import { createTables, getORM } from "../src/db/schema.js"

// ─── Test Database Factory ────────────────────────────────────────────────

/**
 * Create an ORM instance backed by an in-memory SQLite database.
 * Tables are created automatically. Returns both the ORM and the raw DB
 * reference (for direct queries in test assertions).
 */
export async function createTestORM(): Promise<{ orm: Awaited<ReturnType<typeof getORM>>; client: Client }> {
  const client = createClient({ url: ":memory:" })
  await client.execute("PRAGMA foreign_keys = ON")
  await createTables(client)
  const orm = await getORM(new LibsqlDialect({ client }))
  return { orm, client }
}

// ─── Session Helpers ──────────────────────────────────────────────────────

/**
 * Extract the session cookie from a Response's Set-Cookie header.
 */
export function extractSessionCookie(res: Response): string {
  const setCookie = res.headers.get("Set-Cookie")
  if (!setCookie) return ""
  return setCookie.split(";")[0] ?? ""
}

/**
 * Create a user directly in the DB (bypassing the API) and then log in via
 * the API to get a valid session cookie.
 *
 * This ensures the session contains the correct role from the start.
 */
export async function createUser(
  app: Hono,
  props: { email: string; password: string; name: string; role: string },
): Promise<{ cookie: string; userId: string }> {
  const { User } = await import("../src/db/schema.js")

  // Create the user directly so we can set any role
  const passwordHash = await hashPassword(props.password)
  const user = await User.insert({
    email: props.email,
    passwordHash,
    name: props.name,
    role: props.role,
  })
  const userId = user.get("id")

  // Log in to get a session cookie with the correct role
  const res = await app.fetch(
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: props.email, password: props.password }),
    }),
  )
  if (res.status !== 200) {
    const text = await res.text()
    throw new Error(`login failed (${res.status}): ${text}`)
  }

  return { cookie: extractSessionCookie(res), userId }
}

// ─── Seed Data ────────────────────────────────────────────────────────────

/**
 * Create an author linked to a user. Returns the author record.
 */
export async function createLinkedAuthor(userId: string, name?: string): Promise<Record<string, unknown>> {
  const { Author } = await import("../src/db/schema.js")
  const author = await Author.insert({ name: name ?? "Test Author", bio: "Bio", userId })
  return author.$toJSON()
}

/**
 * Create a category. Returns the category record.
 */
export async function createCategory(name?: string): Promise<Record<string, unknown>> {
  const { Category } = await import("../src/db/schema.js")
  const cat = await Category.insert({ name: name ?? `Cat-${Date.now()}`, description: "Test category" })
  return cat.$toJSON()
}

/**
 * Create a book with the given authorId. Returns the book record.
 */
export async function createBook(
  authorId: string,
  overrides?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { Book } = await import("../src/db/schema.js")
  const book = await Book.insert({
    title: "Test Book",
    isbn: `978${Date.now()}`.slice(0, 13),
    price: 9.99,
    authorId,
    inStock: true,
    ...overrides,
  })
  return book.$toJSON()
}

/**
 * Create a review.
 */
export async function createReview(
  bookId: string,
  userId: string,
  overrides?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { Review } = await import("../src/db/schema.js")
  const review = await Review.insert({
    bookId,
    userId,
    rating: 5,
    body: "Great!",
    ...overrides,
  })
  return review.$toJSON()
}
