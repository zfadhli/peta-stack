# Session Handoff — 2026-06-13

## Goal

Migrate `@apps/conduit/` to the latest peta-orm features: ULID primary keys, plugin-based lifecycle hooks, `createORM`/`getORM` rename, `createApp()` factory for testability, `peta-auth` password hashing, and full Bun test coverage. Along the way, fix ORM bugs uncovered by conduit's many-to-many pivot patterns and `insertMany` usage.

Conduit is a RealWorld API (Medium clone) that uses JWT token auth per spec — kept JWT, migrated everything else.

## Files Modified/Created

### Conduit App (`apps/conduit/`)

| File | Change |
|------|--------|
| `src/db/schema.ts` | ULID PKs (`t.string(26).primaryKey()`), FKs → `t.string(26)`, plugins (`.use(timestamps()).use(ulid())`), `createPeta`→`createORM`, `getPeta`→`getORM`, `getORM(dialect)` for test injection, SQL `INTEGER`→`TEXT`, timestamps non-nullable |
| `src/index.ts` | `createApp()` factory, `import.meta.main` guard, optional ORM DI param |
| `src/routes/auth.ts` | `hashPassword`/`verifyPassword` from peta-auth, `.catch()` chaining, `http.*` helpers, string IDs |
| `src/routes/articles.ts` | String IDs, `http.*` helpers |
| `src/routes/comments.ts` | String IDs, `http.*` helpers, ArkType `id: "number"`→`"string"` |
| `src/routes/favorites.ts` | String IDs, `http.*` helpers |
| `src/routes/profiles.ts` | String IDs, `http.*` helpers |
| `src/routes/tags.ts` | Minimal (unchanged) |
| `src/middleware/auth.ts` | `currentUserId?: string` |
| `src/middleware/http-error.ts` | **New** — `http.*` helper (same pattern as catalog) |
| `src/lib/jwt.ts` | `JwtPayload.userId: string`, remove `Number()` conversion |
| `src/types/hono.d.ts` | `currentUserId?: string` |
| `src/db/seed.ts` | `hashPassword()` from peta-auth, `getORM()`, string IDs |
| `package.json` | Added `"test": "bun test"`, fixed `"test:hurl"` path |
| `src/middleware/error.ts` | Template string simplification (biome lint fix) |
| Various routes | Import ordering fixed (biome auto-fix) |

### Tests (new — `apps/conduit/test/`)

| File | Content |
|------|---------|
| `setup.ts` | `createTestORM()`, `createTestApp()`, `signupUser()`, `loginUser()`, `createArticle()` |
| `auth.test.ts` | 9 tests — register, duplicate email/username, login, get user, update |
| `articles.test.ts` | 10 tests — CRUD, owner checks, filtering by tag/author |
| `comments.test.ts` | 5 tests — CRUD, owner checks |
| `favorites.test.ts` | 4 tests — favorite/unfavorite, auth required |
| `profiles.test.ts` | 5 tests — get profile, follow/unfollow, auth required |
| `tags.test.ts` | 2 tests — empty list, tags from articles |

### ORM Fixes (`packages/orm/`)

| File | Change |
|------|--------|
| `src/model/save.ts` | `insertManyModel` now runs `beforeCreate`/`afterCreate` hooks per-item (was missing — ULID plugin never fired for `insertMany`) |
| `src/query/index.ts` | `innerJoin`/`leftJoin` switched from `join.on(..., sql.id(...))` to `join.onRef(...)` — `sql.id()` treated `"tags.id"` as a single identifier, `onRef` properly resolves table-qualified columns |

### Catalog (`apps/catalog/`) — from previous session

Already migrated in prior session. See `git log` for `39ebd7c`.

## Key Decisions

1. **Kept JWT auth** — RealWorld spec mandates `Authorization: Token <jwt>`. Only password hashing changed (`Bun.password` → `peta-auth`'s `hashPassword`/`verifyPassword`).
2. **No soft-deletes for conduit** — RealWorld spec doesn't require them. The ORM's `applyScopes()` auto-adds `WHERE deletedAt IS NULL` when it finds nullable timestamp columns, which was causing queries to return 0 results. Fixed by making `createdAt`/`updatedAt` non-nullable (timestamps plugin always sets them).
3. **No RBAC for conduit** — Simple auth (authenticated vs unauthenticated). No role hierarchy needed.
4. **Kept existing tag management pattern** — Uses `ArticleTag` pivot model directly. No migration to `insertGraph`/`$related().sync()`.

## Current State

### Test Results ✅
- **ORM: 238 tests pass**, 0 fail, 2 todo
- **Conduit Bun tests: 35 pass**, 0 fail

### Feature Status

| Feature | Status | Notes |
|---------|--------|-------|
| ULID primary keys | ✅ Complete | Both catalog + conduit |
| Plugin-based lifecycle | ✅ Complete | `timestamps()`, `ulid()`, `softDeletes()` |
| `createORM`/`getORM` rename | ✅ Complete | `createPeta` still aliased for backward compat |
| `createApp()` factory | ✅ Complete | Both apps with DI for testability |
| `peta-auth` password hashing | ✅ Complete | Both apps |
| `http.*` error helpers | ✅ Complete | Both apps |
| RBAC hierarchy | ✅ Complete | Catalog only (admin > author > user) |
| Conduit tests | ✅ Complete | 35 Bun tests |
| Catalog tests | ✅ Complete | 59 Bun + 62 Hurl |
| `insertManyModel` hooks fix | ✅ Complete | ULID plugin fires for `insertMany` |
| `innerJoin`/`leftJoin` fix | ✅ Complete | `onRef` instead of `on` for column-to-column |
| `peta-migrate` publishable package | ❌ Not started | From earlier handoffs |
| `peta-orm` v1.0.0 release | ❌ Not started | Publish to npm with changelog |
| Integration tests with real DBs | ❌ Not started | PostgreSQL, MySQL |

### How to run

```bash
# Conduit tests
cd apps/conduit && bun test

# Conduit seed
cd apps/conduit && rm -f conduit.db && bun run seed

# Conduit dev server
cd apps/conduit && bun run dev

# Catalog tests (Bun)
cd apps/catalog && bun test

# Catalog tests (Hurl — starts server on port 4000)
cd apps/catalog && bun run test:hurl

# ORM tests
cd packages/orm && bun test

# ORM rebuild (after source changes)
cd packages/orm && bun run build

# Typecheck (both apps)
cd apps/conduit && bun run typecheck
cd apps/catalog && bun run typecheck
```

## ORM Bugs Found & Fixed

1. **`insertManyModel` didn't run lifecycle hooks** — When models used `.use(ulid())`, calling `Tag.insertMany([...])` would store NULL IDs because `beforeCreate` never fired. Fixed by creating instances, running `beforeCreate`, extracting data, inserting via Kysely, then running `afterCreate`.

2. **`innerJoin`/`leftJoin` used `join.on()` instead of `join.onRef()`** — The callback form `join.on(lhs, "=", rhs)` treated `rhs` as a parameterized value (string literal), not a column reference. Switching to `join.onRef(lhs, "=", rhs)` correctly generates column-to-column comparisons.

3. **`applyScopes()` false-positive soft-delete filter** — The condition `Object.values(cols).some(c => c.dataType === "timestamp" && c.isNullable)` added `WHERE deletedAt IS NULL` for any model with nullable timestamps (even without a `deletedAt` column). Fixed by making timestamps non-nullable in conduit (they're always set by the plugin).

## Next Steps / Pending

- [ ] **`peta-migrate` as publishable package** — CI, README, proper versioning
- [ ] **peta-orm v1.0.0 release** — Publish to npm with changelog
- [ ] **Integration tests with real databases** — PostgreSQL, MySQL
- [ ] **Production hardening** — Env var validation on startup (no fallback secrets in prod), CORS origin config, rate limiting, health endpoint

## Important Context

### Architecture
```
packages/
├── peta-orm/          # ORM with ULID, timestamps, soft-deletes plugins
│   ├── src/plugins/   # ulid.ts, timestamps.ts, soft-deletes.ts
│   ├── src/relations/ # has-many.ts, many-to-many.ts (lazy thunks)
│   └── test/          # 238 tests
├── peta-auth/         # hashPassword/verifyPassword, signJWT/verifyJWT, sessions
└── peta-docs/         # route() helper with response validation

apps/
├── catalog/           # Session-cookie auth, RBAC, ULID — 59 Bun + 62 Hurl tests
└── conduit/           # JWT token auth (RealWorld spec), ULID — 35 Bun tests
```

### Gotchas

- **ORM soft-delete auto-filtering** — The ORM automatically adds `WHERE deletedAt IS NULL` to queries if the model has ANY nullable timestamp column. To avoid this, ensure timestamps are non-nullable or add an explicit `deletedAt` column with `.use(softDeletes())`.
- **Kysely `join.on()` vs `join.onRef()`** — In the callback form of Kysely joins, `join.on(lhs, '=', rhs)` treats `rhs` as a value (parameterized). Use `join.onRef(lhs, '=', rhs)` for column-to-column comparisons. The ORM's `innerJoin`/`leftJoin` now uses `onRef`.
- **JWT auth in RealWorld spec** — The conduit API uses Token-based auth (`Authorization: Token <jwt>` header), not session cookies. The JWT payload now carries string user IDs.
- **`insertMany` and hooks** — Models using plugins (like `ulid()`) must go through `insertManyModel` which now properly triggers `beforeCreate`/`afterCreate` hooks per item.
- **`peta-auth` dist is stale** — The dist version uses bcrypt (from bcryptjs), but the source code uses `@node-rs/argon2`. The dist works correctly with bcrypt, but if the source is changed, rebuild with `bun run build` in `packages/auth/`.
- **ArkType `"string?"` vs `"string | null"`** — `"string?"` means `string | undefined`, but JSON serialization uses `null`. Response schemas with nullable DB columns must use `"string | null"`, not `"string?"`. Request body schemas for optional fields should use `"string?"`.
- **Soft-deletes filter by default** — After `model.$delete()`, the record is soft-deleted and excluded from normal queries. `find()` returns `null`. Use `.withTrashed()` to include soft-deleted records.

(End of file)
