import { Hono } from "hono"
import { cors } from "hono/cors"
import { getPeta } from "./db/schema.js"
import { resolveUser } from "./middleware/auth.js"
import { onError } from "./middleware/error.js"
import articles from "./routes/articles.js"
import auth from "./routes/auth.js"
import comments from "./routes/comments.js"
import favorites from "./routes/favorites.js"
import profiles from "./routes/profiles.js"
import tags from "./routes/tags.js"

const peta = getPeta()
const app = new Hono()

// ---------------------------------------------------------------------------
// Global middleware
// ---------------------------------------------------------------------------

app.use("*", cors())
app.use("*", resolveUser())

// ---------------------------------------------------------------------------
// Global error handler
// ---------------------------------------------------------------------------

app.onError(onError)

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.route("/api", auth) // POST /users, /users/login, GET/PUT /user
app.route("/api", profiles) // GET /profiles/:username, POST/DELETE /follow
app.route("/api", articles) // GET/POST /articles, GET/PUT/DELETE /:slug, GET /feed
app.route("/api", comments) // GET/POST /comments, DELETE /:id
app.route("/api", favorites) // POST/DELETE /:slug/favorite
app.route("/api", tags) // GET /tags

// ---------------------------------------------------------------------------
// OpenAPI spec (optional — can be enabled once peta-docs is integrated)
// ---------------------------------------------------------------------------

// import { getOpenAPISpec, serveScalarUI } from "peta-docs"
//
// const API_INFO = { title: "Conduit API", version: "2.0.0", description: "RealWorld Conduit API" }
// app.get("/openapi.json", (c) => c.json(getOpenAPISpec(app, API_INFO, undefined, { basePath: "/api" })))
// app.get("/docs", serveScalarUI({ specUrl: "/openapi.json", title: "Conduit API" }))

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

const port = Number(process.env.PORT ?? 3001)
console.log(`📝 Conduit API running at http://localhost:${port}`)

Bun.serve({ fetch: app.fetch, port })

process.on("SIGINT", async () => {
  await peta.destroy()
  process.exit(0)
})
process.on("SIGTERM", async () => {
  await peta.destroy()
  process.exit(0)
})
