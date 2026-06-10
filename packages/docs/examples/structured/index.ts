import { Hono } from "hono"
import { cors } from "hono/cors"
import { loadRoutes } from "../../src/hono/index.ts"
import { getOpenAPISpec, serveScalarUI } from "../../src/index.ts"

const app = new Hono()

app.use("*", cors())

// Auto-load routes from ./routes directory — mounted under /api by default
await loadRoutes(app, new URL("./routes", import.meta.url).pathname)

// Health check (not in OpenAPI docs)
app.get("/health", (c) => c.json({ status: "ok" }))

// OpenAPI spec + Scalar docs — default /api basePath strips prefix
// so auto-tags derive "pets" / "species" instead of "api"
const info = {
  title: "Pet Store API",
  version: "1.0.0",
  description: "A structured Hono app with peta-docs.",
}

app.get("/openapi.json", (c) => c.json(getOpenAPISpec(app, info)))
app.get("/docs", serveScalarUI({ specUrl: "/openapi.json", title: "Pet Store API" }))

const port = Number(process.env.PORT) || 3096
console.log(`Listening on http://localhost:${port}\nDocs at http://localhost:${port}/docs`)
Bun.serve({ fetch: app.fetch, port }) // For Node: `npm i @hono/node-server` + `serve({ fetch, port })` from it

export default app
