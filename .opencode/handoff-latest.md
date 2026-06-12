# Session Handoff — 2026-06-12 22:08

## Goal

Implement four pending features from the peta-orm roadmap and fix all broken examples:

1. **Attribute class** — `Attribute.make({ get, set })` for accessors/mutators
2. **`allowGraph` improvements** — Recursive nested relation validation
3. **`insertGraph`/`upsertGraph`** — Full graph operations with `#id`/`#ref`
4. **MorphTo runtime resolution** — Morph map registry for runtime type resolution

Plus: ensure all 32 examples run, fix all Kysely 0.27 compatibility issues, and fix TDZ (Temporal Dead Zone) bugs in examples that prevented thunks from resolving.

## Files Modified/Created

### Created

- `packages/orm/src/model/attribute.ts` — `Attribute` class with static `make({ get?, set? })`
- `packages/orm/src/relations/graph.ts` — `insertGraph()`/`upsertGraph()` with `#id`/`#ref` resolution, topological sort, node processors
- `packages/orm/test/attribute.test.ts` — 19 tests for accessors/mutators
- `packages/orm/test/graph.test.ts` — 19 tests for insertGraph/upsertGraph
- `packages/orm/test/morph.test.ts` — 12 tests for polymorphic relations
- `packages/orm/examples/31-graph-operations.ts` — Graph operations example (renamed from 30)
- `packages/orm/examples/32-accessors-mutators.ts` — Accessors/mutators example

### Modified

**Core (`packages/orm/src/`):**

| File | Change |
|------|--------|
| `model/attribute.ts` | NEW — `Attribute.make({ get, set })` |
| `relations/graph.ts` | NEW — `insertGraph`/`upsertGraph` core (~450 lines) |
| `relations/morph.ts` | Rewrote `defineMorphTo` with morph map, `query()`, `getResults()`, `loadEager()`. Added `typeValue` option to `MorphManyOptions`/`MorphOneOptions`. Exported `resolveMorphRelation()` |
| `relations/eager.ts` | Added morph detection + clear error for nested eager loading through morphTo; null-guard for `relatedModelClass` |
| `relations/index.ts` | Export `resolveMorphRelation` |
| `model/types.ts` | Added `attributes?` to `ModelConfig`, `insertGraph`/`upsertGraph` to `ModelDefinition` |
| `model/index.ts` | Implement `insertGraph`/`upsertGraph` on `defineModel` (dynamic import) |
| `model/factory.ts` | `get()`/`set()`/`fill()` integrate attribute accessors/mutators; `createInstance()` splits DB read path (casts only) from new-record path (set mutators + casts) |
| `model/serialize.ts` | `modelToJSON()` applies attribute `get` accessor after cast |
| `query/index.ts` | Added `isRelationAllowed()` prefix checker; `allowGraph(...expressions)` accepts rest params, preserves dotted paths; `with()` uses recursive validation; `insertGraph`/`upsertGraph` on QB; Removed circular `requireCreateQB` self-import; Fixed Kysely 0.27: `qb.raw()` → `kyselySql()`, `addSelect` → `select`, `orWhere` → callback pattern |
| `orm/index.ts` | Removed redundant `setConfig()` in `register()` that was overwriting full config with destructured subset (lost `attributes` and potentially other fields) |
| `errors.ts` | Added `RelationNotAllowedError` with clear message |
| `index.ts` | Exported `RelationNotAllowedError`, `InsertGraphOptions`, `UpsertGraphOptions`, `resolveMorphRelation` |

**Examples (`packages/orm/examples/`):**

| File | Change |
|------|--------|
| 04, 05, 11, 17, 18, 20, 23 | Moved relation thunks out of `defineModel` config → wire up after all models exist (fix TDZ) |
| 12 | Changed `User.transaction` → `db.transaction` (method doesn't exist on model) |
| 05 | Removed `orWhere` usage (not available in Kysely 0.27 root QB) |
| 29 | Updated for recursive `allowGraph` validation |
| 30 | Updated to demonstrate working MorphTo with eager loading |
| 31 | Renamed from 30 (was conflicting with polymorphic) |
| 32 | NEW — 11 scenarios for `Attribute.make` |

## Key Decisions

1. **Prefix-based allowGraph** — If `allowGraph("posts.author")`, then `with("posts.author")` and `with("posts.author.profile")` pass, but `with("posts")` and `with("posts.comments")` are blocked. A whitelisted path allows all deeper nesting.

2. **Attribute.get/set order** — `get` accessor runs AFTER type casting; `set` mutator runs BEFORE type casting. This gives max flexibility while keeping casts as the low-level DB↔App conversion.

3. **`createInstance` path split** — DB reads (`exists=true`) apply only casts, no set mutators. New records (`exists=false`) start empty then go through `fill()` which applies set mutators + casts. This ensures `insert()` hashes passwords etc. while `hydrate()` preserves stored values.

4. **Graph operations follow dependency order** — belongsTo → root → hasMany/hasOne/manyToMany per node, recursive. `#id`/`#ref` tracked via refMap + processedRefs WeakMap for dedup.

5. **MorphTo `typeValue` option** — Added to `MorphManyOptions`/`MorphOneOptions` because `defineMorphMany` can't infer the parent's table name. Users must pass `typeValue: "parent_table"` for correct polymorphic type filtering.

6. **`RegisterNotAllowedError`** — Separate error class for allowGraph violations (vs `RelationNotFoundError` for actual missing relations). Clearer messages.

## Current State

### Test Results ✅
- **222 tests pass**, 0 failures (up from 163 in previous handoff → 19 attribute + 19 graph + 12 morph + 9 allowGraph = 59 new tests)
- **32 examples all pass** (was 8 broken after recent changes — fixed TDZ, Kysely compat, wrong API usage)

### Feature Status

| Feature | Status | Tests |
|---------|--------|-------|
| `Attribute.make({ get, set })` | ✅ Complete | 19 tests |
| Recursive `allowGraph` | ✅ Complete | 12 tests (3 old + 9 new) |
| `insertGraph`/`upsertGraph` | ✅ Complete | 19 tests |
| MorphTo runtime resolution | ✅ Complete | 12 tests |
| `typeValue` option for morphMany/one | ✅ Added | (tested via morph tests) |
| `RelationNotAllowedError` | ✅ Added | (tested via allowGraph tests) |
| `resolveMorphRelation()` helper | ✅ Exported | 2 tests |
| Nested eager loading through MorphTo | ❌ Not supported | Throws clear error |

### How to run

```bash
# Tests
cd packages/orm && bun test

# All examples (must all pass)
cd packages/orm && for i in $(seq -w 1 32); do bun run examples/${i}-*.ts; done

# Typecheck
cd packages/orm && bun run typecheck
```

## Next Steps / Pending

- [ ] **`allowGraph` with `insertGraph`/`upsertGraph`** — Integrate `allowGraph` security into graph insert operations (currently graph operations bypass allowGraph)
- [ ] **`MorphTo` through CRUD/graph ops** — `insertGraph({ commentable: { create: ... } })` through polymorphic relations
- [ ] **`peta-migrate` as publishable package** — CI, README, proper versioning
- [ ] **peta-orm v1.0.0 release** — Publish to npm with changelog
- [ ] **Integration tests with real databases** — PostgreSQL, MySQL (currently only SQLite via bun:sqlite)

## Important Context

### Architecture
```
packages/
├── peta-orm/
│   ├── src/
│   │   ├── model/
│   │   │   ├── attribute.ts     # Attribute.make ({ get, set })
│   │   │   ├── factory.ts       # createInstance, get/set/fill with attr support
│   │   │   ├── serialize.ts     # $toJSON with attr get accessor
│   │   │   ├── types.ts         # ModelConfig.attributes, ModelDefinition.insertGraph/upsertGraph
│   │   │   └── index.ts         # defineModel wiring
│   │   ├── relations/
│   │   │   ├── eager.ts         # EagerLoader with morph detection
│   │   │   ├── graph.ts         # insertGraph/upsertGraph core
│   │   │   ├── morph.ts         # defineMorphTo with morph map, resolveMorphRelation
│   │   │   └── index.ts         # exports
│   │   ├── query/index.ts       # allowGraph, isRelationAllowed, graph ops on QB
│   │   ├── orm/index.ts         # register() — config storage fix (removed redundant setConfig)
│   │   └── errors.ts            # RelationNotAllowedError
│   ├── test/                    # 224 tests across 13 files
│   └── examples/                # 32 runnable examples
└── peta-migrate/                # Standalone migration tools
```

### Gotchas

- **Kysely 0.27 limitations**: No `orWhere` at root QB level, no `addSelect`, no `qb.raw()`. Use `kyselySql` template tag, `select()` additive, and `where((w) => w.orWhere(...))` callback pattern.
- **TDZ with thunks**: `hasMany(() => Post)` inside `defineModel`'s `relations` config resolves immediately. `Post` must already be defined, or the relation must be wired up after all models exist via `Model.relations.X = ...`.
- **MorphMany typeValue**: When defining `defineMorphMany` on a parent model, pass `typeValue: "parent_table_name"` explicitly. The old default (`related.table`) was the child's table name, which is incorrect for polymorphic type filtering.
- **allowGraph vs RelationNotFoundError**: `allowGraph` violations now throw `RelationNotAllowedError` (not `RelationNotFoundError`). Catch accordingly.
- **config storage in register()**: The `register()` method in `orm/index.ts` previously called `setConfig()` a second time with a destructured subset that was missing `attributes` and other config fields. This was removed — `_init()` already stores the full config.
- **`insertManyModel` bypasses set mutators**: Bulk insert operations don't apply `Attribute.set` mutators (same as Laravel). Use single `insert()` if mutators are needed.
- **`hasOne` relations report `type: "hasMany"`** internally (implementation detail; the query behavior is correct for hasOne). The `processNode` in graph.ts handles both via `type === "hasMany" || type === "hasOne"`.

(End of file - total 236 lines)
