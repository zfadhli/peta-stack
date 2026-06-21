# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [peta-orm@0.6.0, peta-auth@0.3.0, peta-docs@0.4.0, peta-migrate@0.3.0] - 2026-06-22

### Removed

- **orm**: `defineMorphOne`, `MorphOneOptions`, `withAvg`, `withMin`, `withMax`, `withExists`, `applyComputedColumns` (sync), `sqlComputed`, `ModelId`, `PaginatedResult`, `setModelDef`, `getModelDef`, `HookManager.clone()`, `Paginator.count`, `Paginator.map`, `collection.each`, `createMiddleware` alias — all unused or superseded APIs
- **orm**: `fast-glob` dependency — replaced with `Bun.Glob`
- **auth**: `jose` dependency — replaced with `crypto.subtle.sign/verify`
- **auth**: v1 seal backwards-compatibility — `sealData`/`unsealData` no longer handle legacy v1 format
- **auth**: `RequestAccessTokenOptions.params` field — never used
- **docs**: `createHonoDocsApp`, `HonoDocsConfig`, `elysiaRoute`, `setOnValidationError`, `setOnDiagnostic`, `Diagnostic`, `DiagnosticLevel`, `emitDiagnostic`, per-route `onResponseValidationError`, `PaginationOptions` — all unused, deprecated, or replaced
- **docs**: `arktype` moved from `optionalDependencies` to `devDependencies` — install manually if using ArkType schemas
- **migrate**: `GeneratorOptions` interface — unused
- **migrate**: `fast-glob` dependency — replaced with `Bun.Glob`
- **migrate**: `MigrationRunner`/`MigrationGenerator` changed from interfaces to type aliases (`ReturnType<typeof createMigrationRunner>`)

### Changed

- **orm**: Consolidated duplicated helpers (`getPivotInfo`, `findRelated`, `resolveTargetId`) into `relations/helpers.ts`
- **orm**: Inlined `graph/morph.ts` accessor wrappers, deleted the file
- **orm**: Folded `lib/kysely.ts` (`Database` type) into `types.ts`
- **orm**: Inlined `rawSql`, `DeletedRows`, `defName` helpers; collapsed `defaultValue` ternary; removed dead `"set"` branch in `applyCastsToData`
- **auth**: Replaced `jose` with native `crypto.subtle.sign/verify` (JWT API signatures unchanged)
- **auth**: Inlined `encodeBase64Url`, `getRandomBytes`, `toKey` one-liner wrappers
- **docs**: Replaced `emitDiagnostic` calls with `console.warn`
- **docs**: Inlined `mapContentSchemas`, `parsePathParams`, `validMethods` as one-liners
- **migrate**: Inlined `mapType`/`mapPushType`/`mapSnapshotType` wrappers
- **ci**: Removed redundant wait-for-health loops from test.yml (GitHub Actions `--health-cmd` already blocks)
- **ci**: Replaced `softprops/action-gh-release` with native `gh release create`
- **config**: Hoisted shared TypeScript options to `tsconfig.base.json` (slimmed all package tsconfigs)
- **config**: Removed default-override Biome settings, unused npm scripts, empty `orm/bin/` directory

## [0.2.2] - 2026-06-20

### Fixed

- **migrate**: `ensureTable()` no longer crashes with "corrupted migrations" on databases that already have migration entries — now creates the tracking table directly with `.ifNotExists()` instead of using Kysely's `Migrator` with an empty migration array. [#10](https://github.com/zfadhli/peta-stack/issues/10)

## [0.5.0] - 2026-06-19

### Added

- **orm**: `createDb()` utility for lazy-initialized singleton database connections — avoids module-level side effects that break testing, HMR, and error recovery. [#8](https://github.com/zfadhli/peta-stack/issues/8)
- **orm**: `createColumnTypes()` factory for custom validation backends (replaces the old callable `t`)
- **orm**: `createORM()` now accepts a pre-existing Kysely instance via `kysely` config option (alongside the existing `dialect`)
- **orm**: `SerializedShape<TColumns>` mapped type for typed `$toJSON()` / `toJSON()` returns
- **orm**: `QueryBuilder` methods now preserve `TColumns` generics through all chained calls
- **orm**: `createRepo` and `RepoMethods` exported from public entry point (`peta-orm`)
- **migrate**: Comprehensive test coverage — 4 new test files (snapshot, differ, checksum, pusher), 79 total test cases

### Changed

- **orm**: `t` is now a pre-configured `ColumnTypes` object backed by ArkType — import and use directly as `t.integer()`, `t.string()`, etc. The old factory API `t({ schema: createArkTypeSchemaConfig() })` is replaced by `createColumnTypes({ schema })` for custom validation backends. [#8](https://github.com/zfadhli/peta-stack/issues/8)
- **orm**: Repository pattern (`createRepo`, `RepoMethods`, `QueryMethod`) now part of the public API
- **docs**: Updated integration guide to use `createDb()` safe initialization pattern
- **migrate**: `prepublish` → `prepublishOnly`; `"module"` field corrected from `src/index.ts` to `./dist/index.mjs`
- **auth**: Added `"main"`, `"private": false`, `prepublishOnly`, and LICENSE to published files
- **docs**: Added LICENSE to published files
- **packaging**: All publishable packages now consistently include LICENSE in their tarball

### Fixed

- **migrate**: `pushSchema()` in `pusher.ts` now properly reassigns the Kysely query builder in the column loop — was silently dropping all but the last column due to builder immutability
- **orm**: Discover test no longer fails when run from the monorepo root — uses `import.meta.dirname` instead of cwd-relative paths
- **orm**: `getSortedMigrations` now correctly orders migration files by name
- **orm**: Removed module-level `await getORM()` eager initialization from catalog app schema

## [0.4.0] - 2026-06-19

### Added

- **migrate**: Snapshot-based incremental migration generation (`migrate:generate` now creates diffs from previous snapshot)
- **migrate**: `migrate:diff` command to preview schema changes without writing a migration
- **migrate**: `migrate:push` command to push schema directly to the database (prototyping)
- **migrate**: `migrate:seed` command to generate and run seed files
- **migrate**: `migrate:rollback --steps=N` for batch rollback
- **migrate**: Checksum verification (`sha256`) to detect tampered migration files

### Changed

- **migrate**: Extracted from `packages/orm` into standalone `packages/migrate` package
- **migrate**: Runner now wraps Kysely's `Migrator` with lock table for concurrent safety
- **migrate**: `migrate:generate` now loads actual model definitions via glob patterns (was `new Map()` — critical bug fix)
- **migrate**: Generated migrations include `ifNotExists()`, proper references, and ManyToMany pivot warnings
- **migrate**: Deduplicated — ORM no longer ships its own migration code

### Fixed

- **migrate**: `migrate:generate` was producing empty migrations because it never loaded models — now resolves model files via `loadModels(patterns)`

## [0.3.0] - 2026-06-19

### Added

- **orm**: Plugin system with `.use()` and built-in timestamps/softDeletes
- **orm**: `ulid()` plugin for auto-generating ULID primary keys
- **orm**: Accessors/mutators support
- **orm**: `allowGraph` security for insertGraph/upsertGraph
- **orm**: `MorphTo` through insertGraph/upsertGraph
- **orm**: `$related()` query builder with attach/detach/sync
- **orm**: Nested create/update through relations and `RelationQuery`
- **orm**: Static hooks with `asFindQuery()` and repository pattern
- **orm**: `Collection.load()` via `EagerLoader`
- **orm**: Integration test suite for PostgreSQL and MySQL
- **orm**: `ModelInstance.get()` generic type parameter
- **auth**: Migrate password hashing from bcryptjs to argon2id
- **catalog**: Books Catalog API application
- **catalog**: Complete CRUD for authors, categories, and reviews
- **catalog**: ULID primary keys with RBAC author role
- **conduit**: RealWorld Conduit API as `apps/conduit`
- **conduit**: OpenAPI spec at `/openapi.json` and Scalar docs at `/docs`
- **conduit**: Offset/limit and filter query params in OpenAPI spec
- **docs**: Runtime response validation to `RouteBuilder.handle()`
- **docs**: Renamed from peta-hono to peta-docs with framework adapter architecture
- **examples**: Auth examples rewritten with source imports

### Changed

- **orm**: Eliminated 136 `any` occurrences across the package
- **orm**: Split `relations/graph.ts` into 7 focused modules
- **orm**: Split `query/index.ts` into `query/types.ts` + `query/builder.ts`
- **orm**: Replaced `wireDeps` with typed runtime registry
- **orm**: Extracted `defineModel` to `model/define.ts`
- **orm**: Extracted `normalizeError` from `errors.ts` into `errors/normalizer.ts`
- **orm**: Added typed `_morph*` properties to `Relation` interface
- **orm**: Removed broken `QueryBuilder.clone()`
- **auth**: Rebuilt following Evan You coding style
- **auth**: Extracted shared OAuth provider base handler
- **auth**: Extracted `jsonError` helper, eliminating 5x duplicated response
- **auth**: Extracted `sessionHasData` utility, eliminating triplication
- **auth**: Eliminated triplicated `normalizePassword`
- **auth**: Renamed `oauth/index.ts` to `oauth/utils.ts`
- **docs**: Split spec.ts into `spec/schema.ts` + `spec/builder.ts`
- **docs**: Decoupled spec.ts from hono/scanner.ts
- **docs**: Extracted `parseCommaSeparated` helper in route.ts
- **docs**: Extracted Standard Schema validation helper in route.ts
- **catalog**: Flattened route structure, removed `loadRoutes` dependency
- **catalog**: Replaced raw SQL pivot operations with `BookCategory` model
- **catalog**: Used model hidden config to replace manual `basicBookJSON`
- **migrate**: Extracted from ORM into its own package
- Migrated from BunSqliteDialect to LibsqlDialect

### Fixed

- **orm**: Stripped ORDER BY from count queries
- **orm**: Filter computed columns from SELECT
- **orm**: Used `generatedByDefaultAsIdentity` for PostgreSQL auto-increment
- **orm**: Patched 6 critical bugs in relations, query builder, and error handling
- **orm**: Lazy thunk resolution for hasMany/manyToMany forward refs
- **orm**: Configured related model in MorphMany/MorphOne
- **orm**: Constant-time multi-key JWT verification
- **orm**: Applied global scopes and soft-delete filters to all query methods
- **orm**: Used `RETURNING *` and dynamic PK column in `saveModel`
- **orm**: `insertManyModel` now uses `RETURNING *` to return real DB-generated values
- **orm**: Eliminated `clone()` from `first`/`find`/`findOrFail`/`chunk`
- **orm**: Used per-instance `$toJSON` for related model serialization
- **orm**: Skipped `_pivot` relation in `modelToJSON` to fix manyToMany serialization crash
- **auth**: Made session cookie secure flag conditional on environment
- **auth**: Added default 24-hour TTL to `signJWT`
- **auth**: Constant-time comparison for CSRF tokens and OAuth state
- **docs**: Resolved 7 pre-existing tsc errors in `spec.test.ts`
- **docs**: Warned and threw on non-ArkType schema functions
- **docs**: Aligned OpenAPI security spec with runtime AND semantics
- **docs**: Handled ArkType pipe/morph schemas in OpenAPI conversion
- **docs**: Removed embedded `.git` from peta-docs
- **conduit**: Aligned error responses with RealWorld spec
- **conduit**: Enforced auth before body validation on protected routes
- **catalog**: Enabled `PRAGMA foreign_keys = ON` in schema setup
- **examples**: Resolved TDZ thunk references, fixed Kysely 0.27 compatibility issues
- **examples**: Removed `| undefined` from update/filter schemas

### Performance

- **conduit**: Bulk tag lookups and inserts in `findOrCreateTags`

### Dependencies

- Bumped kysely from `^0.28.17` to `^0.29.2` across monorepo
- Bumped various dependencies across monorepo

## [0.2.6] - Previous release

See git history for changes prior to 0.3.0.
