# Session Handoff — 2026-06-12 11:17

## Goal

Complete ground-up rebuild of **peta-orm** (`packages/orm/`), a Kysely-based ORM for Bun/Node.js, informed by research on Objection.js, Sutando.js, and Orchid ORM. The rebuild spans 4 phases covering a thenable QueryBuilder, relation query builders, nested CRUD, computed columns, static hooks, repository pattern, plugin system, and 30 comprehensive examples.

## Files Modified/Created

### Core Source (`packages/orm/src/`)

**Phase 1 — Foundation (structure + thenable QB + aggregates + scopes):**
- `src/orm/index.ts` — `createORM()` registry (replaces `createPeta`)
- `src/model/types.ts` — `ModelInstance`, `ModelDefinition`, `ModelConfig` interfaces
- `src/model/state.ts` — WeakMap-based instance state management
- `src/model/save.ts` — Insert/update with nested relation support
- `src/model/delete.ts` — Soft/hard delete, restore, force-delete
- `src/model/serialize.ts` — `$toJSON` with hidden/visible/appends/casts
- `src/model/casts.ts` — Casting utilities (json, boolean, int, float, date)
- `src/model/factory.ts` — `createInstance()` — factory with circular-dep-safe wiring (`wireDeps`)
- `src/model/hooks.ts` — Instance hook manager, soft-delete/timestamp config store
- `src/model/scopes.ts` — Global scope management
- `src/model/relation.ts` — Instance-to-def mapping, lazy relation loading
- `src/model/computed.ts` — Computed column support (runtime + batch async)
- `src/query/index.ts` — Thenable QueryBuilder (implements `PromiseLike`), all QB methods
- `src/relations/base.ts` — `Relation` interface and types
- `src/relations/has-many.ts` — HasMany, HasOne, BelongsTo (one file)
- `src/relations/many-to-many.ts` — ManyToMany, HasManyThrough
- `src/relations/morph.ts` — Polymorphic relations (stub for MorphTo)
- `src/relations/eager.ts` — `EagerLoader` class
- `src/relations/index.ts` — Barrel

**Phase 2 — Relations + CRUD + Computed:**
- `src/relations/related-query.ts` — `RelationQuery` with `attach`/`detach`/`sync`
- `src/relations/crud.ts` — Nested create/update relation operations

**Phase 3 — Advanced:**
- `src/hooks/static.ts` — Static query hooks with `asFindQuery()` + `cancelQuery()`
- `src/repo/index.ts` — `createRepo()` repository pattern (Proxy-based)
- `src/plugins/index.ts` — `Plugin` type
- `src/plugins/timestamps.ts` — Built-in `timestamps()` plugin
- `src/plugins/soft-deletes.ts` — Built-in `softDeletes()` plugin

**Phase 4 — Power Features:**
- Migrations extracted to `packages/peta-migrate/` (6 files)

### Removed
- `src/builder/` (entire directory) — old query/update/delete/eager builders
- `src/peta/` — replaced by `src/orm/index.ts`
- `src/relations/relation.ts` — replaced by per-type files
- `src/model/scope.ts` — replaced by `src/model/scopes.ts`

### Tests (`packages/orm/test/`)
- `model.test.ts` — CRUD, thenable QB, pagination, computed columns
- `relation.test.ts` — All 5 relation types, eager loading, `$related()`, attach/detach/sync, nested CRUD, `allowGraph()`
- `hooks.test.ts` — HookManager, lifecycle hooks, timestamps, soft deletes, casting, serialization, static hooks
- `collection.test.ts` — Collection methods, paginator, global scopes, batch ops
- `errors.test.ts` — DatabaseError on constraint violations
- `column-types.test.ts` — All column types, modifiers, validation
- `migrations.test.ts` — Migration runner + generator
- `discover.test.ts` — registerAll, empty table skip
- `plugins.test.ts` — Plugin system, timestamps/soft-deletes plugins
- `repo.test.ts` — Repository pattern, `makeHelper`

### Examples (`packages/orm/examples/`)
- 01–21: Updated from old API (removed `.execute()`, `createPeta` → `createORM`, `registerTimestamps` → `.use(timestamps())`)
- 22–30: New examples covering `$related()`, attach/detach/sync, computed columns, static hooks, repository, plugins, nested CRUD, `allowGraph()`, polymorphic relations

### Research (`docs/research/`)
- `objectionjs-lessons.md` + `.html` — Objection.js analysis (477 lines)
- `sutandojs-lessons.md` + `.html` — Sutando.js analysis (779 lines)
- `orchidorm-lessons.md` + `.html` — Orchid ORM analysis (833 lines)

### Other
- `.opencode/handoff-latest.md` — This file

## Key Decisions

1. **Factory-based over class-based** — `defineModel()` returns plain objects, not class instances. Avoids Active Record ceremony, works cleanly with TypeScript.

2. **WeakMap state** — Per-instance state (attributes, original, relations, exists) stored in WeakMaps to prevent prototype pollution and enable clean GC.

3. **`wireDeps` pattern** — `factory.ts` uses late-binding setters to avoid circular ESM dependencies between `model/index.ts`, `save.ts`, `delete.ts`, `serialize.ts`, and `relation.ts`.

4. **Thenable over explicit** — QueryBuilder implements `PromiseLike` so `await Model.query().where(...)` works. `.execute()` still available for explicit style.

5. **Mutation safety** — `deleteMany()`/`updateMany()` require `.all()` or explicit WHERE conditions. Prevents accidental mass operations.

6. **`createORM` over `createPeta`** — New canonical name. `createPeta` is a re-export alias for backward compat. `createORM({ dialect, models: { User } })` does one-step registration.

7. **Plugins replace register methods** — `Model.use(timestamps())` replaces `Model.registerTimestamps()`. Old methods kept for backward compat.

8. **`asFindQuery()` in static hooks** — Transforms mutation query into SELECT for preview. `cancelQuery()` allows aborting mutations. Pattern from Objection.js.

9. **Migrations extracted** — `packages/peta-migrate/` is a standalone package. `peta-orm` still exports `migrations/` for backward compat.

10. **Kysely kept as query builder** — No custom SQL generation. All ORM features build on top of Kysely 0.27.x.

## Current State

### packages/orm/ ✅ (163 tests, 0 failures)
- All 4 phases complete
- 30 source files, ~30,000 lines total (including tests + examples)
- Thenable QueryBuilder with full method surface
- 5 relation types: HasMany, BelongsTo, HasOne, ManyToMany, HasManyThrough
- Polymorphic morphs: MorphMany, MorphOne (MorphTo is a stub)
- `$related()` relation query builder with attach/detach/sync
- Nested create/update through relations (connect/connectOrCreate/disconnect/create)
- Computed columns: runtime JS + batch async
- Static hooks with `asFindQuery()`/`cancelQuery()`
- Repository pattern via `createRepo()` (Proxy-based)
- Plugin system with built-in `timestamps()`/`softDeletes()`
- `makeHelper()` for reusable query helpers
- `allowGraph()` security for eager loading
- Column types with ArkType validation
- Collection + Paginator classes
- Soft deletes, timestamps, global scopes
- Attribute casting, serialization control (hidden/visible/appends)

### packages/peta-migrate/ ✅
- Standalone migration package (extracted from peta-orm)
- CLI, runner, generator

## Next Steps / Pending

- [ ] **Attribute class** — `Attribute.make({ get, set })` for accessors/mutators (deferred from Phase 2)
- [ ] **`allowGraph` implementation improvements** — Validate nested relations recursively, not just base name
- [ ] **`MorphTo` runtime resolution** — Implement morph map registry for runtime type resolution
- [ ] **`insertGraph`/`upsertGraph`** — Full graph operations with `#id`/`#ref` (partially covered by nested create)
- [ ] **`peta-migrate` as publishable package** — Add CI, README, proper versioning
- [ ] **peta-orm v1.0.0 release** — Publish to npm with changelog
- [ ] **Integration tests with real databases** — PostgreSQL, MySQL (currently only SQLite via bun:sqlite)

## Important Context

### Architecture
```
packages/
├── peta-orm/
│   ├── src/
│   │   ├── orm/          # createORM() registry
│   │   ├── model/        # defineModel, ModelInstance, CRUD, computed, casts, state
│   │   ├── query/        # Thenable QueryBuilder (one-file, 700+ lines)
│   │   ├── relations/    # has-many, many-to-many, morph, eager, crud, related-query
│   │   ├── hooks/        # Instance hooks + static hooks with asFindQuery
│   │   ├── repo/         # Repository pattern (Proxy-based)
│   │   ├── plugins/      # Plugin system + built-in timestamps/softDeletes
│   │   ├── columns/      # Column types with ArkType validation
│   │   ├── collection/   # Collection wrapper
│   │   ├── pagination/   # Paginator
│   │   └── migrations/   # (kept for backward compat)
│   ├── test/             # 165 tests across 10 files
│   └── examples/         # 30 runnable examples
└── peta-migrate/         # Standalone migration tools (extracted)
```

### How to run
```bash
# Tests
cd packages/orm && bun test

# All examples
cd packages/orm && bun run examples/01-basic-setup.ts

# Typecheck
cd packages/orm && bun run typecheck

# Lint
cd packages/orm && biome check src/ test/
```

### Gotchas
- **`belongsTo` thunks** are resolved immediately in `has-many.ts:10` — circular refs require the mutation pattern: define User first with empty relations, then set `User.relations.posts = hasMany(...)` after Post exists.
- **Kysely 0.27.x** — No `whereExists()`/`executeUpdate()`/`executeDelete()`. Use `sql\`EXISTS (...)\`` for exists, `.execute()` for mutations.
- **`innerJoin`/`leftJoin`** use `(join) => join.on()` callback syntax with `sql\`...\`` for column refs, not the deprecated `(table, lhs, rhs)` signature.
- **Mutation safety** — `deleteMany()`/`updateMany()` require `.all()` or at least one non-empty `.where()`.
- **`createORM({ models })`** registers models at init time. `registerAll()` is still available for post-init registration.
- **`createPeta`** is a re-export alias for `createORM` — both are identical.
- **Soft deletes** need `User.registerSoftDeletes()` in addition to `.use(softDeletes())` for query builder filtering to work (the plugin sets the hook, the old method stores the config for the QB).
