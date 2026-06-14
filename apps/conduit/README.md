# Conduit

A [RealWorld](https://github.com/gothinkster/realworld) API backend — a Medium.com clone — built with [Hono](https://hono.dev) and the peta stack.

Demonstrates `peta-orm`, `peta-auth`, and `peta-docs` working together in a production-style REST API with JWT auth, complex relational queries, article feeds, comments, favorites, and tagging.

```bash
bun run src/index.ts     # Start server on port 3001
```

---

## Quick Start

```bash
# Install dependencies (from workspace root)
bun install

# Seed the database
bun run apps/conduit/src/db/seed.ts

# Start the server
bun run apps/conduit/src/index.ts
```

The server starts on `http://localhost:3001`. OpenAPI spec at `/openapi.json` and Scalar docs UI at `/docs`.

---

## Routes

All routes are mounted under `/api`.

### Auth

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/users` | — | Register a new user |
| POST | `/api/users/login` | — | Login |
| GET | `/api/user` | Required | Get current user |
| PUT | `/api/user` | Required | Update current user |

### Profiles

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/profiles/:username` | — | Get a user profile |
| POST | `/api/profiles/:username/follow` | Required | Follow a user |
| DELETE | `/api/profiles/:username/follow` | Required | Unfollow a user |

### Articles

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/articles` | — | List articles (filter by tag, author, favorited) |
| GET | `/api/articles/feed` | Required | Feed from followed users |
| GET | `/api/articles/:slug` | — | Get a single article |
| POST | `/api/articles` | Required | Create an article |
| PUT | `/api/articles/:slug` | Required | Update article (author only) |
| DELETE | `/api/articles/:slug` | Required | Delete article (author only) |

### Comments

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/articles/:slug/comments` | — | Get comments for an article |
| POST | `/api/articles/:slug/comments` | Required | Create a comment |
| DELETE | `/api/articles/:slug/comments/:id` | Required | Delete comment (owner only) |

### Favorites

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/articles/:slug/favorite` | Required | Favorite an article |
| DELETE | `/api/articles/:slug/favorite` | Required | Unfavorite an article |

### Tags

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/tags` | — | List all tags |

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
| **ORM** | [peta-orm](https://www.npmjs.com/package/peta-orm) — models, relations, queries |
| **Auth** | [peta-auth](https://www.npmjs.com/package/peta-auth) — JWT sign/verify, password hashing |
| **Docs** | [peta-docs](https://www.npmjs.com/package/peta-docs) — OpenAPI 3.1 + Scalar UI |

### Auth

JWT-based authentication using `Authorization: Token <jwt>` header. Tokens are signed with HS256 via `peta-auth/jwt` and have a 14-day expiry.

```ts
// src/middleware/auth.ts — JWT verification middleware
export async function resolveUser(c: Context, next: Next) {
  const header = c.req.header("Authorization")
  if (header?.startsWith("Token ")) {
    const payload = await verifyJWT(header.slice(6), { password: JWT_SECRET })
    if (payload) {
      c.set("currentUserId", payload.userId)
      c.set("currentUsername", payload.username)
    }
  }
  await next()
}
```

### Models

Seven models defined with `peta-orm`, using ULID primary keys and timestamps:

| Model | Table | Relations |
|-------|-------|-----------|
| `User` | `users` | hasMany `articles` |
| `Article` | `articles` | belongsTo `author` (User), manyToMany `tags`, hasMany `comments`, manyToMany `favoritedBy` (User) |
| `Tag` | `tags` | — |
| `ArticleTag` | `article_tags` | Pivot |
| `Comment` | `comments` | belongsTo `article`, belongsTo `author` (User) |
| `Favorite` | `favorites` | Pivot |
| `Follow` | `follows` | Self-referencing User pivot |

### Error Handling

Errors follow the RealWorld API spec format `{ errors: { field: ["message"] } }`.

| Status | When |
|--------|------|
| 400 | Validation failure |
| 401 | Missing or invalid auth |
| 403 | Not authorized for this action |
| 404 | Resource not found |
| 409 | Duplicate email or username |
| 422 | Unprocessable entity |

---

## Testing

```bash
# Unit tests (Vitest-compatible via Bun)
bun test

# HURL integration tests
bash tests/hurl/run-api-tests-hurl.sh
```

### Test structure

| File | Coverage |
|------|----------|
| `test/auth.test.ts` | Register, login, duplicate detection, get/update user |
| `test/articles.test.ts` | CRUD, slug lookup, auth checks, tag/author filtering |
| `test/comments.test.ts` | Create/list/delete comments, ownership checks |
| `test/favorites.test.ts` | Favorite/unfavorite toggle |
| `test/profiles.test.ts` | Get profile, follow/unfollow |
| `test/tags.test.ts` | List tags |

---

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Server port |
| `JWT_SECRET` | `conduit-jwt-secret-change-in-production-32chars!!` | JWT signing secret (min 32 chars) |

---

## Related

This app is part of the [peta-stack](https://github.com/zfadhli/peta-stack) monorepo. See also:

- [Catalog](../catalog) — More comprehensive ORM feature showcase with session auth, role-based access, soft deletes
- [peta-orm](../../packages/orm) — ORM with models, relations, hooks, soft deletes
- [peta-auth](../../packages/auth) — Encrypted cookie sessions, JWT, OAuth
- [peta-docs](../../packages/docs) — OpenAPI 3.1 spec generation + Scalar UI
