import { Hono } from "hono"
import { cors } from "hono/cors"
import { HTTPException } from "hono/http-exception"
import { session } from "peta-auth/hono"
import { getOpenAPISpec, serveScalarUI } from "peta-docs"
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
