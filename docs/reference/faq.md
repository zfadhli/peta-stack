# FAQ

## General

### What is peta-stack?

A collection of TypeScript libraries for Bun — ORM, auth, API docs, and migrations. Inspired by Laravel's ecosystem but built for modern TypeScript/Bun.

### Do I need to use all packages?

No. Each package is independently published and has zero dependencies on other peta packages. Use just the ORM, or just auth, or any combination.

### Which databases are supported?

SQLite (via `kysely-bun-sqlite`), PostgreSQL, and MySQL. Integration tests run against all three via Docker.

### What TypeScript version is required?

TypeScript ^5.0 or ^6.0 (published with ^6.0 peer dependency, compatible with both).

## ORM

### How is peta-orm different from raw Kysely?

peta-orm adds ActiveRecord-style models with `$save()`, `$delete()`, `$reload()`, declarative relations, eager loading, lifecycle hooks, soft deletes, casting, serialization control, scopes, pagination, collections, and automatic validation — all on top of Kysely's type-safe SQL builder.

### Can I use raw Kysely queries alongside ORM models?

Yes. Access the underlying Kysely instance via `orm.kysely` for raw queries.

You can also pass a pre-existing Kysely instance into `createORM({ kysely })` to share a single connection between the ORM and other tools (migration runners, raw query builders, etc.).

### How do migrations work?

Define models, then generate an initial migration with `createMigrationGenerator().generateInitialMigration(models)`. Run migrations with `createMigrationRunner(kysely).up(files)`. Or use the `peta` CLI.

### What is validation based on?

Column definitions use ArkType schemas (`t.string(255).email().unique()`). These schemas automatically validate data on insert and update. No separate validation step needed.

## Auth

### Is session data stored on the server?

No. Sessions are stateless — encrypted and signed cookies stored on the client. No database, Redis, or server-side storage needed.

### How are sessions encrypted?

AES-256-CBC with HMAC-SHA256 integrity checking via `iron-webcrypto`.

### Which frameworks are supported?

Hono, ElysiaJS, and Nuxt (h3). Each has a dedicated adapter at a subpath import (`peta-auth/hono`, `peta-auth/elysia`, `peta-auth/nuxt`).

### How do I rotate session secrets?

Pass an object to `password`: `{ 1: "old-secret", 2: "new-secret" }`. New cookies use the highest key; old cookies still decrypt with lower keys.

## Docs

### Can I use peta-docs without ArkType?

No — peta-docs is designed around ArkType schemas. The `route()` chain methods accept ArkType types as the schema argument.

### Can I use peta-docs with frameworks other than Hono?

Yes — implement the `RouteScanner` interface to extract route metadata from any framework.

### Does peta-docs modify my Hono app?

No. It reads route metadata via `app.routes` (Hono's public API) and via a `Symbol` property on handler functions. No monkey-patching.

## Development

### How do I run the demo apps?

```bash
git clone https://github.com/zfadhli/peta-stack.git
cd peta-stack
bun install
bun run apps/conduit/src/index.ts    # Medium clone API
bun run apps/catalog/src/index.ts    # Books API
```

### How do I run integration tests?

```bash
docker compose up -d    # PostgreSQL 16 + MySQL 8.0
cd packages/orm
bun test test/integration/
```

### How do I build the docs site?

```bash
bun run docs:dev        # Live preview
bun run docs:build      # Static site to docs/.vitepress/dist/
```
