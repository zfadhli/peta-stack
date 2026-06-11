import { Hono } from "hono"
import { cors } from "hono/cors"
import { HTTPException } from "hono/http-exception"
import { session } from "peta-auth/hono"
import { getOpenAPISpec, serveScalarUI } from "peta-docs"
import { DatabaseError, normalizeError } from "peta-orm"
import { getPeta } from "./db/schema.js"

import auth from "./routes/auth.js"
import authors from "./routes/authors.js"
import books from "./routes/books.js"
import booksReviews from "./routes/books_reviews.js"
import categories from "./routes/categories.js"

const peta = getPeta()
const app = new Hono()

// Global middleware
app.use("*", cors())
app.use(
  "*",
  session({
    password: process.env.SESSION_PASSWORD ?? "change-me-32-chars-min!!-change-me-32-chars-min!!",
    cookieName: "catalog-session",
  }),
)

// Global error handler
app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status)
  }

  // Normalize raw DB errors (e.g. from transactions that bypass the ORM)
  const dbErr = err instanceof DatabaseError ? err : normalizeError(err)
  if (dbErr) {
    if (dbErr.code === "UNIQUE_CONSTRAINT") {
      // Extract column name from the driver error: "UNIQUE constraint failed: users.email"
      const raw = (dbErr.cause as Error)?.message ?? dbErr.message
      const col = raw.includes(":") ? (raw.split(":").pop()?.trim().split(".").pop() ?? "") : ""
      const friendly: Record<string, string> = {
        email: "A user with this email already exists",
        isbn: "A book with this ISBN already exists",
        name: "This category name already exists",
      }
      return c.json({ error: friendly[col] ?? "Duplicate value" }, 409)
    }
    if (dbErr.code === "FOREIGN_KEY_CONSTRAINT") {
      return c.json({ error: "Referenced record not found" }, 409)
    }
    if (dbErr.code === "MISSING_ID") {
      return c.json({ error: "Bad request" }, 400)
    }
  }

  console.error(err)
  return c.json({ error: "Internal server error" }, 500)
})

// Routes
app.route("/api/auth", auth)
app.route("/api/books", books)
app.route("/api/books/:id/reviews", booksReviews)
app.route("/api/authors", authors)
app.route("/api/categories", categories)

// OpenAPI spec
const API_INFO = {
  title: "Books Catalog API",
  version: "1.0.0",
  description: "A comprehensive book catalog API with authors, categories, and reviews.",
}

const API_COMPONENTS = {
  securitySchemes: {
    cookieAuth: {
      type: "apiKey",
      in: "cookie",
      name: "catalog-session",
      description: "Session cookie-based authentication. Login via POST /api/auth/login.",
    },
  },
}

app.get("/openapi.json", (c) =>
  c.json(getOpenAPISpec(app, API_INFO, undefined, { basePath: "/api", components: API_COMPONENTS })),
)

app.get("/docs", serveScalarUI({ specUrl: "/openapi.json", title: "Books Catalog API" }))

// Start server
const port = Number(process.env.PORT ?? 3000)
console.log(`📚 Books Catalog API running at http://localhost:${port}`)
console.log(`   OpenAPI spec: http://localhost:${port}/openapi.json`)
console.log(`   API docs:     http://localhost:${port}/docs`)

Bun.serve({ fetch: app.fetch, port })

process.on("SIGINT", async () => {
  await peta.destroy()
  process.exit(0)
})
process.on("SIGTERM", async () => {
  await peta.destroy()
  process.exit(0)
})
