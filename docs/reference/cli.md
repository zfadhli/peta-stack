# CLI Reference

## peta (peta-orm + peta-migrate)

The `peta` CLI provides migration management commands. Available via the `bin/peta` entry in `peta-orm` or as a standalone binary in `peta-migrate`.

```bash
bun x peta <command> [options]
```

### Commands

#### `migrate:init`

Creates the migrations directory and tracking table.

```bash
bun x peta migrate:init
```

Creates the directory specified in `peta.config.ts` (default: `./migrations`) and the `_migrations` tracking table in your database.

#### `migrate:generate [name]`

Generates an initial migration file from your registered model definitions.

```bash
bun x peta migrate:generate CreateUsers
```

Creates a migration file named `<timestamp>_CreateUsers.ts` in the migrations directory with `up` and `down` functions generated from your models.

#### `migrate:up`

Runs all pending migrations.

```bash
bun x peta migrate:up
```

#### `migrate:down`

Rolls back the last batch of migrations.

```bash
bun x peta migrate:down
```

#### `migrate:status`

Shows the status of all migrations.

```bash
bun x peta migrate:status
```

Output lists completed and pending migrations.

### Configuration

Create a `peta.config.ts` file in your project root:

```ts
import { defineConfig } from "peta-migrate"

export default defineConfig({
  migrationsDir: "./migrations",
  models: ["./src/**/*.model.ts"],
  getKysely: () => db,
})
```

## Package Scripts

Each package has consistent scripts:

| Script | Description |
|--------|-------------|
| `bun run build` | Build package with tsdown |
| `bun run test` | Run tests |
| `bun run typecheck` | TypeScript type checking |
| `bun run lint` | Biome linting |
| `bun run format` | Biome formatting + fix |

## Root Monorepo Scripts

```bash
bun test              # Run all workspace tests
bun run typecheck      # Type-check all workspaces
bun run build          # Build all packages
bun run lint           # Biome lint all packages
bun run format         # Biome format all packages
bun run docs:dev       # Start Vitepress docs site
bun run docs:build     # Build Vitepress docs site
```
