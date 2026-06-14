# peta-docs

[![npm version](https://img.shields.io/npm/v/peta-docs?style=flat-square)](https://www.npmjs.com/package/peta-docs)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org)
[![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)

OpenAPI 3.1 + [Scalar](https://scalar.com) docs for [Hono](https://hono.dev), powered by [ArkType](https://arktype.io).

Define routes with ArkType schemas — get an OpenAPI 3.1 spec, auto-generated request validation, and an interactive API reference UI, all from a single source of truth.

```ts
import { Hono } from "hono"
import { type } from "arktype"
import { getOpenAPISpec, route, serveScalarUI } from "peta-docs"

const app = new Hono()
const Pet = type({ id: "number", name: "string", species: "'cat'|'dog'" })

app.get("/pets/:id", route()
  .summary("Get a pet by ID")
  .params(type({ id: "string" }))
  .response(200, Pet)
  .handle((c) => c.json({ id: 1, name: "Fido", species: "dog" })),
)

app.get("/openapi.json", (c) => c.json(getOpenAPISpec(app, { title: "Pet Store", version: "1.0.0" })))
app.get("/docs", ...serveScalarUI({ specUrl: "/openapi.json" }))
```

---

## Features

- **ArkType-first** — schemas are ArkType types. Validation + docs from one definition.
- **Auto-validation** — schemas in the `route()` chain generate runtime validators. Invalid requests return `{ error: "Validation failed", issues }` with status 400.
- **File-system routing** — `loadRoutes()` discovers and mounts route modules from the filesystem.
- **Shorthand responses** — `200: Pet` instead of verbose OpenAPI response objects.
- **OpenAPI 3.1** — full JSON Schema 2020-12 compatibility.
- **Scalar UI** — one-liner to serve the Scalar API reference.
- **`c.req.valid("json")`** — typed body access with no extra imports or casts.
- **Extensible** — custom `RouteScanner` for non-Hono frameworks.

---

## Install

```bash
bun add peta-docs hono arktype
```

---

## Route chain API

`route()` returns a `RouteBuilder` with chain methods. Terminal `.handle()` returns a Hono handler with validation composed in.

```ts
route()
  .summary(string)                // optional
  .description(string)            // optional
  .operationId(string)            // optional
  .tags(...string[])              // optional
  .deprecated(boolean?)           // optional
  .paginated(options?)            // adds page/limit/offset query params
  .filter(name, schema, opts?)    // adds a filterable query param
  .sort(fields)                   // configures ?sort with ±field enum
  .include(relations)             // configures ?include with related resource enum
  .fieldsets(resources)           // configures ?fields[type] sparse fieldsets
  .auth(scheme?)                  // marks route as requiring auth
  .query(ArkType type)            // validates + documents query params
  .params(ArkType type)           // validates + documents path params
  .headers(ArkType type)          // validates + documents headers
  .requestBody(ArkType type)      // validates + documents request body
  .response(status, value)        // call: value is ArkType type, string, or config
  .onValidationError(handler)     // per-route validation failure override
  .handle(handler)                // terminal → returns Hono handler
```

The handler callback receives a `TypedContext` with typed `.valid()` overloads:

```ts
.handle((c) => {
  const body = c.req.valid("json")    // typed as body schema's infer
  const query = c.req.valid("query")  // typed as query schema's infer
})
```

### Response shorthand

| Value | Behavior |
|-------|----------|
| ArkType type | Auto "OK" description + `application/json` content |
| string | Description only, no content schema |
| `{ description?, content? }` | Full OpenAPI response object |

### Pagination

```ts
route()
  .paginated({ maxLimit: 100, defaultLimit: 20 })
  .handle((c) => {
    const { page, limit, offset } = c.req.valid("query")
    // page, limit, offset are typed numbers
  })
```

### Filters

```ts
// Simple exact match
.filter("status", type("'active'|'inactive'"))

// With operators — adds ?price__gte= and ?price__lte=
.filter("price", type("number"), { operators: ["gte", "lte"] })
```

### Sort

```ts
.sort(["name", "price", "createdAt"])
// → ?sort enum: name, -name, price, -price, createdAt, -createdAt
```

### Include

```ts
.include(["author", "comments", "tags"])
// → ?include=author,comments (comma-separated)
```

### Fieldsets

```ts
.fieldsets(["articles", "people"])
// → ?fields[articles]=title,body&fields[people]=name
```

### Auth

```ts
.auth()                  // security: [{ bearerAuth: [] }]
.auth("apiKey")          // security: [{ apiKey: [] }]
```

Define security schemes via `getOpenAPISpec` options:

```ts
getOpenAPISpec(app, info, undefined, {
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer" },
    },
  },
})
```

---

## Spec generation

### `getOpenAPISpec(app, info, scanner?, options?)`

Scans `app.routes` for handlers with OpenAPI metadata and builds the OpenAPI 3.1 document.

```ts
getOpenAPISpec(app, { title: "My API", version: "1.0.0" }, undefined, {
  basePath: "/api",
  components: { securitySchemes: { ... } },
})
```

### `serveScalarUI(options)`

Returns a handler that serves the Scalar API reference page.

```ts
serveScalarUI({
  specUrl: string
  title?: string          // default: "API Reference"
  theme?: string          // default: "purple"
  showSidebar?: boolean   // default: true
  cdnUrl?: string         // default: Scalar CDN
})
```

---

## File-system routing

```ts
import { loadRoutes } from "peta-docs/hono"

await loadRoutes(app, "./routes")
```

Convention:

```
routes/
  pets/
    index.ts            → /api/pets
    [id]/
      index.ts          → /api/pets/:id
      comments/
        index.ts        → /api/pets/:id/comments
  species/
    index.ts            → /api/species
```

- `[param]` directories become `:param` path segments
- Directories without `index.ts` (gaps) accumulate their path until a child with `index.ts` is found
- Errors in individual route files are logged — a bad route doesn't crash the app

---

## Custom validation error handler

```ts
// Per-route override
route()
  .onValidationError((issues, c) => c.json({ error: "Invalid" }, 422))
  .requestBody(type({ name: "string" }))
  .handle((c) => c.json({ ok: true }, 201))
```

> [!TIP]
> Per-route handlers take precedence over the global `setOnValidationError()`.

---

## How it works

1. **`route()`** returns a `RouteBuilder`. Chain methods accumulate route metadata. Terminal `.handle()` attaches the config to the handler via a `Symbol` property and generates Hono validator middleware.
2. **`getOpenAPISpec()`** iterates `app.routes[]` (via `RouteScanner`), extracts the metadata, converts ArkType schemas to JSON Schema, and builds an OpenAPI 3.1 document.
3. **`serveScalarUI()`** returns a handler that serves an HTML page loading the Scalar web component from CDN.

No Hono subclass, no monkey-patching — works with vanilla `new Hono()`.

---

## Related packages

- [peta-orm](../orm) — ORM with models, relations, hooks, soft deletes
- [peta-auth](../auth) — Encrypted cookie sessions, JWT, OAuth
