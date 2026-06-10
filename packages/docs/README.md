# peta-hono

OpenAPI + [Scalar](https://scalar.com) docs for [Hono](https://hono.dev), powered by [ArkType](https://arktype.io).

Define routes with ArkType schemas — get an OpenAPI 3.1 spec, auto-generated request validation, and an interactive API reference UI.

## Features

- **ArkType-first** — schemas are ArkType types. Validation + docs from one definition.
- **Auto-validation** — schemas in the `route()` chain generate runtime validators. Invalid requests return `{ error: 'Validation failed', issues }` with status 400 before the handler runs.
- **Auto-load routes** — `loadRoutes()` discovers and mounts route modules from the filesystem.
- **Shorthand responses** — `200: Pet` instead of `200: { description, content: { 'application/json': { schema: Pet } } }`.
- **Status code autocomplete** — `StatusCode` type provides autocomplete for `200`, `201`, `400`, `404`, `500`, etc.
- **OpenAPI 3.1** — full JSON Schema 2020-12 compatibility.
- **Scalar UI** — one-liner to serve the Scalar API reference.
- **`c.req.valid('json')`** — typed body access with no extra imports or casts.

## Install

```bash
bun add peta-hono hono arktype
```

## Usage

```ts
import { Hono } from "hono";
import { type } from "arktype";
import { getOpenAPISpec, route, serveScalarUI } from "peta-hono";

const app = new Hono();

const Pet = type({ id: "number", name: "string>0", species: "'cat'|'dog'" });

// route() generates docs + runtime validation from the same schema
app.get("/pets/:id", route()
  .summary("Get a pet by ID")
  .params(type({ id: "string" }))
  .response(200, Pet)
  .response(404, "Not found")
  .handle((c) => c.json({ id: 1, name: "Fido", species: "dog" })),
);

app.post("/pets", route()
  .summary("Create a pet")
  .requestBody(type({ name: "string>0", species: "'cat'|'dog'" }))
  .response(201, Pet)
  .response(400, "Invalid input")
  .handle((c) => {
    const body = c.req.valid("json");
    return c.json(body, 201);
  }),
);

const info = { title: "Pet Store API", version: "1.0.0" };
app.get("/openapi.json", (c) => c.json(getOpenAPISpec(app, info)));
app.get("/docs", serveScalarUI({ specUrl: "/openapi.json", title: "Pet Store API" }));

export default app;
```

## API

### `route()` — chain API

Returns a `RouteBuilder` with chain methods for declaring route metadata and schemas. Terminal `.handle()` returns a Hono handler with validation composed in. Pass directly to `app.get()` / `app.post()`.

```ts
route()
  .summary(string)             // optional
  .description(string)         // optional
  .operationId(string)         // optional
  .tags(...string[])           // optional
  .deprecated(boolean?)        // optional
  .paginated(options?)         // optional: adds page/limit/offset to query + spec
  .filter(name, schema, opts?) // optional: adds a filterable query param (supports operators)
  .sort(fields)                // optional: configures ?sort with ±field enum
  .include(relations)          // optional: configures ?include with related resource enum
  .fieldsets(resources)        // optional: configures ?fields[type] sparse fieldsets
  .auth(scheme?)               // optional: marks route as requiring auth (default: 'bearerAuth')
  .query(ArkType type)         // validates + documents query params
  .params(ArkType type)        // validates + documents path params
  .headers(ArkType type)       // validates + documents headers
  .requestBody(ArkType type)   // validates + documents request body
  .response(status, value)     // call: value is ArkType type, string, or full config
  .onValidationError(handler)  // per-route override for validation failure response
  .handle(handler)             // terminal → returns Hono handler
```

Schema methods (`.requestBody`, `.query`, `.params`, `.headers`) enforce `ArkTypeSchema` at the type level — only ArkType types accepted.

`.response()` accepts:
| Value | Behavior |
|---|---|
| `ArkType type` | Auto "OK" description + `application/json` content |
| `string` | Description only, no content schema |
| `{ description?, content? }` | Full OpenAPI response object |

The handler callback receives a `TypedContext` with typed `.valid()` overloads matching your declared schemas:

```ts
.handle((c) => {
  const body = c.req.valid("json");   // typed as body schema's infer
  const query = c.req.valid("query"); // typed as query schema's infer
  // ...
})
```

On validation failure, the route returns `{ error: 'Validation failed', issues: [...] }` with status 400.

#### `.paginated(options?)`

Adds `page`, `limit`, `offset` query parameters to validation and OpenAPI docs. `page` and `limit` are coerced from strings and clamped to valid ranges. `offset` is computed as `(page - 1) * limit`.

```ts
route()
  .paginated({ maxLimit: 100, defaultLimit: 20 })
  .handle((c) => {
    const { page, limit, offset } = c.req.valid("query");  // all numbers
    const items = db.query(`SELECT * FROM items LIMIT $1 OFFSET $2`, [limit, offset]);
    return c.json({ data: items, page, total });
  })
```

Options:

| Option | Default | Description |
|---|---|---|
| `maxLimit` | `100` | Maximum allowed value for `limit` |
| `defaultLimit` | `20` | Default `limit` when not specified |

Can be combined with `.query()` — pagination fields are merged into the same validated object.

#### `.auth(scheme?)`

Marks the route as requiring authentication in the OpenAPI spec. Adds `security: [{ [scheme]: [] }]` to the operation. The actual auth middleware is applied separately (e.g., via `app.use("/*", requireAuth)` or inline).

```ts
route()
  .auth()                       // security: [{ bearerAuth: [] }]
  .auth("apiKey")               // security: [{ apiKey: [] }]
  .auth("bearerAuth")
  .auth("oauth2")               // multiple: [{ bearerAuth: [] }, { oauth2: [] }]
  .handle((c) => c.json({ ok: true }));
```

Define the security scheme in `components` via `getOpenAPISpec` options:

```ts
getOpenAPISpec(app, info, undefined, {
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer" },
      apiKey: { type: "apiKey", in: "header", name: "X-API-Key" },
    },
  },
});
```

#### `.filter(name, schema, options?)`

Adds a filterable query parameter to the OpenAPI spec and runtime validation. Supports operator-based filters with `__` suffix convention.

```ts
// Simple exact match — adds ?status= query param
.filter("status", type("'active'|'inactive'"))

// With operators — adds ?price__gte= and ?price__lte= query params
.filter("price", type("number"), { operators: ["gte", "lte"] })
```

Available operators:

| Operator | Param example | Behavior |
|---|---|---|
| `eq` (default) | `?status=active` | Exact match |
| `ne` | `?name__ne=foo` | Not equal |
| `gte` | `?price__gte=10` | Greater than or equal |
| `gt` | `?price__gt=10` | Greater than |
| `lte` | `?price__lte=50` | Less than or equal |
| `lt` | `?price__lt=50` | Less than |
| `contains` | `?name__contains=foo` | Contains substring |
| `startsWith` | `?name__startsWith=foo` | Starts with |
| `endsWith` | `?name__endsWith=foo` | Ends with |
| `in` | `?status__in=active,pending` | Comma-separated set |

Filter values are validated against the provided schema and merged into `c.req.valid("query")` alongside `.query()` and `.paginated()` values.

#### `.sort(fields)`

Declares sortable fields. Adds a `?sort` query param with an enum of `±field` values.

```ts
.sort(["name", "price", "createdAt"])
// → ?sort enum: name, -name, price, -price, createdAt, -createdAt
// → ?sort=-price,name  (comma-separated, prefix - for descending)
```

Invalid sort fields are rejected with a 400 response. Validated value is available at `c.req.valid("query").sort` as a `string[]`.

#### `.include(relations)`

Declares sideloadable related resources. Adds a `?include` query param with an enum of the allowed relation names.

```ts
.include(["author", "comments", "tags"])
// → ?include enum: author, comments, tags
// → ?include=author,comments  (comma-separated)
```

Invalid relation names are rejected with a 400 response. Validated value is available at `c.req.valid("query").include` as a `string[]`.

#### `.fieldsets(resources)`

Declares sparse fieldset resources per the JSON:API spec. Adds `?fields[type]` query params for each resource.

```ts
.fieldsets(["articles", "people"])
// → ?fields[articles]=title,body&fields[people]=name
// → c.req.valid("query")["fields[articles]"] → "title,body"
```

Each resource generates a `?fields[type]` string parameter in the OpenAPI spec. Values are passed through as strings.

### `getOpenAPISpec(app, info, scanner?, options?)`

Scans `app.routes` for handlers with OpenAPI metadata and builds the OpenAPI 3.1 document.

```ts
getOpenAPISpec(
  app: Hono,
  info: InfoObject,
  scanner?: RouteScanner,
  options?: { basePath?: string; components?: Record<string, unknown> },
): OpenAPIObject
```

`scanner` is optional — defaults to `honoScanner`. The `basePath` option (default `"/api"`) strips a URL prefix before deriving auto-tags, so routes under `/api/pets` get tag `"pets"` instead of `"api"`. Pass `basePath: ""` to disable prefix stripping. The `components` option is forwarded directly into the spec — use it to define `securitySchemes`, `schemas`, etc.

### `serveScalarUI(options)`

Returns a handler that serves the Scalar API reference page.

```ts
serveScalarUI({
  specUrl: string
  title?: string          // default: 'API Reference'
  theme?: string          // default: 'purple'
  showSidebar?: boolean   // default: true
  cdnUrl?: string         // default: 'https://cdn.jsdelivr.net/npm/@scalar/api-reference'
})
```

Uses the `<scalar-api-reference>` web component. The CDN URL is configurable for pinning versions or self-hosting.

### `loadRoutes(app, dir, options?)`

Discovers and mounts route modules from a directory tree. Each subdirectory with an `index.ts` exporting a Hono instance (default export) is mounted as a sub-router at `${basePath}/${name}` where `basePath` defaults to `"/api"`.

Directories named `[param]` are converted to `:param` path segments for dynamic routing. Directories without `index.ts` (gaps) accumulate their path until a child directory with `index.ts` is found.

```ts
import { loadRoutes } from "peta-hono";

await loadRoutes(app, "./routes");                          // mounts at /api/pets, /api/species
await loadRoutes(app, "./routes", { basePath: "/v2" });     // mounts at /v2/pets, /v2/species
await loadRoutes(app, "./routes", { basePath: "" });        // mounts at /pets, /species
```

Convention:

```
routes/
  pets/
    index.ts              → /api/pets
    [id]/
      index.ts            → /api/pets/:id
      comments/
        index.ts          → /api/pets/:id/comments
  species/
    index.ts              → /api/species
  admin/                          ← no index.ts (gap)
    [id]/
      settings/
        index.ts          → /api/admin/:id/settings  ← mounted on app, not sub-router
```

Each level can have its own `index.ts` — nesting is recursive and mirrors the URL structure. `[param]` directories become `:param` path segments. Gap directories (no `index.ts`) accumulate their path; the next `index.ts` found deeper mounts on the original parent at the full accumulated path.

Also accepts factory functions. Errors in individual route files are logged — a bad route doesn't crash the app.

Since both `loadRoutes` and `getOpenAPISpec` default to `"/api"`, auto-tags are derived correctly without extra config in most cases. For a custom `basePath`, pass the same value to both.

### `setOnValidationError(handler)`

> **Deprecated.** Use `.onValidationError()` on the route chain instead. Per-route handlers take precedence over the global handler.

Customize the response returned when request validation fails. Returns a restore function.

```ts
const restore = setOnValidationError((issues, c) => {
  return c.json({ error: "Invalid", details: issues }, 422);
});

// later: restore()  // resets to default handler
```

Default returns `{ error: 'Validation failed', issues }` with status 400.

Per-route override via the chain method:

```ts
route()
  .onValidationError((issues, c) => c.json({ error: "Invalid" }, 422))
  .requestBody(type({ name: "string>0" }))
  .handle((c) => c.json({ ok: true }, 201));
```

The per-route handler takes precedence over the global `setOnValidationError()`.

### `StatusCode`

Union of common HTTP status codes for use in response definitions. Provides autocomplete while accepting any string.

```ts
import type { StatusCode } from "peta-hono";

type Code = StatusCode; // '200' | '201' | '400' | '404' | '500' | (string & {})
```

Built into `RouteConfig.responses`.

## How it works

1. **`route()`** returns a `RouteBuilder`. Chain methods accumulate route metadata (summary, schemas, responses). Terminal `.handle()` attaches the config to the handler via a `Symbol` property. If schemas are present, it generates Hono validator middleware that runs before the handler and converts schemas via `toJsonSchema()` for OpenAPI docs.
2. **`getOpenAPISpec()`** iterates `app.routes[]` (via `RouteScanner`), extracts the Symbol metadata, converts ArkType schemas to JSON Schema, and builds an OpenAPI 3.1 document.
3. **`serveScalarUI()`** returns a handler that serves an HTML page loading the Scalar web component from CDN, pointed at the OpenAPI spec URL.

No Hono subclass, no monkey-patching — works with vanilla `new Hono()`.

## Build

```bash
bun run build    # tsdown → dist/index.mjs + dist/index.d.mts
bun run test     # 88 tests
```

## License

MIT
