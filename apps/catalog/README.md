# Catalog

A books catalog API backend — demonstrating advanced `peta-orm` features including session-based auth, role-based access control, soft deletes, graph operations, and advanced pagination/filtering/sorting.

Built with [Hono](https://hono.dev) and the full peta stack.

```bash
bun run src/index.ts     # Start server on port 3000
```

---

## Quick Start

```bash
# Install dependencies (from workspace root)
bun install

# Seed the database
bun run apps/catalog/src/db/seed.ts

# Start the server
bun run apps/catalog/src/index.ts
```

The server starts on `http://localhost:3000`. OpenAPI spec at `/openapi.json` and Scalar docs UI at `/docs`.

---

## Routes

All routes are mounted under `/api`.

### Auth

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/signup` | — | Create account (sets session cookie) |
| POST | `/api/auth/login` | — | Login (sets session cookie) |
| POST | `/api/auth/logout` | Required | Logout (destroys session) |
| GET | `/api/auth/me` | Required | Get current user from session |

### Books

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/books` | — | List books (paginated, filterable, sortable) |
| POST | `/api/books` | Author/Admin | Create a book |
| GET | `/api/books/:id` | — | Get a book by ID |
| PATCH | `/api/books/:id` | Owner/Admin | Update a book |
| DELETE | `/api/books/:id` | Owner/Admin | Soft-delete a book |
| GET | `/api/books/:id/reviews` | — | List reviews for a book |
| POST | `/api/books/:id/reviews` | Required | Create a review |
| GET | `/api/books/:id/reviews/:reviewId` | — | Get a single review |
| PATCH | `/api/books/:id/reviews/:reviewId` | Owner | Update a review |
| DELETE | `/api/books/:id/reviews/:reviewId` | Owner | Delete a review |

### Authors

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/authors` | — | List authors (paginated) |
| POST | `/api/authors` | Author/Admin | Create an author profile |
| GET | `/api/authors/:id` | — | Get author with their books |
| PATCH | `/api/authors/:id` | Owner/Admin | Update author |
| DELETE | `/api/authors/:id` | Owner/Admin | Soft-delete author (blocked if has books) |

### Categories

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/categories` | — | List all categories |
| POST | `/api/categories` | Admin | Create a category |
| GET | `/api/categories/:id` | — | Get a category |
| PATCH | `/api/categories/:id` | Admin | Update a category |
| DELETE | `/api/categories/:id` | Admin | Delete category (blocked if has books) |

### Docs

| Method | Path | Description |
|--------|------|-------------|
| GET | `/openapi.json` | Auto-generated OpenAPI 3.1 spec |
| GET | `/docs` | Scalar API reference UI |

---

## Architecture

### Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | [Hono](https://hono.dev) v4 |
| **Database** | SQLite via `bun:sqlite` + `kysely-bun-sqlite` |
| **Validation** | [ArkType](https://arktype.io) v2 |
| **ORM** | [peta-orm](https://www.npmjs.com/package/peta-orm) — models, relations, soft deletes, casts, graph operations |
| **Auth** | [peta-auth](https://www.npmjs.com/package/peta-auth) — session middleware (`peta-auth/hono`) |
| **Docs** | [peta-docs](https://www.npmjs.com/package/peta-docs) — OpenAPI 3.1 + Scalar UI with `.paginated()`, `.filter()`, `.sort()`, `.include()` |

### Auth

Session-cookie-based authentication using `peta-auth/hono`. Sessions store `userId` and `userRole` with a role hierarchy:

| Role | Level | Access |
|------|-------|--------|
| `user` | 1 | Create reviews |
| `author` | 2 | Manage own books and author profile |
| `admin` | 3 | Full access to all resources |

```ts
// Session middleware setup
app.use("*", session({ password: SESSION_PASSWORD, cookieName: "catalog-session" }))

// Role-based guard
function requireRole(minRole: "admin" | "author" | "user") {
  const levels = { admin: 3, author: 2, user: 1 }
  return async (c: Context, next: Next) => {
    const role = c.var.session.userRole as string
    if (levels[role as keyof typeof levels] < levels[minRole]) {
      throw HTTPError.forbidden()
    }
    await next()
  }
}
```

### Models

Six models defined with `peta-orm`, showcasing soft deletes, timestamps, ULID primary keys, and boolean casting:

| Model | Table | Relations | Features |
|-------|-------|-----------|----------|
| `User` | `users` | hasOne `author` | softDeletes, timestamps, ulid |
| `Author` | `authors` | belongsTo `user`, hasMany `books` | softDeletes, timestamps, ulid |
| `Book` | `books` | belongsTo `author`, manyToMany `categories`, hasMany `reviews` | softDeletes, timestamps, ulid, `casts: { inStock: "boolean" }` |
| `Category` | `categories` | manyToMany `books` | ulid |
| `BookCategory` | `book_categories` | Pivot | — |
| `Review` | `reviews` | belongsTo `book`, belongsTo `user` | ulid |

### ORM Features Demonstrated

| Feature | Usage |
|---------|-------|
| **Soft deletes** | `$delete()` marks `deletedAt`, `$forceDelete()` removes permanently |
| **Timestamps** | Auto-set `createdAt`/`updatedAt` on create/update |
| **ULID** | Human-friendly sortable IDs instead of auto-increment |
| **Boolean casting** | `casts: { inStock: "boolean" }` — SQLite integer to boolean |
| **Graph inserts** | `insertGraph()` — create book with category relations in one call |
| **Pivot sync** | `$related("categories").sync([...])` — replace all category assignments |
| **Nested eager loading** | `.with("author.user")` |
| **Hidden fields** | `passwordHash`, `deletedAt` stripped from JSON output |
| **Conditional chaining** | `.when(condition, qb => ...).unless(condition, qb => ...)` |

### Error Handling

| Status | When |
|--------|------|
| 400 | Validation failure or missing ID |
| 401 | Not authenticated |
| 403 | Insufficient role or not the owner |
| 404 | Resource not found |
| 409 | Duplicate value or resource in use (e.g., delete author with books) |

Database constraint violations are normalized:

```ts
if (e instanceof DatabaseError && e.code === "UNIQUE_CONSTRAINT") {
  // e.g., duplicate ISBN, email, or category name
  throw HTTPError.conflict(`${e.table} already exists`)
}
```

---

## Testing

```bash
# Unit tests
bun test

# HURL integration tests
bash test/hurl/run.sh
```

### Test structure

| File | Coverage |
|------|----------|
| `test/auth.test.ts` | Signup, login, logout, session, `/me` |
| `test/books.test.ts` | CRUD, category sync, role-based access, ownership checks |
| `test/authors.test.ts` | CRUD, auto-set userId, delete protection |
| `test/reviews.test.ts` | CRUD, auth checks, ownership |
| `test/categories.test.ts` | CRUD, admin-only, duplicate, delete protection |

---

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `SESSION_PASSWORD` | `change-me-32-chars...` | Session cookie signing secret (min 32 chars) |

---

## Related

This app is part of the [peta-stack](https://github.com/zfadhli/peta-stack) monorepo. See also:

- [Conduit](../conduit) — RealWorld API (Medium clone) with JWT auth
- [peta-orm](../../packages/orm) — ORM with models, relations, hooks, soft deletes
- [peta-auth](../../packages/auth) — Encrypted cookie sessions, JWT, OAuth
- [peta-docs](../../packages/docs) — OpenAPI 3.1 spec generation + Scalar UI
