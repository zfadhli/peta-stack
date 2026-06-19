# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
