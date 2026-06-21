# peta-orm

[![npm version](https://img.shields.io/npm/v/peta-orm?style=flat-square)](https://www.npmjs.com/package/peta-orm)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org)
[![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)

A feature-rich ORM for Bun, built on [Kysely](https://kysely.dev) with [ArkType](https://arktype.io) validation. ActiveRecord-style models, typed relations, lazy/eager loading, lifecycle hooks, soft deletes, timestamps, casting, serialization control, global scopes, polymorphic relations, pagination, collections, and more — all fully typed end-to-end.

```ts
const user = await User.insert({ name: "Alice", email: "a@b.com" })
const posts = await User.relations.posts.query(user).where("published", true).execute()
const page = await Post.query().with("author").orderBy("id", "asc").paginate(1, 20)
```

---

## Quick Start

```bash
bun add peta-orm arktype kysely @libsql/kysely-libsql @libsql/client
```

### Simple setup (examples, scripts)

```ts
import { createClient } from "@libsql/client"
import { LibsqlDialect } from "@libsql/kysely-libsql"
import { createORM, defineModel, t } from "peta-orm"

const User = defineModel("users", {
  columns: { id: t.integer().primaryKey(), name: t.string(255), email: t.text().unique() },
})

// Eager init — fine for scripts, one-off tasks
const client = createClient({ url: "file::memory:?cache=shared" })
await client.execute(
  "CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE)",
)

const orm = createORM({ dialect: new LibsqlDialect({ client }), models: { User } })

const user = await User.insert({ name: "Alice", email: "alice@test.com" })
```

### Production setup (apps, servers) — no module-level side effects

Module-level side effects (database connections, schema init, ORM setup at import time) cause problems with testing, HMR, and error recovery. Use `createDb()` for lazy, safe initialization:

```ts
import { createClient } from "@libsql/client"
import { LibsqlDialect } from "@libsql/kysely-libsql"
import { createDb, createORM, defineModel, t } from "peta-orm"

const User = defineModel("users", {
  columns: { id: t.integer().primaryKey(), name: t.string(255), email: t.text().unique() },
})

async function setup() {
  const client = createClient({ url: "file:my-app.db" })
  await client.execute(
    "CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE)",
  )
  const orm = createORM({ dialect: new LibsqlDialect({ client }) })
  orm.registerAll(User)
  return orm
}

/** Lazy singleton — first call creates the connection, subsequent calls reuse it. */
export const db = createDb(setup)

// In route handlers:
// const orm = await db()
// const users = await User.query().execute()
```

The factory function runs **once** on the first `await db()` call. Importing models has zero side effects — no connection, no schema init, no unhandled promises.

> [!TIP]
> For an existing Kysely instance (e.g. from a migration runner), pass it via the `kysely` config option:
> ```ts
> const orm = createORM({ kysely: existingKysely })
> ```

> [!TIP]
> See the 32 [runnable examples](./examples) for every feature. Run them with `bun run examples/XX-*.ts`.

---

## Why peta-orm?

| Feature | Raw Kysely | peta-orm |
|---------|-----------|----------|
| **Validation** | Manual | Automatic from column definitions via ArkType |
| **Models** | Row types only | Class instances with `$save()`, `$delete()`, `$reload()` |
| **Relations** | Manual JOINs | Declarative `hasMany`, `belongsTo`, `hasOne`, `manyToMany` |
| **Eager loading** | Manual batch | `.with("posts.author")` — one line, batched queries |
| **Hooks** | — | `beforeCreate`, `afterUpdate`, `beforeDelete`, etc. |
| **Soft deletes** | — | `withTrashed()`, `onlyTrashed()`, `$restore()`, `$forceDelete()` |
| **Casting** | — | `$casts: { meta: "json", flags: "boolean" }` |
| **Serialization** | — | `$hidden`, `$visible`, `$appends`, accessors |
| **Pagination** | Manual offset/limit | `.paginate(1, 20)` — returns `{ data, total, perPage, ... }` |
| **Error handling** | Raw driver codes | `DatabaseError` with `UNIQUE_CONSTRAINT` across dialects |
| **Conditional queries** | Manual if/else | `.when(condition, qb => ...)`, `.unless(condition, qb => ...)` |
| **Global scopes** | — | `addGlobalScope("active", qb => ...)` |
| **Polymorphic relations** | — | `morphTo`, `morphMany`, `morphOne` |

---

## Features

### Column Types & Validation

Column definitions double as validation schemas — no separate validation step needed.

```ts

const User = defineModel("users", {
  columns: {
    id: t.integer().primaryKey(),
    name: t.string(255).min(2),                                     // min length
    email: t.text().email().unique(),                               // email format + unique
    age: t.integer().nullable().min(0).max(150).default(0),
    role: t.enum("admin", "user").default("user"),
    score: t.double().nullable(),
    ...t.timestamps(),                                              // createdAt, updatedAt
  },
})

const Post = defineModel("posts", {
  columns: {
    id: t.integer().primaryKey(),
    userId: t.integer(),
    title: t.string(255),
    slug: t.string().unique(),
    published: t.boolean().default(false),
  },
})
```

### Relations & Eager Loading

```ts
const User = defineModel("users", {
  columns: { id: t.integer().primaryKey(), name: t.string(255) },
  relations: {
    posts: hasMany(() => Post, { foreignKey: "userId" }),
    profile: hasOne(() => Profile, { foreignKey: "userId" }),
  },
})

// Eager load with dot notation
const users = await User.query().with("posts.author").execute()

// Lazy load after fetch
await user.$load("posts")

// Relation query
const posts = await User.relations.posts.query(user).where("published", true).execute()

// Existence filters
const authors = await User.query().has("posts").execute()
const active = await User.query().whereHas("posts", (q) => q.where("published", true)).execute()
```

### Polymorphic Relations

```ts
const Comment = defineModel("comments", {
  columns: { id: t.integer().primaryKey(), body: t.text() },
  relations: {
    subject: morphTo(() => ({
      Post: { foreignKey: "postId" },
      Article: { foreignKey: "articleId" },
    })),
  },
})

const Post = defineModel("posts", {
  columns: { id: t.integer().primaryKey(), title: t.string(255) },
  relations: { comments: morphMany(() => Comment, { morphType: "post" }) },
})
```

### CRUD & Pagination

```ts
// Insert
const user = await User.insert({ name: "Alice", email: "a@b.com" })

// Find
const found = await User.find(1)
const first = await User.query().where("email", "like", "%@b.com").first()

// Update
user.set("name", "Alice Updated")
await user.$save()
await User.update(1, { name: "Alice Updated" })

// Delete
await user.$delete()
await User.delete(1)

// Paginate
const page = await Post.query().orderBy("id", "asc").paginate(1, 20)
// → { data: Post[], total: 30, perPage: 20, currentPage: 1, lastPage: 2, hasMorePages: true }
```

### Hooks & Timestamps

```ts
User.on("beforeCreate", (user) => { user.email = user.email.toLowerCase() })
User.on("afterCreate", (user) => { console.log("Created:", user.get("id")) })

// Timestamps plugin sets createdAt/updatedAt automatically
const Timestamped = defineModel("ts", {
  columns: { ...t.timestamps(), ...t.integer().primaryKey(), name: t.string(255) },
}).use(timestamps())
```

### Soft Deletes

```ts
const SoftModel = defineModel("items", {
  columns: { id: t.integer().primaryKey(), name: t.string(255), ...t.timestamps() },
}).use(softDeletes())

await item.$delete()              // sets deletedAt
await item.$restore()             // clears deletedAt
await item.$forceDelete()         // actually deletes

const active = await SoftModel.query().execute()               // excludes deleted
const all = await SoftModel.query().withTrashed().execute()    // includes deleted
const trashed = await SoftModel.query().onlyTrashed().execute() // only deleted
```

### Graph Operations

Insert or upsert nested models in a single call:

```ts
const user = await User.insertGraph({
  name: "Alice",
  posts: [{ title: "Post 1" }, { title: "Post 2" }],
})

const updated = await User.upsertGraph({
  id: user.get("id"),
  name: "Alice Updated",
  posts: [{ id: 1, title: "Post 1 Updated" }, { title: "New Post" }],
})
```

### Casting & Serialization

```ts
const User = defineModel("users", {
  columns: {
    id: t.integer().primaryKey(), name: t.string(255),
    meta: t.json(), flags: t.boolean(), password: t.string(255),
  },
  $casts: { meta: "json", flags: "boolean" },
  $hidden: ["password"],
})

const json = user.$toJSON()  // password excluded, meta parsed from JSON
```

### Error Handling

```ts
try {
  await Post.insert({ slug: "my-post" })
} catch (e) {
  if (e instanceof DatabaseError && e.code === "UNIQUE_CONSTRAINT") {
    return c.json({ error: "Slug taken" }, 400)
  }
  throw e
}
```

| Code | Meaning | Driver errors |
|------|---------|--------------|
| `UNIQUE_CONSTRAINT` | Duplicate value | `SQLITE_CONSTRAINT_UNIQUE`, PG `23505`, MySQL `ER_DUP_ENTRY` |
| `FOREIGN_KEY_CONSTRAINT` | Missing referenced row | `SQLITE_CONSTRAINT_FOREIGNKEY`, PG `23503`, MySQL `ER_NO_REFERENCED_ROW_2` |

### Collections

```ts
const col = await User.query().orderBy("id", "asc").collect()
col.pluck("name")       // ["Alice", "Bob"]
col.groupBy("role")     // { admin: [...], user: [...] }
col.load("posts")       // eager load relations
col.sum("score")
col.chunk(10)           // split into batches
```

### Global Scopes & Conditional Chaining

```ts
User.addGlobalScope("active", (qb) => qb.where("active", "=", 1))
await User.query().withoutGlobalScope("active").execute()

const posts = await Post.query()
  .when(sort?.length, (q) => q.orderBy(sort[0]!, "asc"))
  .unless(sort?.length, (q) => q.orderBy("createdAt", "desc"))
  .execute()
```

---

## Migrations

See the [peta-migrate](../migrate/README.md) package for migration generation and running.

```ts
import { createMigrationRunner, createMigrationGenerator } from "peta-migrate"
```

---

## Examples

All self-contained (inline SQLite, run directly):

```bash
bun run examples/01-basic-setup.ts
bun run examples/04-relations.ts
bun run examples/07-soft-deletes.ts
```

| # | Example | Topic |
|---|---------|-------|
| 01 | [basic-setup](./examples/01-basic-setup.ts) | ORM init + SQLite setup |
| 02 | [model-definition](./examples/02-model-definition.ts) | Columns, types, modifiers, timestamps |
| 03 | [crud](./examples/03-crud.ts) | insert, find, update, delete, paginate |
| 04 | [relations](./examples/04-relations.ts) | hasMany, belongsTo, hasOne, eager loading |
| 05 | [query-builder](./examples/05-query-builder.ts) | where, orderBy, join, has, whereHas |
| 06 | [hooks-timestamps](./examples/06-hooks-timestamps.ts) | beforeCreate, afterCreate, timestamps |
| 07 | [soft-deletes](./examples/07-soft-deletes.ts) | $delete, $restore, $forceDelete, withTrashed |
| 08 | [collection-paginator](./examples/08-collection-paginator.ts) | Collection, Paginator, `.collect()` |
| 09 | [hono-integration](./examples/09-hono-integration.ts) | Hono app + DatabaseError handling |
| 10 | [elysia-integration](./examples/10-elysia-integration.ts) | Elysia app stub |
| 11 | [many-to-many](./examples/11-many-to-many.ts) | ManyToMany via pivot table |
| 12 | [transactions](./examples/12-transactions.ts) | Model.transaction(), rollback |
| 13 | [casting](./examples/13-casting.ts) | $casts, $hidden, $appends, accessors |
| 14 | [global-scopes](./examples/14-global-scopes.ts) | addGlobalScope(), withoutGlobalScope() |
| 15 | [batch](./examples/15-batch.ts) | insertMany |
| 16 | [discover](./examples/16-discover.ts) | peta.discover(), rest params |
| 17 | [instance-methods](./examples/17-instance-methods.ts) | fill, dirty, reset, $reload, $load |
| 18 | [advanced-queries](./examples/18-advanced-queries.ts) | groupBy/having, aggregate helpers, chunk |
| 19 | [collections-deep](./examples/19-collections-deep.ts) | Full Collection + Paginator API |
| 20 | [advanced-relations](./examples/20-advanced-relations.ts) | HasManyThrough, polymorphic morphs |
| 21 | [migrations](./examples/21-migrations.ts) | MigrationRunner, MigrationGenerator |
| 22 | [related-query-builder](./examples/22-related-query-builder.ts) | `$related()` — scoped relation queries |
| 23 | [attach-detach-sync](./examples/23-attach-detach-sync.ts) | Many-to-many pivot management |
| 24 | [computed-columns](./examples/24-computed-columns.ts) | Runtime + batch async computed columns |
| 25 | [static-hooks](./examples/25-static-hooks.ts) | `asFindQuery()` + `cancelQuery()` |
| 26 | [repository-pattern](./examples/26-repository-pattern.ts) | `createRepo()` — custom query methods |
| 27 | [plugins-and-helpers](./examples/27-plugins-and-helpers.ts) | `.use()` plugin system + makeHelper() |
| 28 | [nested-create-update](./examples/28-nested-create-update.ts) | Create/update with related data in one call |
| 29 | [allow-graph](./examples/29-allow-graph.ts) | `allowGraph()` — recursive eager load whitelist |
| 30 | [polymorphic-relations](./examples/30-polymorphic-relations.ts) | MorphMany/MorphOne/MorphTo |
| 31 | [graph-operations](./examples/31-graph-operations.ts) | `insertGraph()`/`upsertGraph()` with `#id`/`#ref` |
| 32 | [accessors-mutators](./examples/32-accessors-mutators.ts) | `Attribute.make({ get, set })` |

---

## Database Support

| Database | Dialect package | Status |
|----------|----------------|--------|
| SQLite | `@libsql/kysely-libsql` + `@libsql/client` | ✅ Tested |
| PostgreSQL | `pg` | ✅ Tested via Docker |
| MySQL | `mysql2` | ✅ Tested via Docker |

```bash
docker compose up -d     # PostgreSQL 16 + MySQL 8.0
cd packages/orm
bun test test/integration/
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `INTEGRATION_PG_URL` | `postgres://postgres:postgres@localhost:5432/peta_orm_test` | PostgreSQL connection string |
| `INTEGRATION_MYSQL_URL` | `mysql://root:mysqlroot@localhost:3306/peta_orm_test` | MySQL connection string |
| `INTEGRATION_SKIP_PG` | — | Set to `1` to skip PostgreSQL integration tests |
| `INTEGRATION_SKIP_MYSQL` | — | Set to `1` to skip MySQL integration tests |

See [`.env.example`](./.env.example) for a copyable template.

---

## Related packages

- [peta-auth](../auth) — Encrypted cookie sessions, JWT, OAuth
- [peta-docs](../docs) — OpenAPI 3.1 spec generation + Scalar UI
- [peta-migrate](../migrate) — Standalone migration runner and generator
