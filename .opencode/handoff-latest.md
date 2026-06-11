# Session Handoff — 2025-06-11 06:30

## Goal

Full `/rebuild` of `peta-orm` → monorepo `peta-stack` following Evan You coding style:
function-based Composition API, strict TypeScript, minimal API surface, modular structure.

Also renamed `peta-hono` → `peta-docs` and added it to the monorepo.

## Files Modified/Created

### Monorepo structure
- `/` — root `package.json` (bun workspaces), `tsconfig.base.json`, `biome.json`
- `packages/orm/` — peta-orm (moved from root)
- `packages/auth/` — peta-auth (cloned from GitHub, fresh git history)
- `packages/docs/` — peta-docs (renamed from peta-hono)

### packages/orm/ — Full rebuild (class → function)
- `src/peta/index.ts` — `createPeta()` factory (replaced `Peta` class)
- `src/model/index.ts` — `defineModel()` factory (replaced `class Model`)
- `src/model/state.ts` — WeakMap-based model state (kept functional pattern)
- `src/model/save.ts`, `src/model/delete.ts` — persistence functions
- `src/model/hooks.ts` — hooks/soft-delete registration
- `src/model/scope.ts`, `src/model/relation.ts`, `src/model/serialize.ts`
- `src/builder/query.ts` — `createQueryBuilder()` factory (replaced `ModelQueryBuilder`)
- `src/builder/update.ts`, `src/builder/delete.ts`, `src/builder/eager.ts` — factories
- `src/collection/index.ts` — `createCollection()` factory
- `src/pagination/index.ts` — `createPaginator()` factory
- `src/columns/column.ts` — `createColumn()` factory (replaced `Column` class)
- `src/columns/arktype.ts`, `src/columns/types.ts`, `src/columns/schema.ts`
- `src/relations/relation.ts` — `hasMany()`, `belongsTo()`, `hasOne()`, `manyToMany()`, `hasManyThrough()` factories
- `src/relations/morph.ts` — `defineMorphTo/Many/One()` factories
- `src/hooks/index.ts` — `createHookManager()` factory
- `src/errors.ts` — error classes (kept as classes — exceptions for Error types)
- `src/types.ts` — `PetaLike`, `ModelLike`, `ModelId`
- `src/lib/id.ts`, `src/lib/kysely.ts` — type utilities
- `src/index.ts` — minimal barrel
- `src/migrations/runner.ts`, `src/migrations/generator.ts` — factory functions
- `src/migrations/cli.ts`, `src/migrations/config.ts`, `src/migrations/types.ts`
- `src/integrations/hono.ts`, `src/integrations/elysia.ts`
- **Deleted**: all 18 old class-based files (model.ts, query-builder.ts, peta.ts, etc.)
- **Added**: `tsdown.config.ts` (replaced `bun build` + `tsc`), deleted `tsconfig.build.json`

### packages/auth/ — Rebuild (pattern fixes)
- `src/errors.ts` — NEW `PetaAuthError` class
- `src/session.ts` — `opts`→`options`, `ttl`→`timeToLive`, raw throws→`PetaAuthError`
- `src/jwt.ts` — `exp`→`expiresIn`, raw throw→`PetaAuthError`
- `src/crypto.ts` — `pw`→`secret`, removed `as` casts
- `src/csrf.ts` — removed `as Record` casts (uses `IronSession` index signature)
- `src/elysia.ts` — type cast fixes
- `src/nuxt.ts` — raw throw→`PetaAuthError`
- `src/oauth/index.ts` — raw throw→`PetaAuthError`
- `src/index.ts` — re-exports `PetaAuthError`
- `test/errors.test.ts` — NEW tests for `PetaAuthError`

### packages/docs/ — Renamed from peta-hono, restructured
- `src/scanner.ts` — NEW framework-agnostic `RouteScanner` interface
- `src/hono/route.ts` — MOVED + auth guard injected in `handle()` (mechanism-level)
- `src/hono/scanner.ts` — MOVED from `hono-scanner.ts`, implements `RouteScanner`
- `src/hono/loader.ts` — MOVED, `Hono<any,any,any>` → opaque `AnyHono` alias
- `src/hono/index.ts` — NEW barrel for `peta-docs/hono` sub-path export
- `src/elysia/index.ts` — NEW scaffold
- `src/index.ts` — core-only exports (no hono-specific)
- `src/spec.ts`, `src/scalar.ts`, `src/types.ts` — unchanged logic
- `package.json` — renamed, added `./hono` export

## Key Decisions

1. **Monorepo via bun workspaces** — `"workspaces": ["packages/*"]` in root package.json. No pnpm/turbo/nx needed.

2. **22+ classes → factory functions** in peta-orm. Error classes kept as classes (exception for Error subclasses). Model uses `defineModel("table", { columns, relations, casts, ... })` instead of `class extends Model`.

3. **tsdown for both orm and auth** — unified build tooling. Replaced `bun build` + `tsc --declaration` with single `tsdown` command. Output is `.mjs` / `.d.mts`.

4. **`verbatimModuleSyntax: true`** across all packages via root tsconfig.base.json. Auth imports changed from `.ts` to `.js` extensions.

5. **Auth guard in peta-docs RouteBuilder.handle()** — `.auth("bearerAuth")` now injects a mechanism-level middleware that checks for `Authorization: Bearer` header presence at runtime, not just in the OpenAPI spec.

6. **Framework adapter pattern for peta-docs** — core (`spec`, `scalar`, `types`, `scanner` interface) is framework-agnostic in `src/`. Framework-specific code lives in `src/hono/`. Elysia scaffold ready for future.

7. **AkType `| undefined` issue** — ArkType's `toJsonSchema()` can't represent unions with `void`/`undefined` (throws `{ code: "unit" }`). Fix: remove `| undefined` from TypeScript type strings passed to `type()`. Values are already optional at the HTTP level.

8. **Many-to-many eager loading fix** — `addEagerConstraints` now selects pivot FK columns so `match()` can group results by parent model. Removed `_pivot_` / `_through_` prefix convention.

9. **JSON auto-stringify** — `set()`, `fill()`, and `saveModel()` auto-stringify objects for `casts: { col: "json" }` columns before sending to SQLite.

## Current State

### packages/orm ✅
- 156 tests pass
- TypeScript strict, 0 errors
- biome clean
- tsdown builds 3 entries (index, migrations/index, migrations/cli)

### packages/auth ✅
- 75 tests pass (1 new: PetaAuthError)
- TypeScript strict, 0 errors
- biome clean (some `noExplicitAny` warnings — acceptable for OAuth token handling)
- tsdown builds 9 entries

### packages/docs ✅
- 88 tests pass
- TypeScript strict, 0 errors
- biome clean
- tsdown builds 2 entries (core + hono)
- No remaining `[peta-hono]` references

### All examples runnable
- `packages/orm/examples/*.ts` — import from `../src/index.js`
- `packages/auth/examples/*.ts` — import from `../src/index.js`
- `packages/docs/examples/basic.ts` — clean run, no warnings

## Next Steps / Pending

- [ ] Publish packages to npm (update versions, changelogs)
- [ ] Add `packages/docs/elysia/` implementation (Elysia adapter for peta-docs)
- [ ] Consider adding runtime response validation to RouteBuilder.handle()
- [ ] Update root README.md to describe monorepo structure
- [ ] The `loadRoutes` test for peta-docs dynamically creates temp dirs with files that import from the source. If deep-link paths break (like the `../../../../src/hono/index.ts`), those tests will fail.

## Important Context

### Architecture
```
peta-stack/
├── package.json            # workspaces: ["packages/*"]
├── tsconfig.base.json      # shared strict base (verbatimModuleSyntax: true)
├── biome.json              # unified config
├── packages/
│   ├── orm/                # peta-orm — function-based ORM on Kysely
│   ├── auth/               # peta-auth — encrypted cookie sessions
│   └── docs/               # peta-docs — OpenAPI/Scalar docs toolkit
```

### Running things
```bash
# Run all tests
cd packages/orm && bun test        # 156 tests
cd packages/auth && bun test       # 75 tests
cd packages/docs && bun test       # 88 tests

# Typecheck
cd packages/orm && bun run typecheck
cd packages/auth && bun run typecheck
cd packages/docs && bun run typecheck

# Build
cd packages/orm && bun run build    # tsdown
cd packages/auth && bun run build   # tsdown
cd packages/docs && bun run build   # tsdown (2 entries)

# Run examples
bun run packages/orm/examples/01-basic-setup.ts
bun run packages/auth/examples/jwt-basic.ts
bun run packages/docs/examples/basic.ts
```

### Gotchas
- ArkType `| undefined` in `type()` strings breaks `toJsonSchema()` — don't add it
- `packages/docs/` was copied from `peta-hono` repo without `.git` — clean history
- `packages/auth/` was copied from GitHub — fresh history in peta-stack
- The `packages/orm/bin/peta` CLI uses `../dist/migrations/cli.mjs` — update if build output changes
- Backup branches: `rebuild-backup-20260610-200839` (orm), `rebuild-auth-backup-20260611-051325` (auth)
