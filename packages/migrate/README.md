# peta-migrate

[![npm version](https://img.shields.io/npm/v/peta-migrate?style=flat-square)](https://www.npmjs.com/package/peta-migrate)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org)
[![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)

Standalone migration runner and generator for [peta-orm](https://www.npmjs.com/package/peta-orm). Run, roll back, and generate database migrations with a clean programmatic API and CLI.

```bash
bun add peta-migrate kysely @libsql/kysely-libsql @libsql/client
```

Requires `kysely` as a peer dependency. SQLite via `@libsql/kysely-libsql`, PostgreSQL via `pg`, MySQL via `mysql2`.

---

## Quick Start

### Programmatic

```ts
import { createClient } from "@libsql/client"
import { LibsqlDialect } from "@libsql/kysely-libsql"
import { Kysely } from "kysely"
import { createMigrationRunner, createMigrationGenerator } from "peta-migrate"

const db = new Kysely({ dialect: new LibsqlDialect({ url: "file:my-app.db" }) })
const runner = createMigrationRunner(db)

await runner.ensureTable()  // create tracking table

await runner.up([
  {
    name: "001_create_users",
    up: async (k) => {
      await k.schema
        .createTable("users")
        .addColumn("id", "integer", (c) => c.autoIncrement().primaryKey())
        .addColumn("name", "varchar(255)", (c) => c.notNull())
        .execute()
    },
    down: async (k) => {
      await k.schema.dropTable("users").execute()
    },
  },
])

// Check status
const completed = await runner.getCompleted()  // MigrationRecord[]
const status = await runner.status()           // { completed: [...], pending: [...] }
```

### CLI

```bash
bun x peta migrate:init        # Create migrations directory and tracking table
bun x peta migrate:generate    # Generate initial migration from models
bun x peta migrate:up          # Run pending migrations
bun x peta migrate:status      # Show migration status
```

---

## API

### `createMigrationRunner(kysely)`

Creates a runner that manages migration execution.

| Method | Description |
|--------|-------------|
| `ensureTable()` | Create the migrations tracking table |
| `up(migrations)` | Apply pending migrations in order |
| `down()` | Roll back the last batch of migrations |
| `getCompleted()` | Return list of completed migration records |
| `status()` | Return `{ completed, pending }` with both lists |

### `createMigrationGenerator()`

Creates a generator that produces migration code from model definitions.

| Method | Description |
|--------|-------------|
| `generateInitialMigration(models)` | Generate a create-table migration from registered models |

### Configuration

```ts
import type { PetaMigrateConfig } from "peta-migrate"

const config: PetaMigrateConfig = {
  migrationsDir: "./migrations",
  models: ["./src/models/*.ts"],
  getKysely: () => db,
}
```

| Option | Type | Description |
|--------|------|-------------|
| `migrationsDir` | `string` | Directory to store migration files |
| `models` | `string[]` \| `string` | Glob patterns for model files |
| `getKysely` | `() => Kysely` | Function returning a Kysely instance |

---

## Types

```ts
interface MigrationFile {
  name: string
  up: (db: Kysely<unknown>) => Promise<void>
  down: (db: Kysely<unknown>) => Promise<void>
}

interface MigrationRecord {
  name: string
  appliedAt: string
}

interface MigrationStatus {
  completed: MigrationRecord[]
  pending: MigrationFile[]
}
```

---

## Related packages

- [peta-orm](../orm) — ORM with models, relations, hooks, soft deletes
- [peta-auth](../auth) — Encrypted cookie sessions, JWT, OAuth
- [peta-docs](../docs) — OpenAPI 3.1 spec generation + Scalar UI
