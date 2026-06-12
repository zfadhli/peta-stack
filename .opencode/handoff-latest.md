# Session Handoff — 2026-06-12 08:20

## Goal

Two major efforts:

1. **Build the RealWorld Conduit API** (`apps/conduit/`) — 19 endpoints covering articles, comments, profiles, follows, favorites, auth, and tags. Achieve full [Conduit spec](https://docs.realworld.show/specifications/backend/introduction/) compliance verified by the official Hurl test suite.

2. **Production-readiness audit of peta-stack** — systematic review of every issue from the production review, then fix them. Covered packages: `orm`, `auth`, `docs`, and both `apps/conduit` and `apps/catalog`.

## Files Modified/Created (23 files, +502/-248 lines)

### apps/conduit/ — RealWorld compliance fixes
- `src/middleware/error.ts` — Field-name parsing from `"field: message"` format; validation messages normalized to RealWorld spec; empty-value detection for ArkType issues
- `src/routes/articles.ts` — Replaced join-based filtering with subqueries (ORM `selectAll` bug); `articlesCount` returns total count before limit/offset; `updatedAt` set on PUT; bulk tag inserts in `findOrCreateTags`; OpenAPI query param schemas via `.query(ListArticlesQuery)` and `.query(FeedArticlesQuery)`
- `src/routes/auth.ts` — Login 401 uses `credentials: invalid` field; conflict errors use `email:`/`username:` prefix
- `src/routes/comments.ts` — `id: "string | number"` param type for URL comment IDs; `field:` prefix on error messages
- `src/routes/favorites.ts` — `field:` prefix on error messages
- `src/routes/profiles.ts` — `field:` prefix on error messages

### packages/orm/ — 6 fixes
- `src/model/save.ts` — **`insertManyModel`**: chains `.returningAll()` (commit f21e247). **`saveModel`**: uses `RETURNING *` + dynamic PK column detection via `getPrimaryKeyColumn()`, removed broken `numInsertedOrUpdatedRows` fallback (commit 3d86f9f)
- `src/builder/query.ts` — **`applyScopes()`** extracted from `runExecute()` with guard flag; now called in `paginate()`, `count()`, `sum()`, `avg()`, `min()`, `max()` — these were bypassing global scopes and soft-delete filters. **`clone()`** removed (broken, zero callers). (commits cc1d26f, e8d8b26)
- `src/collection/index.ts` — `load()` now delegates to `EagerLoader.loadRelated()` instead of being a no-op (commit c257692)
- `src/relations/morph.ts` — `MorphMany`/`MorphOne` now accept `related: ModelDefinition` option instead of throwing. `MorphTo` remains a stub (commit 4e8b3e9)
- `test/collection.test.ts` — Updated `load()` test to verify relations are actually loaded

### packages/auth/ — 7 fixes
- `src/password.ts` — Migrated from `bcryptjs` to `@node-rs/argon2` (argon2id, OWASP params: memoryCost=19456, timeCost=2, parallelism=1). Pure Rust-native, pre-built binaries, no compilation needed. **Breaking change**: existing bcrypt hashes can't be verified. (commit 00a0810)
- `src/jwt.ts` — Added default 24h TTL (86400s) to `signJWT`. Multi-key verification now iterates ALL keys instead of returning on first match (timing side-channel fix). (commits 1a53c33, 15a9749)
- `src/csrf.ts` — Added exported `constantTimeEqual()` helper using XOR-based loop; `validateCsrf` uses it instead of `===`. (commit 9580e6d)
- `src/session.ts` — `secure` flag on cookie now conditional on `NODE_ENV !== "development"` (matches OAuth pattern). (commit 84ac835)
- `src/oauth/github.ts` — OAuth state comparison uses `constantTimeEqual` instead of `!==`
- `src/oauth/google.ts` — Same
- `test/password.test.ts` — Updated for argon2id hash expectations
- `package.json` — Added `@node-rs/argon2 ^2.0.2`, removed `bcryptjs` + `@types/bcryptjs`

### packages/docs/ — 3 fixes
- `src/spec.ts` — **Security spec**: combined multiple auth schemes into a single OpenAPI requirement object (AND semantics matching runtime). **Schema warning**: non-ArkType functions now emit `console.warn` (throws in `NODE_ENV=development`). (commits 0ccf683, 28fa29a)
- `test/index.test.ts` — Updated multi-auth security test expectation

## Key Decisions

1. **Argon2id over bcrypt** — OWASP-recommended algorithm, Rust-native via `@node-rs/argon2`. Pre-built binaries via napi-rs (no C++ build tools). Clean break — no bcrypt fallback. Existing deployments must re-hash passwords on next login.

2. **Spec aligns to runtime for auth** — OpenAPI security spec now uses single-object AND semantics, matching the `authGuard` runtime behavior. Safer than relaxing runtime to OR.

3. **Scopes applied once** — The `scopesApplied` guard flag ensures global scopes and soft-delete filters are applied once to the shared `qb` builder. Subsequent calls to `execute()`, `count()`, `paginate()` etc. are no-ops. Kysely's immutable builders retain conditions once added.

4. **RETURNING * for all inserts** — Both `saveModel` and `insertManyModel` now use `RETURNING *` to get DB-generated values (IDs, defaults, triggers). Eliminates the extra SELECT workaround in `findOrCreateTags`.

5. **No bcrypt fallback in password.ts** — Clean migration to argon2id. The apps (conduit, catalog) already bypassed peta-auth's password hashing for `Bun.password.hash()` anyway. Only internal consumer was `reset-password.ts`.

6. **Conduit auth is its own** — The `authGuard` in peta-docs doesn't handle conduit's `"Token"` scheme. Conduit uses `requireAuth()` middleware for enforcement and `.auth("Token")` only for OpenAPI metadata. This is intentional and documented.

7. **Collection.load() batches** — Uses `EagerLoader.loadRelated()` which does a single `WHERE IN` query per relation across all items, not N+1 individual queries.

8. **clone() removed** — Dead code, documented as broken, zero callers. Removed entirely.

## Current State

### packages/orm/ ✅
- All insert paths use `RETURNING *` to return DB-generated values
- Global scopes applied in `paginate()`, `count()`, `sum()`, `avg()`, `min()`, `max()`
- Dynamic PK column detection instead of hardcoded `"id"`
- Collection `load()` works (delegates to `EagerLoader`)
- MorphMany/MorphOne accept `related: ModelDefinition`
- 156 tests pass

### packages/auth/ ✅
- Argon2id password hashing with OWASP parameters
- 24h default JWT TTL
- Constant-time CSRF and OAuth state comparison
- Multi-key JWT verification without timing side-channel
- Conditional `secure` cookie flag for local dev
- 75 tests pass

### packages/docs/ ✅
- OpenAPI security spec matches runtime (AND semantics)
- Non-ArkType schema functions throw in dev, warn in prod
- 94 tests pass

### apps/conduit/ ✅
- 19/19 RealWorld spec endpoints implemented
- All 13 official Hurl test files pass (154 requests, 0 failures)
- OpenAPI query params documented for list/feed endpoints
- Bulk tag operations in `findOrCreateTags`

### How to run
```bash
# ORM tests
cd packages/orm && bun test

# Auth tests
cd packages/auth && bun test

# Docs tests
cd packages/docs && bun test

# Start conduit server
cd apps/conduit && rm -f conduit.db && bun run src/db/seed.ts && bun run src/index.ts

# Run Hurl tests (server must be running)
LD_LIBRARY_PATH=/home/linuxbrew/.linuxbrew/lib /tmp/hurl-8.0.1-x86_64-unknown-linux-gnu/bin/hurl --test --jobs 1 --variable "host=http://localhost:3001" --variable "uid=ci-$(date +%s)" apps/conduit/tests/hurl/*.hurl

# Rebuild ORM after source changes (uses compiled dist/)
cd packages/orm && bun run build

# Rebuild docs after source changes (uses compiled dist/)
cd packages/docs && bun run build
```

## Next Steps / Pending

- [ ] Add rate limiting on login endpoints (conduit + catalog)
- [ ] Add health check endpoints (`/health`, `/ready`)
- [ ] Add structured logging with request correlation IDs
- [ ] Add `unhandledRejection` handler to both apps
- [ ] Add indexes on foreign key columns and `deletedAt`
- [ ] Fix N+1 queries in article listing (batch tag/author/favorite queries per request)
- [ ] Enforce role-based auth in catalog app (`requireRole()` is defined but unused)
- [ ] Add CSRF protection for catalog's cookie-based auth
- [ ] Implement MorphTo runtime type resolution (morph map registry)
- [ ] Add startup env validation (crash if `JWT_SECRET`/`SESSION_PASSWORD` unset in production)
- [ ] Add response compression and request size limits
- [ ] `.env.example` file documenting required env vars
- [ ] OpenAPI spec still missing `components.securitySchemes` — must be passed manually via `getOpenAPISpec()` options

## Important Context

### Architecture
```
peta-stack/
├── apps/
│   ├── catalog/          # Books API (session-based auth, cookie sessions)
│   └── conduit/          # RealWorld API (JWT token auth, 19 endpoints)
├── packages/
│   ├── orm/              # peta-orm — function-based ORM on Kysely (SQLite/PostgreSQL)
│   ├── auth/             # peta-auth — JWT + argon2id + session utilities
│   └── docs/             # peta-docs — RouteBuilder + OpenAPI/Scalar
```

### Gotchas
- **peta-orm uses compiled `dist/`** — source changes in `packages/orm/src/` require `bun run build` inside `packages/orm/` to take effect at runtime
- **peta-docs uses compiled `dist/`** — same, `bun run build` in `packages/docs/`
- **`Authorization: Token <jwt>`** (not `Bearer`) — the built-in `authGuard` in RouteBuilder only handles `Bearer`/`Cookie`. Use `requireAuth()` middleware for enforcement, `.auth("Token")` only for OpenAPI metadata
- **ArkType `"key?"` syntax** makes keys optional but adds `| undefined` internally, which fails `toJsonSchema()`. Fix: nested try/catch in `toOpenAPISchema()` falls back to `.in.toJsonSchema()` which strips the union
- **JSON drops `undefined`** — always use `?? null` when serializing nullable fields in response bodies
- **`insertMany()` does NOT trigger lifecycle hooks** — no before/after events fire for bulk inserts
- **Hurl CLI** is at `/tmp/hurl-8.0.1-x86_64-unknown-linux-gnu/bin/hurl` — works with `LD_LIBRARY_PATH=/home/linuxbrew/.linuxbrew/lib`
- **`@node-rs/argon2`** ships pre-built `.node` binaries via napi-rs — no native compilation needed on supported platforms
- **No bcrypt backwards compatibility** — after the argon2 migration, existing bcrypt hashes are unverifiable. Migrating deployments should re-hash on next login
- **Database file** is `conduit.db` in `apps/conduit/` — gitignored via `*.db`. Delete to reset
- **Server port** defaults to 3001 (configurable via `PORT` env var)
- **Biome** is configured in `biome.json` — run `node_modules/.bin/biome check --write <file>` for linting
