# AGENTS.md

## Project Overview

**Peta Stack** is a modular full-stack TypeScript toolkit for Bun, consisting of four published npm packages and two example apps in a monorepo.

| Package | Version | Description |
|---------|---------|-------------|
| `peta-orm` | 0.5.0 | ActiveRecord-style ORM on Kysely with ArkType validation, relations, hooks, plugins, pagination |
| `peta-auth` | 0.2.3 | Stateless encrypted cookie sessions, JWT, CSRF, OAuth, password hashing — Hono, Elysia & Nuxt adapters |
| `peta-docs` | 0.3.3 | OpenAPI 3.1 spec generation + Scalar UI from ArkType-typed routes |
| `peta-migrate` | 0.2.2 | Migration runner and generator for peta-orm (snapshot/diff/push/seed) |

**Apps:** `apps/catalog` (e-commerce API) and `apps/conduit` (RealWorld API) — both built with Hono + peta-orm + peta-auth + peta-docs.

**Toolchain:** Bun 1.3, TypeScript 6, Biome 2.5, tsdown, Lefthook, GitHub Actions.

### Architecture Decisions

- **ESM-only** — all packages are `"type": "module"`, imports use `.ts` extensions in source
- **No `any` or `as` casts** — strict TypeScript enforced across the board
- **Small focused files** — 200–400 lines typical, max 800; many small files over few large ones
- **Composition API** — function-based, no classes where avoidable
- **Kysely + ArkType** — ORM delegates query building to Kysely; validation via ArkType schemas (no Zod)
- **tsdown** — lightweight ESM bundler for package builds (replaces tsup/rollup)

---

## Setup Commands

### First-time setup

```bash
# Install Bun (if not present)
curl -fsSL https://bun.sh/install | bash

# Install all workspace dependencies (root + packages + apps + docs)
bun install

# Start local databases for integration tests (Docker required)
docker compose up -d   # PostgreSQL (5432) + MySQL (3306)
```

### Common commands (run from root)

```bash
bun install              # Install all workspace dependencies (add --frozen-lockfile for CI)
bun run build            # Build all packages (tsdown in each package)
bun run lint             # Biome check on packages/ and apps/
bun run format           # Biome auto-fix on packages/ and apps/
bun run typecheck        # tsc --noEmit across all workspaces
bun test                 # Run all workspace tests (NODE_ENV=test)
```

### Per-package commands

```bash
# Navigate to any package/app, then:
bun test                 # Run tests for that package
bun run typecheck        # TypeScript check for that package
bun run build            # Build (tsdown) for that package
bun run lint             # Biome lint for that package
bun run lint:fix         # Biome auto-fix for that package
```

---

## Development Workflow

1. **Branch** — create a feature/fix branch from `main`
2. **Install** — `bun install` if any dependencies changed
3. **Develop** — edit source files in `packages/*/src/` or `apps/*/src/`
4. **Type-check** — `bun run typecheck` (or `bun run --filter=<package> typecheck`)
5. **Test** — `bun test` in the relevant package; add tests alongside code
6. **Lint** — `bun run lint` (pre-commit hook runs Biome automatically via lefthook)
7. **Commit** — lefthook pre-commit hook lints staged files; pre-push hook runs full `biome ci`
8. **Push** — GitHub Actions runs lint → build → typecheck → test

### Running apps

```bash
bun run --filter=catalog dev    # Start catalog API dev server
bun run --filter=conduit dev    # Start conduit API dev server
bun run docs:dev                # Start Vitepress docs site
```

### App-specific commands

```bash
# Catalog
bun run --filter=catalog seed         # Seed database
bun run --filter=catalog test:hurl    # Run Hurl API integration tests

# Conduit
bun run --filter=conduit seed         # Seed database
bun run --filter=conduit test:hurl    # Run Hurl API integration tests
```

---

## Testing Instructions

### Test framework

The project uses **Bun's built-in test runner** (`bun test`) — no Jest, Vitest, or test framework config required. Test files use `describe`/`it`/`expect` from `bun:test`:

```ts
import { describe, it, expect } from "bun:test"
```

### Test structure

```
packages/orm/test/
  model.test.ts          # Unit tests (co-located by feature)
  integration/           # Integration tests requiring databases
    *.test.ts
  fixtures/              # Shared test fixtures
```

### Running tests

```bash
# All tests in a package
bun test                                          # from package root
bun run test                                      # from package root

# All workspace tests
bun test                                          # from monorepo root

# Specific test file
bun test packages/orm/test/model.test.ts

# Tests matching a name pattern
bun test -t "soft deletes"

# Integration tests (require docker compose up -d first)
bun test packages/orm/test/integration/
```

### Integration test databases

Start before running integration tests:

```bash
docker compose up -d   # Starts PostgreSQL (port 5432) and MySQL (port 3306)
# Environment variables are auto-configured per CI workflow
# Set INTEGRATION_SKIP_MYSQL=1 or INTEGRATION_SKIP_PG=1 to skip a dialect
```

### Test conventions

- Tests use `NODE_ENV=test` (set automatically via `package.json` scripts)
- Each test should clean up its own database state (in-memory SQLite by default)
- Integration tests test against real databases (SQLite file, PostgreSQL, MySQL)
- Add tests for any new feature or bug fix — even if not explicitly asked for

---

## Code Style

### TypeScript

- **Strict mode** — `strict: true` in `tsconfig.base.json`
- **No `any`** — use `unknown` + type guards, or generics. Biome warns on `noExplicitAny`
- **No `as` casts** — prefer type guards or satisfies expressions
- **No `!` non-null assertions** — Biome has `noNonNullAssertion: off` as project choice, but prefer narrowing
- **`verbatimModuleSyntax: true`** — use `import type` for type-only imports
- **ESM** — all imports use full `.ts` extensions in source (e.g., `from "./foo.ts"`)
- **`ulid`** for primary keys and sortable unique IDs (root dependency)

### Biome (lint + format)

```bash
bun run lint              # Check all packages
bun run format            # Auto-fix all packages
bun run lint --filter=<pkg>  # Single package
```

Biome config (in `biome.json`):
- Indent: 2 spaces
- Line width: 120
- Trailing commas: always (all)
- Semicolons: as needed (omitted where unnecessary)
- Quote style: double
- Recommended preset with minor relaxations on `noForEach`, `noBannedTypes`, `noThisInStatic`

### File organization

- **Small files** — 200–400 lines typical, never exceed 800
- **Descriptive names** — no abbreviations: `userRepository` not `usrRepo`
- **Flat hierarchy** — maximize at one level of nesting under `src/`
- **Co-located** — test files in `test/` directory at package level, mirroring `src/` structure

### Imports

```ts
// Type-only imports (required by verbatimModuleSyntax)
import type { User } from "./types.ts"

// Value imports
import { defineModel } from "./model.ts"

// Workspace imports (from another package)
import { defineModel } from "peta-orm"
```

### Naming conventions

| Category | Convention | Example |
|----------|-----------|---------|
| Variables/functions | camelCase | `findUser()`, `userName` |
| Types/interfaces | PascalCase | `User`, `ModelConfig` |
| Files | kebab-case | `soft-deletes.ts`, `has-many.ts` |
| Constants | UPPER_SNAKE_CASE | `MAX_RETRY_COUNT` |
| Private/internal | underscore prefix | `_buildQuery()` (rare; prefer module-private) |

### Error handling

- Typed error classes (not `throw "string"`)
- Normalized database errors via `DatabaseError` with dialect-aware codes
- Good error messages with context

---

## Build and Deployment

### Package builds (tsdown)

Each package uses `tsdown` to bundle:

```bash
# Build a single package
bun run build                   # from package root

# Build all packages
bun run build                   # from monorepo root
```

Output: `packages/*/dist/` — ESM (`.mjs`) + TypeScript declarations (`.d.mts`).

tsdown config lives in each package's `tsdown.config.ts`. Common pattern:
- Entry: `src/index.ts`
- Format: ESM
- Target: `esnext`
- Platform: `node`
- Never-bundle list: `["arktype", "cac", "kysely", "ora"]` (external peer deps)

### Publishing (npm)

Publishing is **tag-driven** via GitHub Actions (`publish.yml` workflow):

```bash
# Create a git tag to trigger publish
git tag peta-orm@0.6.0
git push origin peta-orm@0.6.0
```

Tag format: `{package-name}@{semver}`

Supported packages: `peta-orm`, `peta-auth`, `peta-docs`, `peta-migrate`

The workflow:
1. Parses `<package>@<version>` from the tag
2. Builds all packages (ensures deps are fresh)
3. Publishes only the tagged package to npm with `--provenance --access public`
4. Creates a GitHub Release with auto-generated notes

Manual trigger: `workflow_dispatch` with a `tag` input is also available.

### CI/CD pipeline

GitHub Actions (`ci.yml`) runs on every push/PR to `main`:
1. **Lint** — `biome ci` on `packages/*/src/` and `apps/`
2. **Build** — `bun run build` (all packages)
3. **Type check** — `bun run typecheck` (all workspaces)
4. **Test** — `bun test` (all workspaces)

Separate test matrices run ORM integration tests against SQLite, PostgreSQL, and MySQL (`test.yml`).

---

## Monorepo Instructions

### Workspace structure

```
peta-stack/
├── packages/          # Published npm packages
│   ├── orm/           # peta-orm
│   ├── auth/          # peta-auth
│   ├── migrate/       # peta-migrate
│   └── docs/          # peta-docs
├── apps/              # Example applications (private, not published)
│   ├── catalog/       # e-commerce API (Hono)
│   └── conduit/       # RealWorld API (Hono)
├── docs/              # Documentation site (Vitepress)
├── biome.json         # Shared Biome config
├── tsconfig.base.json # Shared TypeScript base config
└── package.json       # Root workspace config
```

### Cross-package dependencies

Workspace dependencies use `workspace:*` protocol:

```json
{
  "dependencies": {
    "peta-orm": "workspace:*"
  }
}
```

Bun resolves these automatically. No manual linking needed.

### Running commands on specific workspaces

```bash
# Run a script in one package
bun run --filter=peta-orm build
bun run --filter=catalog dev

# Run a script in all packages
bun run --filter='*' build
bun run --filter='*' typecheck
```

### Adding a new package

```bash
# Create the directory
mkdir -p packages/my-pkg/src
mkdir -p packages/my-pkg/test

# Initialize package.json with workspace name
# Name it "peta-{name}" for published packages
# Add "packages/my-pkg" to root workspaces if needed (root workspaces uses glob)
```

### Adding dependencies

```bash
# Global dev dependency (root)
bun add -d typescript

# Dependency for a specific package
bun add hono --filter=peta-auth

# Workspace dependency between packages
bun add peta-orm@workspace:* --filter=peta-migrate
```

---

## Pull Request Guidelines

### Title format

```
[package-name] Brief description of change
```

Examples:
- `[peta-orm] Add support for composite primary keys`
- `[peta-auth] Fix session cookie expiration on Hono adapter`
- `[catalog] Implement product search endpoint`

### Before submitting

- [ ] `bun run typecheck` passes with no errors
- [ ] `bun test` passes in the affected package(s)
- [ ] `bun run lint` passes (no Biome warnings)
- [ ] New code has corresponding tests
- [ ] No `console.log` or debug statements remain
- [ ] No hardcoded secrets, API keys, or tokens
- [ ] Changes to published packages include version bumps if needed

### Commit conventions

- Use meaningful commit messages, not "fix" or "update"
- Match existing commit style in the repo (check `git log --oneline` for examples)
- Keep commits focused on a single change

---

## Debugging and Troubleshooting

### Common issues

| Problem | Likely cause | Fix |
|---------|-------------|-----|
| `Cannot find module 'peta-orm'` | Workspace deps not installed | `bun install` from root |
| `bun test` fails with DB errors | Database not running | `docker compose up -d` |
| TypeScript errors on `import type` | Missing `verbatimModuleSyntax` in tsconfig | Check `tsconfig.json` |
| Biome lint warnings on `noExplicitAny` | `any` type used | Replace with `unknown` + type guard |
| `bun run build` fails | tsdown peer deps not installed | `bun install` in package |

### Type checking

```bash
# Quick check on a single package
bun run --filter=peta-orm typecheck

# Full workspace check (may be slow)
bun run typecheck
```

### Working with Biome

Biome replaces both ESLint and Prettier. Commands:

```bash
bunx biome check src/        # Check files (dry run)
bunx biome check --write src/  # Auto-fix what's safe
bunx biome ci src/           # CI mode (fail on any issue, including formatting)
```

### Lefthook git hooks

- **pre-commit**: Runs `biome check --write --unsafe` on staged `.ts/.js/.mjs/.json` files
- **pre-push**: Runs `biome ci` on all source directories

If a commit is rejected by lefthook, fix the lint issues and retry. Do not skip hooks.

---

## Security Considerations

- **No secrets in code** — use environment variables (`.env` files are gitignored)
- **peta-auth** uses AES-256-GCM encryption for session cookies (via `iron-webcrypto`)
- **Password hashing** via `@node-rs/argon2`
- **JWT** created and verified with `jose`
- **CSRF protection** available in peta-auth
- All published packages verified with npm provenance

---

## Important Context for Agents

- This is a **Bun-first** project — do NOT use npm/pnpm/yarn for any command. Always use `bun`.
- The ORM is built on **Kysely**, not Prisma/Drizzle/TypeORM. Queries use Kysely's expression builder.
- Validation uses **ArkType** (`.pipe(...)`, `.on(...)`), not Zod or Valibot.
- Build tool is **tsdown** (not tsup, rollup, or esbuild directly).
- Docs site uses **Vitepress** (not Docusaurus, Nextra, etc.).
- Always run `bun test` in the relevant package before committing ORM/migration changes.
- Tests should use `bun:test` imports — never import from `vitest`, `jest`, or `@types/jest`.
- The `NODE_ENV=test` environment variable is expected by some tests.
