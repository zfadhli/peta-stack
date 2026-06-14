# Testing

## Unit Tests

Each package has its own test suite run with `bun test`. Tests use SQLite by default for fast, isolated runs.

```bash
# Run all tests across all packages
bun test

# Run a specific package's tests
cd packages/orm && bun test

# Run a single test file
cd packages/orm && bun test test/model.test.ts
```

### ORM Tests

```
292 pass, 2 todo
```

Located in `packages/orm/test/`. Covers:

- Model CRUD, query builder, pagination
- All relation types (HasMany, BelongsTo, HasOne, ManyToMany, HasManyThrough)
- Polymorphic relations (MorphTo, MorphMany, MorphOne)
- Graph operations (insertGraph, upsertGraph with #id/#ref)
- Hooks, timestamps, soft deletes, plugins
- Attribute casting, accessors, mutators
- Computed columns (runtime and batch)
- Global scopes, conditional chaining, collections
- Repository pattern
- Error handling (DatabaseError, ModelNotFoundError)
- Migration runner and generator

### Auth Tests

```
75 pass
```

Located in `packages/auth/test/`. Covers:

- Session creation, save, destroy, updateConfig
- Cookie size limit enforcement
- Hono, Elysia, Nuxt adapter middleware
- JWT sign/verify, expiry, tamper detection
- CSRF generate/validate
- Password hashing and verification
- Password reset token flow
- OAuth redirect and error paths

### Docs Tests

```
134 pass
```

Located in `packages/docs/test/`. Covers:

- OpenAPI spec generation (paths, parameters, request bodies, responses)
- Route chain API (all chain methods)
- Pagination, filtering, sorting, include, fieldsets
- Auth security scheme generation
- File-system route loading
- Scalar UI HTML generation
- Runtime validation
- Hono scanner

## Integration Tests

Integration tests verify ORM behavior against real databases using Docker.

```bash
# Start databases
docker compose up -d    # PostgreSQL 16 + MySQL 8.0

# Run all integration tests
cd packages/orm && bun test test/integration/

# Run against specific databases
INTEGRATION_SKIP_MYSQL=1 bun test test/integration/    # PG + SQLite only
INTEGRATION_SKIP_PG=1 bun test test/integration/        # MySQL + SQLite only
```

Integration tests run the same test suite against all available databases, verifying:

- Schema creation and migration
- CRUD operations
- Relations and eager loading
- Unique constraint and foreign key error normalization
- Migration runner

## App Tests

The demo apps (conduit, catalog) have their own test suites that test the full HTTP layer.

```bash
cd apps/conduit && bun test        # 35 tests
cd apps/catalog && bun test        # 59 tests
```

These tests use an in-memory SQLite database injected via a factory pattern:

```ts
// apps/catalog/test/setup.ts — test helper pattern
export function createTestORM() {
  const database = new Database(":memory:")
  const dialect = new BunSqliteDialect({ database })
  return createORM({ dialect })
}
```

### HURL Integration Tests

Both apps also have HURL-based integration tests that run against a real server:

```bash
bash apps/conduit/tests/hurl/run-api-tests-hurl.sh
bash apps/catalog/test/hurl/run.sh
```

These tests start the server, execute HTTP requests, and verify responses. They cover auth flows, error cases, and business logic.

## CI Pipeline

Two CI workflows run on every push to `main`:

### CI (ci.yml)

```yaml
- Lint        # biome ci packages/ apps/
- Build       # bun run build — builds all packages
- Type check  # bun run typecheck — tsc in all packages
- Tests       # bun test — unit tests across all packages
```

### Test Matrix (test.yml)

```yaml
- ORM (SQLite)        # Unit tests + integration
- ORM (PostgreSQL)    # Integration tests with Docker service
- ORM (MySQL)         # Integration tests with Docker service
- Catalog App Tests   # Full HTTP test suite
- Conduit App Tests   # Full HTTP test suite
```

## Writing Tests

### Test Pattern

Tests use Bun's built-in test runner, which is Jest-compatible:

```ts
import { describe, it, expect } from "bun:test"

describe("Feature", () => {
  it("works as expected", () => {
    expect(1 + 1).toBe(2)
  })
})
```

### Integration Test Pattern

Integration tests iterate over available database dialects:

```ts
import { getAvailableDialects, applySchemas, createDefaultSchemas } from "./setup.js"

for (const dialect of await getAvailableDialects()) {
  describe(`[${dialect.label}] CRUD`, () => {
    let ctx: DialectContext

    beforeAll(async () => {
      ctx = await dialect.create()
      await applySchemas(ctx.kysely, createDefaultSchemas(dialect.name))
    })

    afterAll(async () => {
      await ctx.destroy()
    })

    it("inserts a record", async () => {
      const user = await User.insert({ name: "Alice", email: "a@b.com" })
      expect(user.get("name")).toBe("Alice")
    })
  })
}
```
