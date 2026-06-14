# Architecture

## Design Philosophy

Peta-stack is inspired by Laravel's cohesive ecosystem — an ORM with ActiveRecord-style models, encrypted sessions, API documentation, and migration tooling — all built for the **Bun runtime** with **TypeScript** at the core.

Key principles:

- **Modular over monolithic** — Each package is independently published to npm, versioned separately, and usable standalone. No framework lock-in.
- **Progressive complexity** — Simple CRUD is one line. Advanced features (polymorphic relations, graph operations, custom plugins) are available when needed.
- **Schema as source of truth** — ArkType column definitions drive validation, TypeScript inference, and OpenAPI docs from a single declaration.
- **No magic** — No monkey-patching, no Hono subclassing, no hidden global state. Works with vanilla `new Hono()`.

## Monorepo Layout

```
peta-stack/
├── packages/
│   ├── orm/          # peta-orm — ORM with Kysely + ArkType
│   ├── auth/         # peta-auth — sessions, JWT, OAuth, passwords
│   ├── docs/         # peta-docs — OpenAPI + Scalar docs
│   └── migrate/      # peta-migrate — migration tools
├── apps/
│   ├── conduit/      # RealWorld API (Medium clone) — JWT auth
│   └── catalog/      # Books API — session auth, role-based access
├── docs/             # Documentation site (Vitepress)
├── docker-compose.yml
└── package.json      # Workspace root
```

## Package Boundaries

```
                     ┌─────────────┐
                     │  peta-orm   │
                     │  (Kysely +  │
                     │   ArkType)  │
                     └──────┬──────┘
                            │ peer: kysely
              ┌─────────────┼─────────────┐
              │             │             │
       ┌──────▼──────┐ ┌───▼───┐ ┌──────▼──────┐
       │  peta-auth  │ │ Apps  │ │ peta-migrate │
       │ (iron-web-  │ │(demo) │ │ (kysely-    │
       │  crypto)    │ │       │ │  based)      │
       └─────────────┘ └───────┘ └─────────────┘
              │
       ┌──────▼──────┐
       │  peta-docs  │
       │ (ArkType →  │
       │  OpenAPI)   │
       └─────────────┘
```

### Dependency Rules

- **peta-orm** — No runtime deps on other peta packages. Only needs `kysely` and `arktype`.
- **peta-auth** — No runtime deps on other peta packages. Framework adapters (`hono`, `elysia`, `h3`) are optional peer deps.
- **peta-docs** — No runtime deps on other peta packages. `hono` is a runtime dep; `arktype` is optional.
- **peta-migrate** — No runtime deps on other peta packages. Only needs `kysely` as a peer.

This means you can use `peta-orm` without `peta-auth`, or `peta-auth` without the ORM — they are fully independent.

## Technology Choices

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Runtime** | Bun | Native TypeScript execution, built-in test runner, fast package manager, workspace support |
| **ORM foundation** | Kysely | Type-safe SQL query builder with dialect support for SQLite, PostgreSQL, MySQL |
| **Validation** | ArkType | Runtime validation + TypeScript inference from a single definition. Extensible schema system |
| **Encryption** | iron-webcrypto | AES-256-CBC + HMAC-SHA256. Stateless sessions — no server-side storage |
| **JWT** | jose | Standards-compliant JWT implementation. HS256 signing |
| **Password hashing** | @node-rs/argon2 | Native argon2id binding — fast and memory-hard |
| **Bundler** | tsdown | ESM-first bundler with dts generation. Rolldown-based |
| **Linting** | Biome | Fast, unified linter and formatter. Zero configuration overhead |
| **OpenAPI** | 3.1 / JSON Schema 2020-12 | Latest OpenAPI specification with full JSON Schema support |
| **Docs UI** | Scalar | Modern, interactive API reference. Web component, framework-agnostic |

## Workspace Resolution

The monorepo uses Bun workspaces (`"workspaces": ["packages/*", "apps/*"]`). Packages reference each other via `"workspace:*"` in `apps/package.json`. For development, TypeScript paths in `tsconfig.json` resolve workspace packages directly to source:

```json
// apps/catalog/tsconfig.json
"paths": {
  "peta-orm": ["../../packages/orm/src/index.ts"],
  "peta-auth": ["../../packages/auth/src/index.ts"],
  "peta-auth/*": ["../../packages/auth/src/*"],
  "peta-docs": ["../../packages/docs/src/index.ts"],
  "peta-docs/*": ["../../packages/docs/src/*"]
}
```

This enables full type-checking across workspace boundaries during development without building.

## Build Pipeline

Each package uses `tsdown` for building. The `prepublish` hook ensures `dist/` is fresh before publishing:

```bash
bun run build    # Runs tsdown for all packages
bun run build    # Each package outputs ESM (.mjs) + declarations (.d.mts)
```

Output targets `esnext` with `moduleResolution: "bundler"`.

## ArkType-First Architecture

A defining characteristic of peta-stack is using [ArkType](https://arktype.io) as the shared schema language across packages:

- **peta-orm** — Column definitions (`t.string()`, `t.integer()`) generate ArkType schemas internally for validation
- **peta-docs** — Route schemas (`.requestBody()`, `.query()`) accept ArkType types and convert them to JSON Schema for OpenAPI
- **TypeScript inference** — ArkType infers precise TypeScript types from schemas, providing end-to-end type safety

This means a single ArkType schema definition powers validation, TypeScript types, and OpenAPI documentation simultaneously.
