import { Hono } from "hono"
import { cors } from "hono/cors"
import { session } from "peta-auth/hono"
import { getOpenAPISpec, serveScalarUI } from "peta-docs"
import { loadRoutes } from "peta-docs/hono"
import { getPeta } from "./db/schema.js"

// ---------------------------------------------------------------------------
// Initialize database + models
// ---------------------------------------------------------------------------
const peta = getPeta()

// ---------------------------------------------------------------------------
// Hono app
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// API routes (auto-discovered from filesystem)
// ---------------------------------------------------------------------------
await loadRoutes(app, `${import.meta.dir}/routes`, { basePath: "/api" })

// ---------------------------------------------------------------------------
// OpenAPI spec
// ---------------------------------------------------------------------------
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
  c.json(
    getOpenAPISpec(app, API_INFO, undefined, {
      basePath: "/api",
      components: API_COMPONENTS,
    }),
  ),
)

// ---------------------------------------------------------------------------
// Scalar API docs UI
// ---------------------------------------------------------------------------
app.get("/docs", serveScalarUI({ specUrl: "/openapi.json", title: "Books Catalog API" }))

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------
const port = Number(process.env.PORT ?? 3000)
console.log(`📚 Books Catalog API running at http://localhost:${port}`)
console.log(`   OpenAPI spec: http://localhost:${port}/openapi.json`)
console.log(`   API docs:     http://localhost:${port}/docs`)

Bun.serve({
  fetch: app.fetch,
  port,
})

// Graceful shutdown
process.on("SIGINT", async () => {
  await peta.destroy()
  process.exit(0)
})
process.on("SIGTERM", async () => {
  await peta.destroy()
  process.exit(0)
})
