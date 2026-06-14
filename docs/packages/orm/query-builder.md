# Query Builder Internals

The query builder is the core of peta-orm's query interface. It wraps Kysely's query builder and adds ORM-level features.

## Architecture

```
QueryBuilder (public API)
  └─► runExecute() (internal)
        ├─► applyScopes()     ── global scopes
        ├─► filter computed   ── strip computed columns from SQL
        ├─► qb.select()       ── column selection
        ├─► Kysely.execute()  ── run SQL
        ├─► def.hydrate()     ── create model instances
        ├─► computed columns  ── apply post-query
        └─► eager loading     ── load relations
```

## Conditional Chaining

### `.when(condition, fn)`

Applies the callback only when the condition is truthy:

```ts
const posts = await Post.query()
  .when(authorId, (qb) => qb.where("authorId", "=", authorId))
  .execute()
```

### `.unless(condition, fn)`

Applies the callback only when the condition is falsy:

```ts
const posts = await Post.query()
  .unless(sortField, (qb) => qb.orderBy("createdAt", "desc"))
  .execute()
```

Both methods return the `QueryBuilder`, keeping the chain intact. Internally they are equivalent to:

```ts
if (condition) fn(qb)
return self
```

## Pagination

```ts
const result = await Post.query()
  .orderBy("id", "asc")
  .paginate(1, 20)
```

Internally, `paginate()`:

1. Strips `ORDER BY` from the query (required by PostgreSQL for aggregate queries)
2. Executes `SELECT count(*) FROM ... WHERE ...` for the total count
3. Executes the data query with `LIMIT 20 OFFSET 0`
4. Returns `{ data, total, perPage, currentPage, lastPage, hasMorePages }`

## Computed Columns

Computed columns are **not SQL expressions** — they are JavaScript functions that run after the query:

```ts
setComputedConfig(User, {
  fullName: computeAtRuntime(["firstName", "lastName"], (record) =>
    `${record.get("firstName")} ${record.get("lastName")}`
  ),
})

// You can still select them, but they're filtered from the SQL
const users = await User.query().select("firstName", "fullName").execute()
// SQL: SELECT first_name FROM users
// JS:  fullName is computed from firstName
```

Two types:

| Type | Execution | Use Case |
|------|-----------|----------|
| `computeAtRuntime` | Per-record, synchronous | Simple derived values |
| `computeBatchAtRuntime` | Batch, async | Database lookups, API calls |

## Raw Queries

Access the underlying Kysely builder for operations the ORM doesn't wrap:

```ts
import { sql } from "kysely"

// Use `toSQL()` to inspect the generated query
const { sql: query, parameters } = Post.query()
  .where("published", "=", true)
  .toSQL()

// Access Kysely directly via the ORM instance
const result = await sql`SELECT count(*) FROM posts`.execute(orm.kysely)
```

## Performance Tips

1. **Use `.select()` to limit columns** — Only fetch the columns you need, especially on tables with many columns or large text/json fields.

2. **Use `.first()` instead of `.execute().then(r => r[0])`** — Adds `LIMIT 1` at the query level.

3. **Eager load strategically** — `.with("posts.author")` batches the relation queries. Avoid N+1 by eager loading in collections.

4. **Use `paginate()` for offset-based pagination** — Returns total count in the same call, avoiding a separate count query.

5. **Batch large inserts** — `insertMany()` batches records more efficiently than individual `insert()` calls.

6. **Use `.collect()` only when needed** — `execute()` returns a plain array (lighter). `collect()` returns a Collection with convenience methods.

## Query Builder Extension Points

### Custom Query Methods via `makeHelper`

The repository pattern lets you add custom query methods:

```ts
const UserRepo = createRepo(User)

const searchByName = UserRepo.makeHelper((qb: QueryBuilder, query: string) => {
  return qb.where("name", "like", `%${query}%`)
})

const users = await searchByName("Alice").execute()
```

### Raw Kysely Access

For operations the ORM doesn't wrap, access the underlying Kysely instance:

```ts
const result = await orm.kysely
  .selectFrom("posts")
  .selectAll()
  .where("id", "in", [1, 2, 3])
  .execute()
```
