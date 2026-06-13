# Session Handoff — 2026-06-12 23:13

## Goal

Implement two pending features from the peta-orm roadmap:

1. **`allowGraph` with `insertGraph`/`upsertGraph`** — Integrate `allowGraph` security checks into graph insert operations (previously bypassed)
2. **`MorphTo` through CRUD/graph ops** — Support `insertGraph({ commentable: { create: ... } })` through polymorphic relations

## Files Modified/Created

### Modified

**Core (`packages/orm/src/`):**

| File | Change |
|------|--------|
| `relations/graph.ts` | **allowGraph**: Added `allowGraph` to `InsertGraphOptions`, `allowedGraphSet` to `GraphContext`, `assertRelationAllowed()` validation, path tracking through all recursive functions. **MorphTo**: Added `processMorphTo()` handler, morph detection helpers (`isMorphToRelation`, `isMorphManyRelation`, `getMorphType`, etc.), inlined `resolveThunk`, type column injection in `processHasMany`/`upsertHasMany` for MorphMany/MorphOne. |
| `query/index.ts` | Forward `allowedGraphSet` from QB to `insertGraph`/`upsertGraph`. Import `isRelationAllowed` from `graph.ts` (removed local copy). |
| `relations/morph.ts` | Added `_morphType`/`_morphId`/`_morphTypeValue` metadata to `defineMorphMany`/`defineMorphOne` for graph operation support. Exported `resolveThunk`. |

**Tests (`packages/orm/test/`):**

| File | Change |
|------|--------|
| `graph.test.ts` | 7 new tests: `allowGraph("posts")` + `insertGraph` pass/throw, nested prefix, sibling blocked, options-based allowGraph, upsertGraph pass/throw |
| `morph.test.ts` | 9 new tests: MorphTo create/connect/#dbRef via `insertGraph`, auto-detect single-entry morphMap, missing type error, invalid type error, MorphMany type column injection on insert/upsert, mixed bidirectional graph |

## Key Decisions

1. **allowGraph prefix-matching for graph ops** — Same semantics as `with()`: `allowGraph("posts.author")` allows `posts.author.profile` but blocks bare `posts`. Full dotted path is tracked from root for nested graph nodes.

2. **allowGraph forwarded implicitly from QB** — `query().allowGraph("posts").insertGraph(data)` automatically forwards the set. Also explicitly usable via `Model.insertGraph(data, { allowGraph: ["posts"] })`.

3. **MorphTo `type` key in op data** — Users specify the polymorphic type via `{ type: "morph_posts" }` inside the relation operation data. If morphMap has only one entry, `type` is auto-detected.

4. **MorphMany type column auto-injection** — `typeValue` from `defineMorphMany({ typeValue: "morph_posts" })` is automatically set on child records created through graph ops. No extra user input needed.

5. **`parentColumnData` reference** — `processBelongsTo` now accepts an optional `parentColumnData` parameter. The MorphTo handler uses it to set the type column on the parent. Regular belongsTo ignores it. Minimal change to existing code.

6. **`resolveThunk` inlined in graph.ts** — Avoids circular dependency via `graph.ts → morph.ts → query/index.ts`. Duplicated the 6-line WeakMap cache function rather than adding a dynamic import.

## Current State

### Test Results ✅
- **238 tests pass**, 0 failures (up from 222 = 7 allowGraph-graph + 9 morph-graph new)
- **32 examples all pass**

### Feature Status

| Feature | Status | Tests |
|---------|--------|-------|
| `Attribute.make({ get, set })` | ✅ Complete | 19 tests |
| Recursive `allowGraph` | ✅ Complete | 12 tests (3 old + 9 new) |
| `insertGraph`/`upsertGraph` | ✅ Complete | 19 tests |
| MorphTo runtime resolution | ✅ Complete | 12 tests |
| **allowGraph + insertGraph/upsertGraph** | ✅ **Complete** | **7 new** |
| **MorphTo through graph ops** | ✅ **Complete** | **9 new** |
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
│   │   │   ├── graph.ts         # insertGraph/upsertGraph core + allowGraph + morph support
│   │   │   ├── morph.ts         # defineMorphTo/MorphMany/MorphOne, resolveMorphRelation
│   │   │   └── index.ts         # exports
│   │   ├── query/index.ts       # allowGraph, isRelationAllowed, graph ops on QB
│   │   ├── orm/index.ts         # register() — config storage
│   │   └── errors.ts            # RelationNotAllowedError
│   ├── test/                    # 240 tests across 13 files
│   └── examples/                # 32 runnable examples
└── peta-migrate/                # Standalone migration tools
```

### Gotchas

- **Kysely 0.27 limitations**: No `orWhere` at root QB level, no `addSelect`, no `qb.raw()`. Use `kyselySql` template tag, `select()` additive, and `where((w) => w.orWhere(...))` callback pattern.
- **TDZ with thunks**: `hasMany(() => Post)` inside `defineModel`'s `relations` config resolves immediately. `Post` must already be defined, or the relation must be wired up after all models exist via `Model.relations.X = ...`.
- **MorphMany typeValue**: When defining `defineMorphMany` on a parent model, pass `typeValue: "parent_table_name"` explicitly. The old default (`related.table`) was the child's table name, which is incorrect for polymorphic type filtering.
- **MorphTo graph ops require `type`**: For multi-entry morphMaps, users must specify `{ type: "morph_posts" }` in the relation op. Single-entry morphMaps auto-detect.
- **allowGraph vs RelationNotFoundError**: `allowGraph` violations throw `RelationNotAllowedError` (not `RelationNotFoundError`). Catch accordingly.
- **config storage in register()**: `register()` in `orm/index.ts` had a removed `setConfig()` call that was overwriting full config with a destructured subset (lost `attributes`). Now fixed.
- **`insertManyModel` bypasses set mutators**: Bulk insert operations don't apply `Attribute.set` mutators (same as Laravel). Use single `insert()` if mutators are needed.
- **`hasOne` relations report `type: "hasMany"`** internally (implementation detail; the query behavior is correct for hasOne). The `processNode` in graph.ts handles both via `type === "hasMany" || type === "hasOne"`.
- **Circular dep between graph.ts and morph.ts**: `graph.ts` inlines `resolveThunk` (exported from `morph.ts`) to avoid a circular dependency chain (`query/index.ts → graph.ts → morph.ts → query/index.ts`).
