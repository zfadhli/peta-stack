import { Hono } from "hono"
import { cors } from "hono/cors"
import { HTTPException } from "hono/http-exception"
import { session } from "peta-auth/hono"
import { getOpenAPISpec, serveScalarUI } from "peta-docs"
import { createORM, DatabaseError, normalizeError } from "peta-orm"
import { getORM } from "./db/schema.js"

import auth from "./routes/auth.js"
import authors from "./routes/authors.js"
import books from "./routes/books.js"
import booksReviews from "./routes/books_reviews.js"
import categories from "./routes/categories.js"

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

/**
 * Create the Hono application with all routes and middleware.
 *
 * @param orm - Optional ORM instance (for tests). Defaults to the singleton.
 */
export async function createApp(orm?: ReturnType<typeof createORM>): Promise<Hono> {
  // Ensure the ORM is initialized
  if (!orm) orm = await getORM()

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

    // Normalize raw DB errors
    const dbErr = err instanceof DatabaseError ? err : normalizeError(err)
    if (dbErr) {
      if (dbErr.code === "UNIQUE_CONSTRAINT") {
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
  app.get("/openapi.json", (c) =>
    c.json(getOpenAPISpec(app, API_INFO, undefined, { basePath: "/api", components: API_COMPONENTS })),
  )
  app.get("/docs", serveScalarUI({ specUrl: "/openapi.json", title: "Books Catalog API" }))

  return app
}

// ─── Production entrypoint ───────────────────────────
// Only start the server when this file is the entry point (not when imported
// by tests).
if (import.meta.main) {
  const orm = await getORM()
  const app = await createApp(orm)

  const port = Number(process.env.PORT ?? 3000)
  console.log(`📚 Books Catalog API running at http://localhost:${port}`)
  console.log(`   OpenAPI spec: http://localhost:${port}/openapi.json`)
  console.log(`   API docs:     http://localhost:${port}/docs`)

  Bun.serve({ fetch: app.fetch, port })

  process.on("SIGINT", async () => {
    await orm.destroy()
    process.exit(0)
  })
  process.on("SIGTERM", async () => {
    await orm.destroy()
    process.exit(0)
  })
}
