# Customization

This guide covers advanced customization of `peta-docs` beyond the basic usage in the package README.

## OpenAPI Output Customization

### Security Schemes

Define authentication schemes globally:

```ts
getOpenAPISpec(app, { title: "API", version: "1.0.0" }, undefined, {
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      },
      apiKey: {
        type: "apiKey",
        in: "header",
        name: "X-API-Key",
      },
    },
  },
})
```

Then reference them per-route:

```ts
route()
  .auth()          // applies first scheme (bearerAuth)
  .auth("apiKey")  // also applies apiKey
  .handle((c) => c.json({ ok: true }))
```

### Servers

Specify server URLs for different environments:

```ts
import type { InfoObject } from "peta-docs"

const info: InfoObject = {
  title: "My API",
  version: "1.0.0",
  servers: [
    { url: "https://api.example.com/v1", description: "Production" },
    { url: "https://staging.example.com/v1", description: "Staging" },
    { url: "http://localhost:3000", description: "Local" },
  ],
}

getOpenAPISpec(app, info)
```

### Tags

Override auto-derived tags:

```ts
route()
  .tags(["pets", "animals"])  // explicit tags, overrides auto-tag from path
  .handle((c) => c.json({}))
```

Without explicit tags, tags are auto-derived from the first path segment (e.g., `/api/pets/:id` → tag "pets").

### Base Path

The `basePath` option (default `"/api"`) affects both route mounting and tag derivation:

```ts
// Routes under /api/pets get tag "pets" (default)
getOpenAPISpec(app, info, undefined, { basePath: "/api" })

// Routes under /v2/pets get tag "pets"
getOpenAPISpec(app, info, undefined, { basePath: "/v2" })

// Disable auto-stripping
getOpenAPISpec(app, info, undefined, { basePath: "" })
```

## Custom Route Scanner

The `RouteScanner` interface lets you integrate `peta-docs` with non-Hono frameworks:

```ts
import type { RouteScanner, RouteEntry } from "peta-docs"

const myScanner: RouteScanner = {
  scan(app: AppType): RouteEntry[] {
    // Extract routes from your framework's app
    // Each RouteEntry needs: { path, method, config }
    return [
      {
        path: "/users",
        method: "GET",
        config: {
          summary: "List users",
          responses: { 200: { description: "OK" } },
          handler: () => new Response(),
        },
      },
    ]
  },
}

// Use with any framework
const spec = getOpenAPISpec(myApp, { title: "My API", version: "1.0.0" }, myScanner)
```

The `RouteConfig` type includes all OpenAPI operation fields:

```ts
interface RouteConfig {
  summary?: string
  description?: string
  operationId?: string
  tags?: string[]
  query?: unknown          // ArkType schema for query params
  params?: unknown          // ArkType schema for path params
  headers?: unknown         // ArkType schema for headers
  requestBody?: unknown     // ArkType schema or OpenAPI request body
  pagination?: { maxLimit: number; defaultLimit: number }
  filters?: FilterDef[]
  sort?: string[]
  include?: string[]
  security?: string[]
  responses: Partial<Record<StatusCode, ResponseValue>>
  handler: (...args: unknown[]) => unknown
}
```

## Scalar UI Customization

### Theme

```ts
serveScalarUI({
  specUrl: "/openapi.json",
  title: "Pet Store API",
  theme: "blue",         // available: purple (default), blue, green, orange, red, moon, solarized
  showSidebar: false,    // hide the sidebar for a simpler UI
})
```

### Self-Hosting Scalar

By default, Scalar loads from CDN. Pin a specific version for production:

```ts
serveScalarUI({
  specUrl: "/openapi.json",
  cdnUrl: "https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.25.0",
})
```

Or self-host the Scalar web component.

## Validation Error Handling

### Per-Route Custom Responses

```ts
route()
  .onValidationError((issues, c) => {
    return c.json({
      error: "Validation failed",
      details: issues.map((i) => ({ field: i.path.join("."), message: i.message })),
    }, 422)
  })
  .requestBody(type({ name: "string", email: "string(email)" }))
  .handle((c) => c.json({ ok: true }))
```

### Global Custom Responses

```ts
import { setOnValidationError } from "peta-docs"

const restore = setOnValidationError((issues, c) => {
  return c.json({ error: "Invalid input" }, 422)
})

// Later: restore() to reset to default
```

Per-route handlers take precedence over the global handler.

## Response Shorthand

`.response()` accepts three forms:

```ts
// ArkType type — auto "OK" description + application/json
.route().response(200, type({ id: "number" }))

// String — description only, no content schema
.route().response(404, "Not found")

// Full OpenAPI response object
.route().response(200, {
  description: "A list of pets",
  content: {
    "application/json": { schema: { type: "array", items: { type: "object" } } },
  },
})
```

## ArkType to JSON Schema Mapping

`peta-docs` automatically converts ArkType schemas to JSON Schema for the OpenAPI spec. The conversion handles:

| ArkType | JSON Schema |
|---------|-------------|
| `type("string")` | `{ type: "string" }` |
| `type("number")` | `{ type: "number" }` |
| `type("'cat'\|'dog'")` | `{ type: "string", enum: ["cat", "dog"] }` |
| `type({ name: "string" })` | `{ type: "object", properties: { name: { type: "string" } } }` |
| `type("string>0")` | `{ type: "string", minLength: 1 }` |
| `type("number>=0")` | `{ type: "number", minimum: 0 }` |
