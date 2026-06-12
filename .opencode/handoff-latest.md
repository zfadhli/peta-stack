# Session Handoff — 2026-06-12 08:20

## Goal

Build a RealWorld Conduit API (`apps/conduit/`) from scratch, implementing the full [Conduit spec](https://docs.realworld.show/specifications/backend/introduction/) — 19 endpoints covering articles, comments, profiles, follows, favorites, auth, and tags. Also fix a `return await next()` bug in `peta-docs/authGuard` that broke RouteBuilder's internal middleware chain for unknown auth schemes.

## Files Modified/Created

### apps/conduit/ — 16 new source files + 14 test files

**New source files:**
- `src/index.ts` — Server entry, CORS, `resolveUser()` JWT extraction, 6 route mounts, OpenAPI spec at `/openapi.json`, Scalar docs at `/docs`, global `onError`
- `src/db/schema.ts` — 6 models (User, Article, Tag, ArticleTag, Comment, Favorite, Follow), 7 SQL tables, `getPeta()` singleton
- `src/db/seed.ts` — 3 users, 4 articles, 4 tags, article-tag pivots, comments, favorites, follows
- `src/lib/jwt.ts` — `signToken()` / `verifyToken()` wrappers around `peta-auth` JWT
- `src/lib/slug.ts` — `slugify()` + `uniqueSlug()` with collision avoidance (numeric suffix → random hex → timestamp)
- `src/middleware/auth.ts` — `resolveUser()` (extracts JWT from `Authorization: Token <jwt>`), `requireAuth()` (401 if no user), `getCurrentUserId()`
- `src/middleware/error.ts` — RealWorld `{ errors: { field: ["msg"] } }` format, `onValidationError` for RouteBuilder
- `src/types/hono.d.ts` — `ContextVariableMap` augmentation for `currentUserId` / `currentUsername`
- `src/routes/auth.ts` — POST `/users` (register), POST `/users/login` (login), GET `/user` (current user), PUT `/user` (update), all with ArkType schemas
- `src/routes/profiles.ts` — GET `/profiles/:username`, POST/DELETE `/profiles/:username/follow` (with `following` flag)
- `src/routes/articles.ts` — GET `/articles` (filter by tag/author/favorited, offset/limit, no body in list), GET `/articles/feed` (from followed users), GET `/articles/:slug` (with body), POST/PUT/DELETE `/articles/:slug` (author-only mutations)
- `src/routes/comments.ts` — GET/POST `/articles/:slug/comments`, DELETE `/articles/:slug/comments/:id` (author-only delete)
- `src/routes/favorites.ts` — POST/DELETE `/articles/:slug/favorite`
- `src/routes/tags.ts` — GET `/tags`
- `package.json`, `tsconfig.json`

**Test files (Hurl):**
- `tests/hurl/*.hurl` — 13 official RealWorld Hurl test files + `run-api-tests-hurl.sh`

### packages/docs/ — 2 files modified
- `src/hono/route.ts` — Fixed `authGuard()` to `return await next()` instead of `await next()`, so the RouteBuilder's internal middleware chain properly propagates the Response for unknown auth schemes (like `"Token"`)
- `src/spec.ts` — Added nested try/catch in `toOpenAPISchema()` so union types with `| undefined` that can't convert to JSON Schema gracefully fall back to `{}` instead of crashing spec generation

### apps/catalog/ — 1 file modified
- `src/db/schema.ts` — Added `database.run("PRAGMA foreign_keys = ON")` to enable foreign key enforcement (SQLite defaults to OFF)

## Key Decisions

1. **New app at `apps/conduit/`** — Not a rewrite of catalog. Domain model (articles/comments/follows/favorites) and auth (JWT Bearer token) are fundamentally different from catalog's books/authors/sessions.

2. **JWT via `peta-auth`** — Uses existing `signJWT`/`verifyJWT` utilities with a `JWT_SECRET` env var (defaults to hardcoded string). Tokens valid for 14 days.

3. **`Authorization: Token <jwt>` header** — RealWorld uses `Token` prefix (not `Bearer`). The `authGuard` in `route.ts` only checks for `Bearer`/`Cookie`, so `.auth("Token")` is used for OpenAPI metadata only, while `requireAuth()` (custom middleware) handles actual enforcement.

4. **Response schemas use `"string | null"` only** — No `| undefined` in response schemas because JSON serialization drops `undefined` keys. The `buildUserResponse()` helper explicitly coerces `undefined` → `null` via `?? null`.

5. **Auth middleware BEFORE RouteBuilder** — `requireAuth()` is passed as Hono middleware before `route().handle(...)` so auth errors (401) occur before body validation (422). This applies to all 10 mutation routes.

6. **ArkType `"key?"` syntax for optional request body keys** — Used for partial update schemas (`UpdateUserBody`, `UpdateArticleBody`). This produces `| undefined` unions internally which cause `toJsonSchema` failures, but the peta-docs fallback handles it gracefully now.

7. **Slug generation** — `slugify(title)` + collision check. Tries numeric suffixes (`title-2`, `title-3`…), then random hex (`title-a1b2c3`), then timestamp as last resort.

## Current State

### apps/conduit/ ✅
- **19 API endpoints** across 6 route files (12 need auth, 7 public)
- Full RealWorld spec coverage: auth, profiles, articles, comments, favorites, tags
- JWT Bearer token auth via `peta-auth` (sign/verify)
- ArkType request/response validation with RealWorld `{ errors: {...} }` format
- Envelope responses (`{ user, article, articles, comments, profile, tags }`)
- Offset/limit pagination, tag/author/favorited filtering
- Slug auto-generation with collision avoidance
- OpenAPI spec at `/openapi.json`, Scalar docs UI at `/docs`
- `requireAuth()` middleware runs before body validation on all protected routes
- `.auth("Token")` on 12 routes for OpenAPI security metadata
- TypeScript strict, 0 errors, Biome clean
- Hurl test suite from official RealWorld repo included

### packages/docs/ ✅
- `authGuard()` now uses `return await next()`, fixing custom auth schemes in RouteBuilder
- `toOpenAPISchema()` has nested try/catch for graceful `| undefined` handling

### apps/catalog/ ✅
- `PRAGMA foreign_keys = ON` enabled, enforcing referential integrity

### How to run
```bash
cd apps/conduit
bun run src/db/seed.ts   # populate sample data
bun run src/index.ts      # start server at :3001
# Open http://localhost:3001/docs
# Run Hurl tests: HOST=http://localhost:3001 ./tests/hurl/run-api-tests-hurl.sh
```

### How to test auth
```bash
# Register
curl -X POST http://localhost:3001/api/users \
  -H "Content-Type: application/json" \
  -d '{"user":{"username":"jake","email":"jake@jake.jake","password":"jakejake"}}'

# Login (capture token)
curl -s -X POST http://localhost:3001/api/users/login \
  -H "Content-Type: application/json" \
  -d '{"user":{"email":"jake@jake.jake","password":"jakejake"}}'

# Use token for protected routes
curl http://localhost:3001/api/user \
  -H "Authorization: Token <jwt>"
```

## Next Steps / Pending

- [ ] Install `hurl` CLI and run the official Hurl test suite for full spec compliance verification
- [ ] Add env var validation (`.env.example`, `JWT_SECRET` minimum length check)
- [ ] Consider adding rate limiting and response compression (as noted in the original catalog handoff)
- [ ] OpenAPI spec doesn't show `offset`/`limit` query params on list endpoints — would need `.query()` schema or manual `parameters` config on the RouteBuilder
- [ ] The `findOrCreateTags()` function in `articles.ts` does sequential individual tag lookups/inserts — could optimize with bulk operations
- [ ] API response for `POST /api/users` returns a new JWT token but the spec says it should return the same session token — current behavior is functional but the token changes on each login call, which is expected (new JWT each time)

## Important Context

### Architecture
```
peta-stack/
├── apps/
│   ├── catalog/              # Books Catalog API (demo, session-based auth)
│   └── conduit/              # RealWorld Conduit API (JWT token auth)
├── packages/
│   ├── orm/                  # peta-orm — function-based ORM on Kysely
│   ├── auth/                 # peta-auth — JWT + session auth utilities
│   └── docs/                 # peta-docs — RouteBuilder + OpenAPI/Scalar
```

### Gotchas
- **peta-docs uses compiled `dist/`** — source changes in `packages/docs/src/` require `bun run build` inside `packages/docs/` to take effect at runtime
- **`Authorization: Token <jwt>`** (not `Bearer`) — the built-in `authGuard` in RouteBuilder only handles `Bearer`/`Cookie`. Use `requireAuth()` middleware for enforcement, `.auth("Token")` only for OpenAPI metadata
- **ArkType `"key?"` syntax** makes keys optional but adds `| undefined` internally, which fails `toJsonSchema()`. Fix: nested try/catch in `toOpenAPISchema()` returns `{}` rather than crashing
- **JSON drops `undefined`** — always use `?? null` when serializing nullable fields to avoid missing keys in response bodies
- **`$save()`, `$delete()`, `$find()` don't accept kysely override** — use raw `trx.insertInto()` inside transactions instead
- **`insertMany()` DOES accept a kysely override** — `Model.insertMany(data, trx)` for transactional bulk inserts
- **Hurl tests** are at `apps/conduit/tests/hurl/`. Requires `hurl` CLI (install via `brew install hurl` or from [hurl.dev](https://hurl.dev))
- **Database file** is `conduit.db` in `apps/conduit/` — gitignored via `*.db`. Delete to reset
- **JWT secret** defaults to hardcoded string in `src/lib/jwt.ts` when `JWT_SECRET` env var is not set
- **Server port** defaults to 3001 (configurable via `PORT` env var)
