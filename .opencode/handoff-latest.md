# Session Handoff — 2026-06-11 13:48

## Goal

Iteratively improve the Books Catalog API (apps/catalog) and fix bugs in peta-orm. Major themes: eliminate `clone()` bugs, suppress ArkType OpenAPI warnings, add HTTP error helper, improve error handling, add transactions, eliminate TOCTOU races, complete CRUD for all entities.

## Files Modified/Created

### apps/catalog/ — 10 source files + 2 new

**New files:**
- `src/middleware/http-error.ts` — `http.conflict()`, `.notFound()`, `.unauthorized()`, `.forbidden()`, `.badRequest()` wrappers around Hono's `HTTPException`

**Modified:**
- `src/index.ts` — Added global `onError` handler (catches `HTTPException` + `DatabaseError` + raw SQLite errors via `normalizeError`), column-aware friendly error messages
- `src/middleware/auth.ts` — Renamed from `routes/middleware.ts`, now throws `http.*()` instead of `return c.json()`
- `src/routes/auth.ts` — Removed pre-flight SELECT (TOCTOU race), catches `DatabaseError("UNIQUE_CONSTRAINT")` for friendly message, email validation via `"string.email"`
- `src/routes/authors.ts` — Added `PATCH /:id` and `DELETE /:id` (soft-delete, guarded against books), `UpdateAuthorBody` schema
- `src/routes/books.ts` — `POST /books` wrapped in `Book.transaction()` (atomic book + categories), `PATCH /:id` category ops wrapped in transaction, raw `trx.deleteFrom` for category cleanup
- `src/routes/books_reviews.ts` — Added `GET /:reviewId`, `PATCH /:reviewId`, `DELETE /:reviewId` (ownership check), `UpdateReviewBody` schema
- `src/routes/categories.ts` — Added `GET /:id`, `PATCH /:id`, `DELETE /:id` (guarded against pivot books), removed pre-flight SELECT
- `src/db/schema.ts` — Added `deletedAt` column + `hidden: ["deletedAt"]` + `registerSoftDeletes()` to Author model
- `src/db/seed.ts` — Added 2 reviews for "1984" (Alice + Bob)

### packages/orm/ — 2 files modified

- `src/builder/query.ts` — Eliminated `clone()` from `first()`, `find()`, `findOrFail()`, `chunk()`. These methods now work directly with `qb` instead of cloning, preserving WHERE/ORDER BY/LIMIT/OFFSET state. Updated the `clone()` comment to a strong WARNING.
- `src/model/serialize.ts` — `modelToJSON` now calls `r.$toJSON(visited)` on related models instead of `modelToJSON(def, r, visited)`, using each related model's own `hidden`/`visible`/`casts`/`appends`. Added `typeof .$toJSON === "function"` guard instead of `typeof === "object"`.

### packages/docs/ — 1 file modified

- `src/spec.ts` — `toOpenAPISchema()` now falls back to `schema.in.toJsonSchema()` for pipe/morph schemas, stripping the morph layer to expose the input type. Eliminates 4 console.warn messages at startup and gives filter params proper JSON Schema types.

## Key Decisions

1. **`clone()` eliminated from 4 internal methods** — `first()`, `find()`, `findOrFail()`, `chunk()` all called `self.clone()` which creates a fresh QueryBuilder without any prior WHERE/ORDER BY state. This caused `User.query().where("email", body.email).first()` to return the first user regardless of email, making signup always fail with 409.

2. **Use per-instance `$toJSON()` for related models** — Instead of passing the parent's model definition (def) when serializing related models, call each instance's own `$toJSON()`. This ensures each related model uses its own `hidden`/`visible`/`casts`/`appends` config, and guards against plain objects stored as relations (like `_pivot`).

3. **HTTP error helper + global onError** — All route handlers now `throw http.conflict()` / `http.notFound()` etc. instead of `return c.json({ error }, status)`. The global `onError` handler catches `HTTPException`, `DatabaseError`, and raw SQLite errors (via `normalizeError`) and returns consistent `{ error: string }` JSON.

4. **Column-aware error messages** — The `onError` handler extracts the column name from the raw driver error message (`"UNIQUE constraint failed: users.email"` → `"email"`) and maps to friendly messages like `"A user with this email already exists"`.

5. **Eliminated TOCTOU races** — Removed pre-flight SELECT checks in auth signup and category creation. Let the DB UNIQUE constraint enforce uniqueness, catching `DatabaseError("UNIQUE_CONSTRAINT")` for friendlier messages.

6. **Transactions for multi-step writes** — `POST /books` (book insert + category pivots) and `PATCH /books` (category replace) are wrapped in `Book.transaction()`. Raw `trx.insertInto`/`trx.deleteFrom` used for operations that bypass the ORM's instance methods (which don't accept a kysely override).

7. **Complete CRUD** — Added 8 missing endpoints to reach full CRUD parity across all 5 entity types. Author + Category deletions guard against orphaned books.

8. **ArkType `| undefined` in type strings breaks toJsonSchema()** — Use `"string?"` suffix instead of `"string | undefined"`.

9. **ArkType `pipe()` schemas produce OpenAPI conversion warnings** — Fixed by falling back to `schema.in.toJsonSchema()`. This is no longer cosmetic — filter params now have proper types in the spec.

## Current State

### apps/catalog/ ✅
- **19 API endpoints** across 5 route files (was 16)
- Full CRUD for Books, Authors, Categories, Reviews
- Session-based auth with ownership checks on review mutations
- Global error handler with friendly, column-aware messages
- Transactions for atomic book + category writes
- No pre-flight SELECT races
- Email format validation via `"string.email"`
- OpenAPI spec at `/openapi.json`, Scalar UI at `/docs`
- TypeScript strict, 0 errors

### packages/orm/ ✅
- 156 tests pass (0 regression)
- TypeScript strict, 0 errors
- `first()`, `find()`, `findOrFail()`, `chunk()` no longer drop query state
- `modelToJSON` uses per-instance `$toJSON()` for correct config inheritance
- Biome clean

### packages/docs/ ✅
- OpenAPI conversion no longer warns on pipe/morph schemas
- Filter params have proper JSON Schema types (not empty `{}`)

### How to run
```bash
cd apps/catalog
bun run src/db/seed.ts   # populate sample data
bun run src/index.ts      # start server at :3000
# Open http://localhost:3000/docs
```

## Next Steps / Pending

- [ ] Add test infrastructure for the catalog app (vitest/supertest or bun:test)
- [ ] Add env var validation (`.env.example`, SESSION_PASSWORD minimum length check)
- [ ] Add rate limiting and CSRF protection (peta-auth has `src/csrf.ts` but it's unused)
- [ ] Add `PRAGMA foreign_keys = ON` in schema setup
- [ ] Add security headers (`hono/secure-headers`)
- [ ] Add response compression (`hono/compress`)
- [ ] Update root README.md to describe monorepo structure + catalog app
- [ ] Publish packages to npm (update versions, changelogs)

## Important Context

### Architecture
```
peta-stack/
├── apps/catalog/              # Books Catalog API (demo application)
│   └── src/
│       ├── middleware/         # auth.ts (requireSession, requireRole) + http-error.ts
│       ├── routes/            # 5 flat route files (auth, authors, books, books_reviews, categories)
│       ├── db/schema.ts       # 6 models + peta instance + table creation
│       ├── db/seed.ts         # Sample data (10 books, 6 authors, 5 categories, 3 users, 2 reviews)
│       ├── helpers.ts         # pick() utility
│       ├── types/hono.d.ts    # ContextVariableMap augmentation
│       └── index.ts           # App entry + global error handler
├── packages/orm/              # peta-orm library
├── packages/auth/             # peta-auth library
└── packages/docs/             # peta-docs library
```

### Gotchas
- **`$save()`, `$delete()`, `$find()` don't accept a kysely override** — Can't participate in transactions. Use raw `trx.insertInto()`, `trx.deleteFrom()` inside `Book.transaction()` callbacks.
- **`insertMany()` DOES accept a kysely override** — Pass the `trx` handle as the second argument: `Model.insertMany(data, trx)`.
- **`createQueryBuilder(def, peta, trx)`** — Needed when you need a QueryBuilder scoped to a transaction (e.g., for `deleteMany()` inside a transaction).
- **ArkType `"string?"` means `string | undefined`**, not `string | null` — Response validation schemas using `"string?"` will reject `null` values from the ORM.
- **ArkType `pipe()` schemas** — Now handled gracefully by `schema.in.toJsonSchema()` fallback in peta-docs.
- **`DatabaseError`** has `.code`, `.table`, `.cause` properties. The cause contains the raw driver error with `.message` like `"UNIQUE constraint failed: users.email"`.
- **`normalizeError(err)`** is exported from `peta-orm` and can convert raw SQLite errors to `DatabaseError`.
- **Database file** is `catalog.db` in `apps/catalog/` — gitignored via `*.db`. Delete to reset.
- **Session password** defaults to a hardcoded string in `src/index.ts` when `SESSION_PASSWORD` env var is not set.
