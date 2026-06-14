# Getting Started

## Prerequisites

- [Bun](https://bun.sh) >= 1.3
- TypeScript >= 5.0

## Installation

Each package is published independently to npm. Install only what you need:

```bash
# Pick what you need
bun add peta-orm           # ORM with models, relations, hooks
bun add peta-auth           # Encrypted cookie sessions, JWT, OAuth
bun add peta-docs           # OpenAPI 3.1 spec generation + Scalar UI
bun add peta-migrate        # Migration runner and generator
```

Add peer dependencies as needed:

```bash
bun add kysely              # Required by peta-orm and peta-migrate
bun add arktype             # Required by peta-orm and peta-docs
bun add hono                # Required by peta-auth/hono and peta-docs/hono
```

## Minimal Full-Stack Example

This example combines all three main packages in a single Hono app:

```ts
import { Hono } from "hono"
import { Database } from "bun:sqlite"
import { BunSqliteDialect } from "kysely-bun-sqlite"
import { createORM, defineModel, t } from "peta-orm"
import { session, requireSession } from "peta-auth/hono"
import { getOpenAPISpec, route, serveScalarUI } from "peta-docs"
import { type } from "arktype"

// --- Database ---
const orm = createORM({
  dialect: new BunSqliteDialect({ database: new Database(":memory:") }),
})

const User = defineModel("users", {
  columns: { id: t.integer().primaryKey(), name: t.string(255), email: t.text().unique() },
})
orm.registerAll(User)

// --- App ---
const app = new Hono()

app.use("*", session({ password: "a-32-char-password-for-aes-256!", cookieName: "app" }))

app.post("/users", route()
  .summary("Create a user")
  .requestBody(type({ name: "string", email: "string" }))
  .response(201, type({ id: "number", name: "string" }))
  .handle(async (c) => {
    const { name, email } = c.req.valid("json")
    const user = await User.insert({ name, email })
    return c.json(user.$toJSON(), 201)
  })
)

app.get("/users", requireSession(), route()
  .summary("List users")
  .response(200, type([{ id: "number", name: "string" }]))
  .handle(async (c) => {
    const users = await User.query().execute()
    return c.json(users.map((u) => u.$toJSON()))
  })
)

// --- Docs ---
app.get("/openapi.json", (c) => c.json(getOpenAPISpec(app, { title: "My App", version: "1.0.0" })))
app.get("/docs", ...serveScalarUI({ specUrl: "/openapi.json" }))

export default app
```

Run with `bun run file.ts` — Bun auto-starts the server.

## Project Layout

```
my-app/
├── src/
│   ├── db/
│   │   ├── schema.ts        # Model definitions
│   │   └── seed.ts          # Seed data
│   ├── routes/
│   │   ├── auth.ts
│   │   ├── users.ts
│   │   └── posts.ts
│   ├── middleware/
│   │   └── auth.ts          # Auth middleware
│   └── index.ts             # App entry point
├── migrations/              # Generated migration files
├── package.json
└── tsconfig.json
```

## Monorepo Quick Start

Clone the full peta-stack monorepo to explore all packages and demo apps:

```bash
git clone https://github.com/zfadhli/peta-stack.git
cd peta-stack
bun install

# Run the demo apps
bun run apps/conduit/src/index.ts      # RealWorld API (Medium clone)
bun run apps/catalog/src/index.ts      # Books API

# Run all tests
bun test

# Build all packages
bun run build
```

## Next Steps

- [Architecture overview](./architecture) — Understand package boundaries and design philosophy
- [Integration patterns](./integration) — See how packages compose in real patterns
- [Testing guide](./testing) — Testing strategies for each package and integration tests
