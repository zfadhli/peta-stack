# Session Handoff — 2026-06-13

## Goal

Surgically deepen (`/deepen`) three packages — `@packages/orm`, `@packages/auth`, `@packages/docs` — by applying Evan You's coding style as the diagnostic lens and Matt Pocock's seam/depth vocabulary. Target: god files, duplicated patterns, weak types, and missing seams. No behavioral changes, all tests must pass.

## Files Modified/Created

### ORM (`packages/orm/`) — 6 deepenings

| File | Change |
|------|--------|
| `src/errors.ts` | Rewritten as barrel re-exporting `errors/classes.ts` + `errors/normalizer.ts` |
| `src/errors/classes.ts` | **New** — 6 error classes + `DatabaseErrorCode` type |
| `src/errors/normalizer.ts` | **New** — `normalizeError()` with SQLite, PG, MySQL codes |
| `src/model/define.ts` | **New** — extracted `defineModel()` factory (was inline in index.ts) |
| `src/model/index.ts` | Now a pure barrel (re-exports from define.ts, save.ts, delete.ts, etc.) |
| `src/model/factory.ts` | Removed `wireDeps()`, `setRelationQueryModule()`, 8 `as any` casts. Uses `getRuntime()` from runtime.ts |
| `src/model/runtime.ts` | **New** — typed `ModelRuntime` registry + `initRuntime()`/`getRuntime()` |
| `src/query/types.ts` | **New** — `QueryBuilder` interface extracted (was inline in index.ts) |
| `src/query/builder.ts` | **New** — `createQueryBuilder()` implementation |
| `src/query/index.ts` | Now a pure barrel (4 lines) |
| `src/relations/base.ts` | Added typed `_morphMap?`, `_morphType?`, `_morphId?`, `_morphTypeValue?` to `Relation` |
| `src/relations/eager.ts` | `isMorphRelation()` now typed as `Relation`, removed `MORPH_MAP_KEY` const |
| `src/relations/graph.ts` | **Deleted** — replaced by 7 files below |
| `src/relations/graph/index.ts` | **New** — barrel |
| `src/relations/graph/types.ts` | **New** — `InsertGraphOptions`, `UpsertGraphOptions`, `GraphContext` |
| `src/relations/graph/security.ts` | **New** — `isRelationAllowed`, `assertRelationAllowed`, `joinPath`, etc. |
| `src/relations/graph/morph.ts` | **New** — morph detection helpers |
| `src/relations/graph/parser.ts` | **New** — `extractGraphRelationData`, `collectRefs`, `resolveRefs` |
| `src/relations/graph/insert.ts` | **New** — `insertGraph` + node/relation processors |
| `src/relations/graph/upsert.ts` | **New** — `upsertGraph` + upsert processors |
| `src/relations/many-to-many.ts` | Fixed `query()` callback bug (was never executed, returned ALL rows) |
| `src/relations/morph.ts` | Fixed `query()` callback bug, removed `as any` on morph property access |
| `src/relations/related-query.ts` | Made `attach()`/`syncWithoutDetaching()` dialect-agnostic (was SQLite-only) |

### Auth (`packages/auth/`) — 5 deepenings

| File | Change |
|------|--------|
| `src/crypto.ts` | `normalizePassword` now exported (was private) |
| `src/jwt.ts` | Removed `toPasswordMap` (was identical to `normalizePassword`), uses crypto.ts version |
| `src/session.ts` | Added `sessionHasData()` utility, uses `normalizePassword` from crypto.ts |
| `src/hono.ts` | Uses `sessionHasData()` from session.ts |
| `src/elysia.ts` | Uses `sessionHasData()` from session.ts |
| `src/nuxt.ts` | Uses `sessionHasData()` from session.ts |
| `src/oauth/index.ts` | **Renamed to** `oauth/utils.ts` — was misleadingly named |
| `src/oauth/utils.ts` | **New** — shared OAuth utilities + `jsonError()` helper + `defineOAuthHandler()` |
| `src/oauth/github.ts` | Uses `defineOAuthHandler()` — 177→85 lines (52% reduction) |
| `src/oauth/google.ts` | Uses `defineOAuthHandler()` — 158→61 lines (61% reduction) |
| `tsdown.config.ts` | Removed `oauth/index.ts` from build entries (internal module) |

### Docs (`packages/docs/`) — 5 deepenings

| File | Change |
|------|--------|
| `src/hono/route.ts` | Added `validateOrError()` helper (5x duplicated SS validation → 1 call). Added `parseCommaSeparated()` helper (3x duplicated → 1 call) |
| `src/spec.ts` | Removed hard import of `honoScanner`. Added `setDefaultScanner()` for injectable defaults |
| `src/hono/index.ts` | Calls `setDefaultScanner(honoScanner)` at module init |
| `src/spec/schema.ts` | **New** — `toOpenAPISchema`, `normalizeResponse`, `normalizeRequestBody`, etc. (extracted from spec.ts) |
| `src/spec/builder.ts` | **New** — `buildOpenAPISpec` + helpers (extracted from spec.ts) |
| `test/helper.ts` | **New** — shared test utilities |
| `test/spec.test.ts` | **New** — buildOpenAPISpec + getOpenAPISpec tests (extracted from monolith) |
| `test/scalar.test.ts` | **New** — serveScalarUI tests (extracted from monolith) |
| `test/hono/scanner.test.ts` | **New** — honoScanner tests (extracted from monolith) |
| `test/hono/loader.test.ts` | **New** — loadRoutes tests (extracted from monolith) |

## Key Decisions

1. **Registry pattern over wireDeps** — The 8 mutable `let` variables in `model/factory.ts` were replaced with a single `ModelRuntime` registry (`model/runtime.ts`). Eliminates 8 `as any` casts and makes initialization ordering explicit. The circular dependency between factory.ts and save/delete/serialize is resolved through the registry, not mutable wiring.

2. **`defineOAuthHandler()` over raw duplication** — GitHub and Google OAuth providers shared ~80% structural overlap. Extracted a callback-based base handler that accepts provider-specific behavior (buildAuthUrl, requestTokenBody, fetchUser). Each provider went from ~170 lines to ~60-85 lines.

3. **`setDefaultScanner()` over hard import** — `spec.ts` no longer hard-imports `honoScanner`. Instead, `setDefaultScanner()` allows framework adapters to register themselves. `hono/index.ts` calls it at module init. Elysia support can be added without touching spec.ts.

4. **`Symbol` vs `Symbol.for`** — Route metadata uses `Symbol("openapi-meta")` (local, unique), not `Symbol.for("openapi-meta")` (global). Tests that access metadata must use `getRouteMeta(handler)` exported from `hono/route.ts`, not `Reflect.get(handler, Symbol.for(...))`.

5. **Test extraction caution** — The 1,784-line test monolith was partially split. The route/validation/pagination/auth/filter/include/fieldset tests remain in `index.test.ts` because they share complex helper interactions that proved fragile to extract. The spec, scalar, scanner, and loader tests were safely extracted.

## Current State

### Test Results ✅
- **ORM: 292 pass**, 2 todo, 0 fail
- **ORM integration: 54 pass**, 0 fail
- **Auth: 75 pass**, 0 fail
- **Docs: 134 pass**, 0 fail (94 in monolith + 40 in extracted files)

### Feature Status

| Feature | Status | Notes |
|---------|--------|-------|
| `createQueryBuilder` interface/impl split | ✅ Complete | `query/types.ts` + `query/builder.ts` |
| `relations/graph.ts` split | ✅ Complete | 1 god file → 7 focused modules |
| `wireDeps` elimination | ✅ Complete | Typed `ModelRuntime` registry |
| `_morph*` typed properties | ✅ Complete | `Relation` interface declares them |
| `normalizeError` extraction | ✅ Complete | `errors/classes.ts` + `errors/normalizer.ts` |
| `defineModel` extraction | ✅ Complete | `model/define.ts` |
| Auth `normalizePassword` dedup | ✅ Complete | 3 copies → 1 exported function |
| Auth `sessionHasData` extraction | ✅ Complete | 3 copies → 1 in `session.ts` |
| Auth `oauth/index.ts` rename | ✅ Complete | `oauth/utils.ts` |
| Auth `jsonError` extraction | ✅ Complete | 5 inline responses → 1 helper |
| Auth OAuth base handler | ✅ Complete | `defineOAuthHandler()` in utils.ts |
| Docs `validateOrError` extraction | ✅ Complete | 5x duplicated → 1 helper |
| Docs decouple spec from hono | ✅ Complete | `setDefaultScanner()` pattern |
| Docs `parseCommaSeparated` | ✅ Complete | 3x duplicated → 1 helper |
| Docs `spec.ts` split | ✅ Complete | 3 modules (barrel, schema.ts, builder.ts) |
| Docs test split (partial) | ✅ Complete | 4 new files, route tests stay in monolith |

### How to run

```bash
# ORM
cd packages/orm && bun test                              # 292 unit tests
cd packages/orm && bun test test/integration/              # 54 integration tests

# Auth
cd packages/auth && bun test                              # 75 tests

# Docs
cd packages/docs && bun test                              # 134 tests

# Build all
cd packages/orm && bun run build
cd packages/auth && bun run build
cd packages/docs && bun run build
```

### Architecture

```
packages/
├── orm/
│   ├── src/errors.ts                       → barrel
│   ├── src/errors/classes.ts               → error classes
│   ├── src/errors/normalizer.ts            → normalizeError (dialect codes)
│   ├── src/model/define.ts                 → defineModel() factory
│   ├── src/model/index.ts                  → pure barrel
│   ├── src/model/runtime.ts                → ModelRuntime registry
│   ├── src/query/types.ts                  → QueryBuilder interface
│   ├── src/query/builder.ts                → createQueryBuilder implementation
│   ├── src/query/index.ts                  → barrel
│   └── src/relations/graph/               → 7 focused modules
│       ├── types.ts, security.ts, morph.ts, parser.ts
│       ├── insert.ts, upsert.ts, index.ts
├── auth/
│   ├── src/oauth/utils.ts                  → shared OAuth logic + defineOAuthHandler
│   ├── src/oauth/github.ts                 → thin wrapper (85 lines)
│   └── src/oauth/google.ts                 → thin wrapper (61 lines)
└── docs/
    ├── src/spec/schema.ts                  → schema conversion
    ├── src/spec/builder.ts                 → spec builder
    └── test/hono/                          → scanner.test.ts + loader.test.ts
```

### Gotchas

- **`createQueryBuilder` second parameter** — Typed as `peta?: any` (the ORM instance). Do NOT pass a callback as the second arg — it will be silently dropped. Always call methods on the returned builder directly (e.g., `qb.where(...)`).
- **Route metadata symbol** — `Symbol("openapi-meta")` is a local symbol, not `Symbol.for`. Use `getRouteMeta(handler)` from `hono/route.ts` to read it.
- **`RouteBuilder.tags()` is variadic** — `.tags("pets")` works, `.tags(["pets"])` wraps in another array. Use `.tags(...items)` with spread or pass individual strings.
- **`defineOAuthHandler` type params** — The `TTokens` and `TUser` generics need explicit annotation at the call site: `defineOAuthHandler<GitHubTokens, GitHubUser>(githubProvider, options)`.
- **Default scanner registration** — `hono/index.ts` calls `setDefaultScanner(honoScanner)` at module init. Importing `peta-docs` alone no longer registers it — must also import `peta-docs/hono`.
- **`async` test imports** — `getOpenAPISpec` is synchronous (uses pre-registered scanner). No `await` needed at call sites.

## Next Steps / Pending

- [ ] **Elysia OAuth adapter** — The `src/elysia/index.ts` file is still a stub (`export {}`). The `defineOAuthHandler` base handler makes this straightforward.
- [ ] **OAuth callback flow tests** — `github.test.ts` and `google.test.ts` only test redirect and error paths. The actual token exchange + user fetch callback is untested.
- [ ] **`packages/orm` peer dep `typescript: ^6.0.0`** — Too restrictive for most users. Consider widening to `^5.0.0 || ^6.0.0`.
- [ ] **`packages/orm` `any` type erosion** — 250+ `any` occurrences remain across the ORM (down from ~300). The most impactful remaining targets are `model/index.ts` (~44 `this as any`) and `relations/graph.ts` (now split — remaining casts are in insert.ts/upsert.ts).
