import { Hono } from "hono"
import { cors } from "hono/cors"
import { getOpenAPISpec, serveScalarUI } from "peta-docs"
import { createORM } from "peta-orm"
import { getORM } from "./db/schema.js"
import { resolveUser } from "./middleware/auth.js"
import { onError } from "./middleware/error.js"
import articles from "./routes/articles.js"
import auth from "./routes/auth.js"
import comments from "./routes/comments.js"
import favorites from "./routes/favorites.js"
import profiles from "./routes/profiles.js"
import tags from "./routes/tags.js"

const API_INFO = {
  title: "Conduit API",
  version: "2.0.0",
  description: "RealWorld Conduit API — a Medium.com clone backend built with peta-stack.",
}

const API_COMPONENTS = {
  securitySchemes: {
    Token: {
      type: "apiKey",
      in: "header",
      name: "Authorization",
      description: 'JWT Bearer token. Prefix with "Token ". Obtain a token via POST /api/users/login.',
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
  app.use("*", resolveUser())

  // Global error handler
  app.onError(onError)

  // Routes
  app.route("/api", auth) // POST /users, /users/login, GET/PUT /user
  app.route("/api", profiles) // GET /profiles/:username, POST/DELETE /follow
  app.route("/api", articles) // GET/POST /articles, GET/PUT/DELETE /:slug, GET /feed
  app.route("/api", comments) // GET/POST /comments, DELETE /:id
  app.route("/api", favorites) // POST/DELETE /:slug/favorite
  app.route("/api", tags) // GET /tags

  // OpenAPI spec + Scalar docs UI
  app.get("/openapi.json", (c) =>
    c.json(getOpenAPISpec(app, API_INFO, undefined, { basePath: "/api", components: API_COMPONENTS })),
  )
  app.get("/docs", serveScalarUI({ specUrl: "/openapi.json", title: "Conduit API" }))

  return app
}

// ─── Production entrypoint ───────────────────────────
if (import.meta.main) {
  const orm = await getORM()
  const app = await createApp(orm)

  const port = Number(process.env.PORT ?? 3001)
  console.log(`📝 Conduit API running at http://localhost:${port}`)
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
