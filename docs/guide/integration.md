# Integration Patterns

The peta-stack packages are designed to work together without being coupled. This guide covers common integration patterns.

## Pattern 1: ORM + Auth Sessions

Combine `peta-orm` models with `peta-auth` session middleware for authenticated CRUD.

```ts
import { Hono } from "hono"
import { createORM, defineModel, t } from "peta-orm"
import { session, requireSession } from "peta-auth/hono"

// --- Setup ---
const orm = createORM({ dialect })
const User = defineModel("users", {
  columns: { id: t.integer().primaryKey(), name: t.string(255), email: t.text().unique() },
})
orm.registerAll(User)

const app = new Hono()
app.use("*", session({ password: process.env.SECRET!, cookieName: "app" }))

// --- Auth routes ---
app.post("/login", async (c) => {
  const { email } = await c.req.json()
  const user = await User.query().where("email", email).first()
  if (!user) return c.json({ error: "not found" }, 404)
  c.var.session.userId = user.get("id")
  await c.var.session.save()
  return c.json({ ok: true })
})

// --- Protected routes ---
app.get("/me", requireSession(), async (c) => {
  const user = await User.find(c.var.session.userId)
  return c.json(user?.$toJSON())
})
```

## Pattern 2: ORM + Docs

Use `peta-docs` to generate OpenAPI specs for your ORM-backed endpoints.

```ts
import { getOpenAPISpec, route, serveScalarUI } from "peta-docs"
import { type } from "arktype"

const Pet = type({ id: "number", name: "string" })
const CreatePet = type({ name: "string" })

app.get("/pets", route()
  .summary("List pets")
  .response(200, type([Pet]))
  .handle(async (c) => {
    const pets = await PetModel.query().execute()
    return c.json(pets.map((p) => p.$toJSON()))
  })
)

app.post("/pets", route()
  .summary("Create a pet")
  .requestBody(CreatePet)
  .response(201, Pet)
  .handle(async (c) => {
    const data = c.req.valid("json")
    const pet = await PetModel.insert(data)
    return c.json(pet.$toJSON(), 201)
  })
)

app.get("/openapi.json", (c) => c.json(getOpenAPISpec(app, { title: "API", version: "1.0.0" })))
app.get("/docs", ...serveScalarUI({ specUrl: "/openapi.json" }))
```

## Pattern 3: Auth + Docs

Protect documented routes and show auth requirements in the OpenAPI spec.

```ts
import { session, requireSession } from "peta-auth/hono"
import { route } from "peta-docs/hono"

app.use("*", session({ password: process.env.SECRET!, cookieName: "app" }))

app.get("/profile", requireSession(), route()
  .summary("Get my profile")
  .auth()  // Marks route as requiring bearerAuth in the spec
  .response(200, type({ id: "number", name: "string" }))
  .handle(async (c) => {
    return c.json(await getUser(c.var.session.userId))
  })
)

app.get("/openapi.json", (c) => c.json(getOpenAPISpec(app, { title: "API", version: "1.0.0" }, undefined, {
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer" },
    },
  },
})))
```

## Pattern 4: Full Stack (Demo Apps)

The full integration of all three packages is demonstrated in the demo apps:

### Conduit — Medium.com Clone

- **Auth**: JWT tokens via `peta-auth/jwt`
- **ORM**: 7 models with timestamps, ULIDs, relations (hasMany, belongsTo, manyToMany)
- **Docs**: `route()` chain on every endpoint, OpenAPI spec + Scalar UI

Source: [`apps/conduit/`](https://github.com/zfadhli/peta-stack/tree/main/apps/conduit)

```
POST /api/users          POST /api/articles
POST /api/users/login    POST /api/articles/:slug/favorite
GET /api/user            GET /api/articles/:slug/comments
GET /api/profiles/:username
GET /api/tags
```

### Catalog — Books API

- **Auth**: Session cookies via `peta-auth/hono`, role-based access control
- **ORM**: 6 models with soft deletes, timestamps, ULIDs, boolean casting, graph inserts
- **Docs**: Full `route()` chain with `.paginated()`, `.filter()`, `.sort()`, `.include()`

Source: [`apps/catalog/`](https://github.com/zfadhli/peta-stack/tree/main/apps/catalog)

```
POST /api/auth/signup    GET/POST/PATCH/DELETE /api/books
POST /api/auth/login     GET/POST /api/books/:id/reviews
GET /api/auth/me         GET/POST/PATCH/DELETE /api/authors
                         GET/POST/PATCH/DELETE /api/categories
```

## Pattern 5: Migrations + ORM

Generate migrations from your model definitions, then run them with the migration runner.
Share a single Kysely instance between the ORM and migration runner to avoid redundant connections.

```ts
import { Kysely } from "kysely"
import { createORM, defineModel, t } from "peta-orm"
import { createMigrationGenerator, createMigrationRunner } from "peta-migrate"

// Create a single Kysely instance
const kysely = new Kysely<any>({ dialect })

// Share it with the ORM — no redundant connection
const orm = createORM({ kysely })
orm.registerAll(User, Post)

// And with the migration runner
const runner = createMigrationRunner(orm.kysely)
await runner.ensureTable()
await runner.up(migrationFiles)

// Generate initial migration from model definitions
const gen = createMigrationGenerator()
const migrationCode = gen.generateInitialMigration(orm.models)
```

## Shared Configuration

When using packages together, these conventions keep configuration consistent:

| Concern | Convention |
|---------|-----------|
| **Password/secret length** | All secrets (session password, JWT secret) require minimum 32 characters |
| **Error codes** | ORM `DatabaseError` codes use `UNIQUE_CONSTRAINT`, `FOREIGN_KEY_CONSTRAINT` — consistent across SQLite, PG, MySQL |
| **Validation** | ArkType schemas are the single source of truth for validation in both ORM and Docs |
| **Module resolution** | All packages use `moduleResolution: "bundler"` with `verbatimModuleSyntax` |
