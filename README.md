# Peta Stack

[![npm version](https://img.shields.io/npm/v/peta-orm?style=flat-square)](https://www.npmjs.com/package/peta-orm)
[![npm version](https://img.shields.io/npm/v/peta-auth?style=flat-square)](https://www.npmjs.com/package/peta-auth)
[![npm version](https://img.shields.io/npm/v/peta-docs?style=flat-square)](https://www.npmjs.com/package/peta-docs)
[![npm version](https://img.shields.io/npm/v/peta-migrate?style=flat-square)](https://www.npmjs.com/package/peta-migrate)
[![CI](https://img.shields.io/github/actions/workflow/status/zfadhli/peta-stack/ci.yml?style=flat-square&label=CI)](https://github.com/zfadhli/peta-stack/actions)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org)
[![Bun](https://img.shields.io/badge/Bun-1.3-black?style=flat-square&logo=bun)](https://bun.sh)
[![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)

A modular full-stack TypeScript toolkit — ORM, auth, API docs, and migrations, designed to work together or standalone.

- **peta-orm** — ActiveRecord-style ORM built on Kysely with ArkType validation, relations, hooks, soft deletes, and more
- **peta-auth** — Stateless encrypted cookie sessions (Hono, Elysia, Nuxt), JWT, CSRF, OAuth, password hashing
- **peta-docs** — OpenAPI 3.1 spec generation + Scalar UI from ArkType-typed routes, filesystem routing
- **peta-migrate** — Migration runner and generator for peta-orm

---

## Packages

### peta-orm

A feature-rich ORM wrapping [Kysely](https://kysely.dev) with [ArkType](https://arktype.io) validation and a Laravel-inspired API.

```ts
const User = defineModel("users", {
  columns: {
    id: t.integer().primaryKey(),
    name: t.string(255),
    email: t.text().unique(),
  },
  relations: {
    posts: hasMany(() => Post, { foreignKey: "userId" }),
  },
})

// Full CRUD, eager loading, pagination
const user = await User.insert({ name: "Alice", email: "alice@test.com" })
const posts = await User.relations.posts.query(user).execute()
const page = await Post.query().with("author").orderBy("id", "asc").paginate(1, 20)
```

[Read the package docs →](./packages/orm/README.md)

| Feature | Description |
|---------|-------------|
| **Models** | ActiveRecord-style with typed columns, accessors, mutators, computed columns |
| **Relations** | HasMany, BelongsTo, HasOne, ManyToMany, HasManyThrough, Polymorphic (MorphTo/MorphMany) |
| **Eager loading** | `.with("posts.author")` — dot notation, nested relations |
| **Graph operations** | `insertGraph()` / `upsertGraph()` for nested creates with refs |
| **Validation** | Automatic via ArkType column schemas — no separate validation step |
| **Hooks** | beforeCreate/afterCreate, beforeUpdate/afterUpdate, beforeDelete/afterDelete |
| **Plugins** | Soft deletes, timestamps, ULID. Custom plugin API |
| **Scopes** | Global scopes, `when`/`unless` conditional chaining |
| **Casting** | JSON, boolean, date, number — automatic on get/set |
| **Serialization** | `$hidden`, `$visible`, `$appends`, `$toJSON()` |
| **Pagination** | `.paginate(1, 20)` — returns `{ data, total, perPage, currentPage, lastPage, hasMorePages }` |
| **Collections** | `.pluck("name")`, `.groupBy("role")`, `.load("posts")`, `.chunk(10)` |
| **Error handling** | Normalized `DatabaseError` with dialect-aware codes (SQLite, PG, MySQL) |
| **Repository pattern** | `Repo.makeHelper()`, query method wrappers |
| **CLI** | `peta` binary with migration commands |
| **Database support** | SQLite (via `@libsql/client`), PostgreSQL, MySQL |
| **Examples** | 32 runnable TypeScript examples covering every feature |

### peta-auth

Stateless, encrypted cookie sessions for Bun. No server-side storage needed.

```ts
import { session, requireSession } from "peta-auth/hono"

const app = new Hono()
app.use("*", session({ password: "a-32-char-password-for-aes-256!", cookieName: "session" }))
app.get("/me", requireSession(), (c) => c.json(c.var.session))
```

[Read the package docs →](./packages/auth/README.md)

| Feature | Description |
|---------|-------------|
| **Sessions** | AES-256-CBC + HMAC-SHA256 sealed cookies via `iron-webcrypto` |
| **Adapters** | Hono middleware, Elysia plugin, Nuxt (h3) helpers |
| **Typed** | Generic parameter for typed session data |
| **Password rotation** | Oject syntax `{ 1: "old", 2: "new" }` for seamless rotation |
| **JWT** | HS256 signing and verification via `peta-auth/jwt` |
| **CSRF** | Token generation and validation via `peta-auth/csrf` |
| **Password hashing** | Argon2id via `@node-rs/argon2` |
| **Password reset** | Token-based reset flow with built-in expiry |
| **OAuth** | GitHub (authorization code) and Google (PKCE) handlers |
| **Cookie limits** | Automatic 4096-byte cookie size enforcement |

### peta-docs

Generate OpenAPI 3.1 specs from ArkType-typed routes and serve an interactive Scalar API reference.

```ts
import { getOpenAPISpec, serveScalarUI } from "peta-docs"
import { route } from "peta-docs/hono"

app.get("/pets", route()
  .query(type({ name: "string", age: "number" }).partial())
  .response(200, type({ id: "number", name: "string" }))
  .handle((c) => c.json(dogs)))

app.get("/openapi.json", (c) => c.json(getOpenAPISpec(app, { title: "My API", version: "1.0.0" })))
app.get("/docs", ...serveScalarUI({ specUrl: "/openapi.json" }))
```

[Read the package docs →](./packages/docs/README.md)

| Feature | Description |
|---------|-------------|
| **Spec generation** | Builds OpenAPI 3.1 from ArkType schemas and route metadata |
| **Route chaining** | `.summary()`, `.params()`, `.query()`, `.requestBody()`, `.response()` |
| **Auto-validation** | Request validation built-in — no separate validation step |
| **Pagination/filter/sort** | High-level query APIs with automatic OpenAPI parameter generation |
| **File-system routing** | `loadRoutes()` mirrors directory structure to URL paths with `[param]` segments |
| **Scalar UI** | Interactive API reference with `serveScalarUI()` |
| **Extensible** | Custom `RouteScanner` interface for non-Hono frameworks |

### peta-migrate

Standalone migration runner and generator for peta-orm.

```ts
import { createMigrationRunner, createMigrationGenerator } from "peta-migrate"

const runner = createMigrationRunner(kysely)
await runner.up(migrationFiles)
await runner.down() // rollback last batch
```

| Feature | Description |
|---------|-------------|
| **Migration execution** | `up()`, `down()`, `status()`, `getCompleted()` |
| **Migration generation** | Auto-generates initial migrations from model definitions |
| **CLI** | `peta migrate:init`, `migrate:generate`, `migrate:up`, `migrate:status` |
| **Tracking** | Dedicated tracking table for completed migrations |

---

## Quick start

### Prerequisites

- [Bun](https://bun.sh) >= 1.3
- TypeScript >= 5.0

### Installation

```bash
# Pick what you need
bun add peta-orm peta-auth peta-docs peta-migrate
```

### Minimal example

```ts
import { createORM, defineModel, t, hasMany } from "peta-orm"
import { createClient } from "@libsql/client"
import { LibsqlDialect } from "@libsql/kysely-libsql"

const dialect = new LibsqlDialect({ url: ":memory:" })
const orm = createORM({ dialect })

const User = defineModel("users", {
  columns: { id: t.integer().primaryKey(), name: t.string(255), email: t.text().unique() },
  relations: { posts: hasMany(() => Post, { foreignKey: "userId" }) },
})
const Post = defineModel("posts", {
  columns: { id: t.integer().primaryKey(), userId: t.integer(), title: t.string(255) },
})

orm.registerAll(User, Post)

const user = await User.insert({ name: "Alice", email: "alice@test.com" })
const posts = await User.relations.posts.query(user).execute()
```

### Run the example apps

Clone the repo and try the full-featured demo applications:

```bash
git clone https://github.com/zfadhli/peta-stack.git
cd peta-stack
bun install

# Conduit (RealWorld API — Medium clone)
bun run apps/conduit/src/index.ts

# Catalog (Books API — ORM feature showcase)
bun run apps/catalog/src/index.ts
```

---

## Architecture

```
peta-stack/
├── packages/
│   ├── orm/          # peta-orm — ORM with Kysely + ArkType
│   │   ├── src/
│   │   ├── examples/ # 32 runnable examples
│   │   └── test/
│   ├── auth/         # peta-auth — sessions, JWT, OAuth, passwords
│   │   ├── src/
│   │   ├── examples/ # 15 runnable examples
│   │   └── test/
│   ├── docs/         # peta-docs — OpenAPI + Scalar docs
│   │   └── src/
│   └── migrate/      # peta-migrate — migration tools
│       └── src/
├── apps/
│   ├── conduit/      # RealWorld API (Medium clone)
│   └── catalog/      # Books API
├── docs/             # Vitepress documentation site
└── docker-compose.yml # PostgreSQL + MySQL for integration tests
```

Each package is independently published to npm and can be used standalone. They integrate seamlessly through shared conventions (ArkType schemas, TypeScript strict mode, ESM).

---

## Development

```bash
# Set up
git clone https://github.com/zfadhli/peta-stack.git
cd peta-stack
bun install

# Run all tests
bun test

# Type-check all packages
bun run typecheck

# Lint
bun run lint

# Build all packages
bun run build

# Run a specific package's tests
cd packages/orm && bun test

# Integration tests (requires Docker for PG/MySQL)
docker compose up -d
cd packages/orm && INTEGRATION_SKIP_MYSQL=1 bun test test/integration/
```

The project uses [Biome](https://biomejs.dev) for linting and formatting. Configuration is at `biome.json`.

```bash
# Format code
bun run format
```

### Database support

The ORM is tested against three databases via Docker:

```bash
docker compose up -d    # Starts PostgreSQL 16 + MySQL 8.0
cd packages/orm
bun test test/integration/ # Runs against all available dialects
```

Set `INTEGRATION_SKIP_PG=1` or `INTEGRATION_SKIP_MYSQL=1` to skip specific databases.

---

## Packages at a glance

| Package | npm | Description |
|---------|-----|-------------|
| [peta-orm](./packages/orm) | [![npm](https://img.shields.io/npm/v/peta-orm?style=flat-square&label=0.4.0)](https://www.npmjs.com/package/peta-orm) | ORM with models, relations, hooks, scopes, plugins, pagination |
| [peta-auth](./packages/auth) | [![npm](https://img.shields.io/npm/v/peta-auth?style=flat-square&label=0.2.1)](https://www.npmjs.com/package/peta-auth) | Encrypted cookie sessions, JWT, OAuth, password hashing |
| [peta-docs](./packages/docs) | [![npm](https://img.shields.io/npm/v/peta-docs?style=flat-square&label=0.3.1)](https://www.npmjs.com/package/peta-docs) | OpenAPI 3.1 spec generation + Scalar UI |
| [peta-migrate](./packages/migrate) | [![npm](https://img.shields.io/npm/v/peta-migrate?style=flat-square&label=0.1.1)](https://www.npmjs.com/package/peta-migrate) | Migration runner and generator |

## License

This project is [MIT licensed](LICENSE).
