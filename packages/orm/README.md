# Peta ORM

**Typed ORM for Bun, built on [Kysely](https://github.com/kysely-org/kysely)** with [ArkType](https://arktype.io) validation.

Column types, relations with eager loading, lifecycle hooks, timestamps, soft deletes, casting, serialization control, global scopes, polymorphic relations, and more — all fully typed end-to-end.

```ts
const user = await User.insert({ name: "Alice", email: "a@b.com" })
const posts = await user.$relatedQuery("posts").where("published", true).execute()
const page = await Post.query().with("author").paginate(1, 20)
```

---

## Quick Start

```bash
bun add peta-orm arktype kysely
bun add -d kysely-bun-sqlite
```

```ts
// db.ts
import { Database } from "bun:sqlite"
import { BunSqliteDialect } from "kysely-bun-sqlite"
import type { ColumnShape } from "peta-orm"
import { Peta, $t, ArkTypeSchemaConfig, Model, HasMany } from "peta-orm"

const t = $t({ schema: new ArkTypeSchemaConfig() })

class User extends Model {
  static override table = "users"
  static override columns = {
    id: t.integer().primaryKey(),
    name: t.string(255).min(2),
    email: t.text().email().unique(),
  } satisfies ColumnShape
  static override relations = {
    posts: new HasMany(() => Post),
  }
}

class Post extends Model {
  static override table = "posts"
  static override columns = {
    id: t.integer().primaryKey(),
    userId: t.integer().references(() => User, ["id"]),
    title: t.string(255),
  } satisfies ColumnShape
}

const database = new Database("my-app.db")
database.run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL)`)
database.run(`CREATE TABLE IF NOT EXISTS posts (id INTEGER PRIMARY KEY AUTOINCREMENT, userId INTEGER NOT NULL, title TEXT NOT NULL)`)

const peta = new Peta({ dialect: new BunSqliteDialect({ database }) })

// Explicit registration (rest params, no array wrapper)
peta.registerAll(User, Post)

// Or auto-discover from directory (Bun only):
// await peta.discover("./src/**/*.model.ts")

export { peta, User, Post }
```

---

## Why Peta ORM?

| Feature | Raw Kysely | Peta ORM |
|---------|-----------|----------|
| **Validation** | Manual | Automatic from column definitions via ArkType |
| **Models** | Row types only | Class instances with `$save()`, `$delete()`, `$reload()` |
| **Relations** | Manual JOINs | Declarative `HasMany`, `BelongsTo`, `HasOne`, `ManyToMany` |
| **Eager loading** | Manual batch | `.with("posts.author")` — one line, batched queries |
| **Hooks** | — | `beforeCreate`, `afterUpdate`, `beforeDelete`, etc. |
| **Soft deletes** | — | `withTrashed()`, `onlyTrashed()`, `$restore()`, `$forceDelete()` |
| **Casting** | — | `$casts: { meta: "json", flags: "boolean" }` |
| **Serialization** | — | `$hidden`, `$visible`, `$appends`, accessors |
| **Pagination** | Manual offset/limit | `.paginate(1, 20)` — returns `{ data, total, perPage, ... }` |
| **Transactions** | Manual | `Model.transaction(fn)` |
| **Error handling** | Raw driver codes | `DatabaseError` with `UNIQUE_CONSTRAINT` / `FOREIGN_KEY_CONSTRAINT` |
| **Conditional queries** | Manual if/else | `.when(condition, qb => ...)`, `.unless(condition, qb => ...)` |
| **Migrations** | — | Auto-generate from models, CLI, `MigrationRunner` |
| **Global scopes** | — | `addGlobalScope("active", qb => ...)` |

---

## Features

### Column Types & Validation

```ts
import type { ColumnShape } from "peta-orm"

const t = $t({ schema: new ArkTypeSchemaConfig() })

class User extends Model {
  static override columns = {
    id: t.integer().primaryKey(),
    name: t.string(255).min(2),          // min length
    email: t.text().email().unique(),    // email format + unique constraint
    age: t.integer().nullable().min(0).max(150).default(0),
    role: t.enum("admin", "user").default("user"),
    score: t.double().nullable(),
    ...t.timestamps(),                   // createdAt, updatedAt
  } satisfies ColumnShape
}

class Post extends Model {
  static override columns = {
    id: t.integer().primaryKey(),
    userId: t.integer().references(() => User, ["id"]),  // foreign key
    title: t.string(255),
    slug: t.string().unique(),
    published: t.boolean().default(false),
  } satisfies ColumnShape
}
```

### Relations & Eager Loading

```ts
class User extends Model {
  static override relations = {
    posts: new HasMany(() => Post, { foreignKey: "userId" }),
    profile: new HasOne(() => Profile, { foreignKey: "userId" }),
  }
}

// Eager load with dot notation
const users = await User.query()
  .with("posts")
  .with("posts.author")
  .with({ posts: (q) => q.where("published", true) })
  .execute()

// Lazy load after fetch
await user.$load("posts")
await collection.load("posts.author")

// Relation query
const posts = await user.$relatedQuery("posts").where("published", true).execute()

// Existence filters
const authors = await User.query().has("posts").execute()
const active = await User.query().whereHas("posts", (q) => q.where("published", true)).execute()
```

### ManyToMany

```ts
class Post extends Model {
  static override columns = { id: t.integer().primaryKey(), title: t.string(255) } satisfies ColumnShape
  static override relations = {
    tags: new ManyToMany(() => Tag, {
      through: "post_tags",
      foreignPivotKey: "postId",
      relatedPivotKey: "tagId",
    }),
  }
}

class Tag extends Model {
  static override columns = { id: t.integer().primaryKey(), name: t.string(255) } satisfies ColumnShape
}

// Pivot tables are regular Models — register them so the migration
// generator includes the pivot table automatically.
class PostTag extends Model {
  static override table = "post_tags"
  static override columns = {
    id: t.integer().primaryKey(),
    postId: t.integer().references(() => Post, ["id"]),
    tagId: t.integer().references(() => Tag, ["id"]),
  } satisfies ColumnShape
}
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
// → { data: Post[], total, perPage, currentPage, lastPage, hasMorePages }

// Query results are plain T[] — standard, zero overhead
const posts = await Post.query().where("published", true).execute()
// posts: Post[]
posts[0] // direct index access
```

### Hooks & Timestamps

```ts
class User extends Model {
  static {
    this.on("beforeCreate", (user) => { user.email = user.email.toLowerCase() })
    this.on("afterCreate", (user) => { console.log("Created:", user.get("id")) })
  }
}

User.registerTimestamps()  // auto-set createdAt/updatedAt
```

### Soft Deletes

```ts
User.registerSoftDeletes()

await user.$delete()         // sets deletedAt timestamp
await user.$restore()        // clears deletedAt
await user.$forceDelete()    // actually deletes

const active = await User.query().execute()                  // excludes deleted
const all = await User.query().withTrashed().execute()       // includes deleted
const trashed = await User.query().onlyTrashed().execute()   // only deleted
```

### Attribute Casting & Serialization

```ts
class User extends Model {
  static override $casts = {
    meta: "json",
    flags: "boolean",
    createdAt: "date",
  }
  static override $hidden = ["password"]
  static override $visible = ["id", "name", "email"]  // whitelist
  static override $appends = ["fullName"]

  getFullNameAttribute() { return `${this.get("first")} ${this.get("last")}` }
}

const json = user.$toJSON()  // password excluded, fullName appended, meta parsed
```

### Global Scopes & Transactions

```ts
User.addGlobalScope("active", (qb) => qb.where("active", "=", 1))

// Query without the scope
await User.query().withoutGlobalScope("active").execute()

// Transactions
await User.transaction(async (trx) => {
  await trx.insertInto("users").values({ name: "A" }).execute()
  await trx.insertInto("posts").values({ userId: 1, title: "B" }).execute()
})
```

### Conditional Chaining

```ts
const posts = await Post.query()
  .where("published", "=", published ?? 1)
  .when(sort?.length, (q) => {
    for (const s of sort) {
      q.orderBy(s.replace(/^-/, ""), s.startsWith("-") ? "desc" : "asc")
    }
    return q
  })
  .unless(sort?.length, (q) => q.orderBy("createdAt", "desc"))
  .execute()
```

Both `.when(condition, fn)` and `.unless(condition, fn)` return the query builder, keeping the chain intact. If the condition is truthy, `.when()` applies the callback; `.unless()` does the opposite.

### Error Handling

Database constraint violations (unique, foreign key) are normalized into a `DatabaseError` across SQLite, PostgreSQL, and MySQL:

```ts
import { DatabaseError } from "peta-orm"

try {
  const post = await Post.insert({ slug: "my-post", title: "..." })
} catch (e) {
  if (e instanceof DatabaseError && e.code === "UNIQUE_CONSTRAINT") {
    // slug already taken — return 400
    return c.json({ error: "Slug already taken" }, 400)
  }
  throw e
}
```

| `DatabaseError.code` | Meaning | Triggered by |
|---|---|---|
| `UNIQUE_CONSTRAINT` | Duplicate value on a unique column | `SQLITE_CONSTRAINT_UNIQUE`, PostgreSQL `23505`, MySQL `ER_DUP_ENTRY` |
| `FOREIGN_KEY_CONSTRAINT` | Referenced row doesn't exist | `SQLITE_CONSTRAINT_FOREIGNKEY`, PostgreSQL `23503`, MySQL `ER_NO_REFERENCED_ROW_2` |

The error also carries the `table` name and the original driver error via `cause`.

### Collection Utilities

```ts
// .execute() returns a plain array — lightweight, direct index access
const users = await User.query().execute()
users[0]    // direct access

// .collect() returns a Collection with convenience methods
const col = await User.query().orderBy("id", "asc").collect()
col.toJSON()            // all items serialized in one call
col.pluck("name")       // ["Alice", "Bob"]
col.groupBy("role")     // { admin: [...], user: [...] }
col.load("posts")       // eager load relations
col.sum("score")        // aggregate helpers
col.avg("age")
col.unique("role")
col.sortBy("name")
col.chunk(10)           // split into batches
col.first()             // first element
col.at(0)               // same as [0] on plain arrays
```

---

## Examples

All self-contained (inline SQLite, run directly):

```bash
bun run examples/01-basic-setup.ts
bun run examples/04-relations.ts
bun run examples/07-soft-deletes.ts

# CLI — manage migrations
bun run bin/peta --help
bun run bin/peta migrate:init
bun run bin/peta migrate:generate CreateUsers
bun run bin/peta migrate:up
bun run bin/peta migrate:status
```

| # | Example | Topic |
|---|---------|-------|
| 01 | [basic-setup](./examples/01-basic-setup.ts) | Peta init + SQLite setup |
| 02 | [model-definition](./examples/02-model-definition.ts) | Columns, types, modifiers, timestamps |
| 03 | [crud](./examples/03-crud.ts) | insert, find, update, delete, paginate |
| 04 | [relations](./examples/04-relations.ts) | HasMany, BelongsTo, HasOne, eager loading |
| 05 | [query-builder](./examples/05-query-builder.ts) | where, orderBy, join, has, whereHas, whereDoesntHave, count |
| 06 | [hooks-timestamps](./examples/06-hooks-timestamps.ts) | beforeCreate, afterCreate, registerTimestamps |
| 07 | [soft-deletes](./examples/07-soft-deletes.ts) | $delete, $restore, $forceDelete, withTrashed |
| 08 | [collection-paginator](./examples/08-collection-paginator.ts) | Collection, Paginator, `.collect()` |
| 09 | [hono-integration](./examples/09-hono-integration.ts) | Hono app + error handling with `DatabaseError` |
| 10 | [elysia-integration](./examples/10-elysia-integration.ts) | Elysia app stub |
| 11 | [many-to-many](./examples/11-many-to-many.ts) | ManyToMany via pivot table |
| 12 | [transactions](./examples/12-transactions.ts) | Model.transaction(), rollback |
| 13 | [casting](./examples/13-casting.ts) | $casts, $hidden, $appends, accessors |
| 14 | [global-scopes](./examples/14-global-scopes.ts) | addGlobalScope(), withoutGlobalScope() |
| 15 | [batch](./examples/15-batch.ts) | insertMany, insertMany() |
| 16 | [discover](./examples/16-discover.ts) | peta.discover(), rest params |
| 17 | [instance-methods](./examples/17-instance-methods.ts) | fill, dirty, reset, $reload, $load, $relatedQuery |
| 18 | [advanced-queries](./examples/18-advanced-queries.ts) | groupBy/having, sum/avg/min/max, chunk, toSQL, updateMany |
| 19 | [collections-deep](./examples/19-collections-deep.ts) | full Collection + Paginator API |
| 20 | [advanced-relations](./examples/20-advanced-relations.ts) | HasManyThrough, polymorphic morphs, pivot extras |
| 21 | [migrations](./examples/21-migrations.ts) | MigrationRunner, MigrationGenerator, CLI |
| 22 | [related-query-builder](./examples/22-related-query-builder.ts) | `$related()` — scoped query builder for relations |
| 23 | [attach-detach-sync](./examples/23-attach-detach-sync.ts) | Many-to-many pivot management via `$related()` |
| 24 | [computed-columns](./examples/24-computed-columns.ts) | Runtime + batch async computed columns |
| 25 | [static-hooks](./examples/25-static-hooks.ts) | `asFindQuery()` preview + `cancelQuery()` abort |
| 26 | [repository-pattern](./examples/26-repository-pattern.ts) | `createRepo()` — chainable custom query methods |
| 27 | [plugins-and-helpers](./examples/27-plugins-and-helpers.ts) | `.use()` plugin system + `makeHelper()` |
| 28 | [nested-create-update](./examples/28-nested-create-update.ts) | Create and update models with related data in a single call |
| 29 | [allow-graph](./examples/29-allow-graph.ts) | `allowGraph()` — recursive whitelist for eager loading |
| 30 | [polymorphic-relations](./examples/30-polymorphic-relations.ts) | Polymorphic MorphMany/MorphOne/MorphTo with runtime resolution |
| 31 | [graph-operations](./examples/31-graph-operations.ts) | `insertGraph()`/`upsertGraph()` with `#id`/`#ref` |
| 32 | [accessors-mutators](./examples/32-accessors-mutators.ts) | `Attribute.make({ get, set })` — accessors and mutators |

---

## API Overview

| Module | Key exports | File |
|--------|-------------|------|
| **Core** | `Peta`, `Model`, `$t`, `Collection` | `src/index.ts` |
| **Discovery** | `peta.discover(glob)`, `peta.registerAll(...models)` | `src/peta.ts` |
| **Columns** | `t.integer()`, `t.string()`, `t.email()`, `.min()`, `.max()`, `.nullable()`, `.default()` | `src/columns/column-types.ts` |
| **Builders** | `.where()`, `.with()`, `.paginate()`, `.chunk()`, `.sum()`, `.toSQL()`, `.when()`, `.unless()`, `.collect()` | `src/builder/query-builder.ts` |
| **Relations** | `HasMany`, `BelongsTo`, `HasOne`, `ManyToMany`, `HasManyThrough` | `src/relations/Relation.ts` |
| **Polymorphic** | `MorphTo`, `MorphMany`, `MorphOne` | `src/relations/Morph.ts` |
| **Hooks** | `HookManager`, `on()`, `off()`, `trigger()` | `src/hooks/lifecycle.ts` |
| **Paginator** | `Paginator`, `.paginate()` | `src/pagination/Paginator.ts` |
| **Errors** | `ModelNotFoundError`, `RelationNotFoundError`, `ValidationError`, `DatabaseError` | `src/errors/errors.ts` |
| **Migrations** | `MigrationRunner`, `MigrationGenerator`, `defineConfig`, CLI (`peta migrate:*`) | `src/migrations/index.ts` (import from `peta-orm/migrator`) |

---

## License

MIT
