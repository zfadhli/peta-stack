# Lessons from Orchid ORM for peta-orm

> **Date:** 2026-06-12
> **Source:** [Orchid ORM](https://github.com/romeerez/orchid-orm) — a PostgreSQL-only ORM with a custom TypeScript query builder
> **Purpose:** Identify patterns, features, and design decisions from Orchid ORM that could inspire improvements to peta-orm.

---

## Architecture Overview

Orchid ORM is a **PostgreSQL-only** ORM with a custom query builder (`pqb`) written from scratch in TypeScript. It uses a **data-mapper** pattern — records are plain objects, not class instances. It has 540⭐, 15 forks, and is built by a single primary maintainer with 1,918+ commits.

| Aspect | Orchid ORM | peta-orm |
|--------|-----------|----------|
| **Pattern** | Data Mapper (plain object results) | Factory-based (ModelInstance wrappers) |
| **Query Builder** | Custom `pqb` (inspired by Knex, written from scratch) | Kysely |
| **Database** | PostgreSQL only | SQLite, PostgreSQL, MySQL (via Kysely) |
| **Validation** | Schema → Zod/Valibot (optional) | ArkType (built-in) |
| **Relations** | Config object on table class | Config object on `defineModel()` |
| **Hooks** | `init()` lifecycle + query-level hooks | `on()` lifecycle events |
| **TypeScript** | 100% — schema-driven type inference | 100% — strict mode |
| **Stars** | 540⭐ | Internal |

---

## High-Impact Additions

### 1. Nested Relation Selection (Relation Select Callbacks)

**Orchid ORM approach:**
Select related data as nested objects using callbacks directly inside `.select()`. This is the single most powerful feature — it eliminates N+1 while keeping types fully inferred:

```ts
const post = await db.post
  .find(123)
  .select('title', 'body', {
    // belongsTo → single object
    author: (q) => q.author.select('name', 'email'),

    // hasMany → array of objects
    comments: (q) =>
      q.comments
        .order({ createdAt: 'DESC' })
        .limit(50)
        .select('body', {
          // nested relation inside relation
          commenter: (q) => q.commenter.select('avatar', 'username'),
        }),

    // Aggregates inside select
    likesCount: (q) => q.likes.count(),
    tagsCommaSeparated: (q) => q.tags.stringAgg('name', ', '),
  })
  // Can filter and order by selected aggregates
  .where({ likesCount: { gt: 100 } })
  .order({ likesCount: 'DESC' });

// Fully typed result:
// { title: string; body: string; author: { name: string; email: string };
//   comments: { body: string; commenter: { avatar: string; username: string } }[];
//   likesCount: number; tagsCommaSeparated: string; }
```

Key behaviors:
- `belongsTo` / `hasOne` → single object or `null`
- `hasMany` / `hasAndBelongsToMany` → array
- Aggregate results (`count()`, `sum()`, etc.) → scalar values
- `exists()` → boolean
- `pluck('col')` → flat array
- Selected relations are usable in `where` and `order` after selection

**peta-orm gap:**
Eager loading via `.with()` loads relations as separate properties but cannot mix aggregates, computed values, and nested relations in a single `select` call with full type inference.

**Recommendation:**
Allow callback-based relation selection inside `.select()`:

```ts
const posts = await Post.query()
  .select('id', 'title', {
    author: (q) => q.select('name'),
    comments: (q) => q.select('body').limit(5),
    tagsCount: (q) => q.count(),
  })
  .execute();
```

---

### 2. Relation `chain()` — Cross-Relation Querying

**Orchid ORM approach:**
"Chain" from one table to a related table, switching the query context entirely:

```ts
// Load an author by book id — single query
const author = await db.book.find(1).chain('author');

// Load awards for an author by book id — single query
const awards = await db.book.find(1).chain('author').chain('awards');

// Filter both books and authors, load authors in one query
const filteredAuthors = await db.book
  .where({ booksCondition: '...' })
  .chain('author')
  .where({ authorCondition: '...' });

// Load book reviews for an author — single query
const reviews = await db.author
  .findBy({ name: '...' })
  .chain('books')
  .chain('reviews');

// chain in select — de-duplicates via PK
db.order.select({
  chainedIngredients: (q) =>
    q.pizzas.order('hasPineapples').chain('ingredients').limit(10),
});
```

This is fundamentally different from a JOIN — `chain()` uses subqueries internally and deduplicates by primary key (unlike JOIN which can produce duplicates).

**peta-orm gap:**
No way to "switch" a query to a relation's context. Querying related data requires either `.with()` (eager load) or manual subqueries.

**Recommendation:**
Add `chain(name)` to QueryBuilder. When called, it performs a subquery to collect FK values from the parent context, then switches the query to the related table's query builder, filtering by those values. Deduplicate by primary key.

---

### 3. Nested Create / Update / Delete Through Relations

**Orchid ORM approach:**
Create, update, connect, disconnect, set, add, and delete related records through a single query chain, auto-managing FKs and pivot tables:

```ts
// Create a book with a new author (auto-sets authorId)
const book = await db.book.create({
  title: 'Book title',
  author: {
    create: { name: 'Author' },
  },
});

// Create an author with multiple books
const author = await db.author.create({
  name: 'Author',
  books: {
    create: [{ title: 'Book 1' }, { title: 'Book 2' }],
  },
});

// Connect existing records
const book = await db.book.create({
  title: 'Book title',
  author: {
    connect: { name: 'Author' },
  },
});

// Connect or create
const result = await db.book.create({
  author: {
    connectOrCreate: {
      where: { name: 'Author' },
      create: { name: 'Author' },
    },
  },
});

// Update with relation operations
await db.book.find(1).update({
  title: 'updated',
  author: {
    // Update related
    update: { name: 'new name' },
    // Upsert related
    upsert: { update: { name: 'new' }, create: { name: 'new', email: '...' } },
    // Disconnect
    disconnect: true,
    // Set (disconnect old, connect new)
    set: { name: 'new author' },
  },
  // For hasMany / hasAndBelongsToMany
  tags: {
    create: [{ name: 'new tag' }],
    update: { where: { name: 'old' }, data: { name: 'new' } },
    delete: { name: 'obsolete tag' },
    connect: [{ id: 1 }, { id: 2 }],
    disconnect: [{ id: 3 }],
    set: [{ id: 1 }, { id: 2 }],       // replace all
    add: [{ id: 3 }],                    // add without removing
  },
});
```

**peta-orm gap:**
No nested CRUD through relations. Creating a book with an author requires: create author, get ID, create book with authorId. Updating with relation operations requires manual multi-step orchestration.

**Recommendation:**
This is a large feature but has outsized impact. Support nested `create`, `update`, `connect`, `disconnect`, `set`, `add`, `delete` in the `create()` and `update()` methods. Use the relation definitions to determine FK columns and pivot tables. Execute in a transaction.

---

### 4. Computed Columns (SQL + JS Runtime)

**Orchid ORM approach:**
Two types of computed columns that act like real columns in selects:

**SQL computed** — inlines SQL into SELECT:
```ts
class UserTable extends BaseTable {
  columns = this.setColumns((t) => ({
    id: t.identity().primaryKey(),
    firstName: t.string(),
    lastName: t.string(),
  }));

  computed = this.setComputed((q) => ({
    fullName: sql`${q.column('firstName')} || ' ' || ${q.column('lastName')}`
      .type((t) => t.string()),
    randomized: sql(() => sql`${Math.random()}`).type((t) => t.string()),
  }));
}

// Usage — they're selectable, filterable, orderable
db.user.select('*', 'fullName').where({ fullName: { startsWith: 'A' } });
```

**JS runtime computed** — computes after query:
```ts
computed = this.setComputed((q) => ({
  fullName: q.computeAtRuntime(
    ['firstName', 'lastName'],
    (record) => `${record.firstName} ${record.lastName}`,
  ),
}));
```

**Batch async computed** — batch-fetch external data:
```ts
computed = this.setComputed((q) => ({
  weather: q.computeBatchAtRuntime(
    ['country', 'city'],
    async (users) => {
      const data = await fetchWeatherData(users.map(u => u.city));
      return users.map(u => data.find(d => d.city === u.city)?.weatherInfo);
    },
  ),
}));
```

**peta-orm gap:**
No computed columns. Virtual attributes/accessors exist but must be called explicitly. No SQL-level computed columns, no batch async computed pattern.

**Recommendation:**
Add a `computed` config to `ModelDefinition` with:
- `sql` — raw SQL expression that gets inlined into SELECT
- `js` — post-query transform using loaded column values
- `batchAsync` — batch transform for external API calls (e.g., fetch weather for all loaded records)

---

### 5. Repository Pattern with Chainable Methods

**Orchid ORM approach:**
Decompose complex queries into reusable chainable methods via `createRepo`:

```ts
import { createRepo } from 'orchid-orm';

export const userRepo = createRepo(db.user, {
  queryMethods: {
    // q is the query chain, additional params are user-defined
    selectForList(q, currentUser: User) {
      return q.select('id', 'firstName', 'lastName', 'picture', {
        followed: (q) => followRepo(q.followers).isFollowedBy(currentUser),
      });
    },
    search(q, query: string) {
      return q.or(
        { firstName: { contains: query } },
        { lastName: { contains: query } },
      );
    },
  },
  queryOneMethods: {
    // Only available when querying a single record
    publish(q) {
      return q.update({ status: 'published', publishedAt: new Date() });
    },
  },
  queryWithWhereMethods: {
    // Only available when query has WHERE
    softDelete(q) {
      return q.update({ deletedAt: new Date() });
    },
  },
});

// Usage — methods are chainable and type-safe
const users = await userRepo
  .selectForList(currentUser)
  .search(query)
  .order({ createdAt: 'DESC' })
  .limit(20);
```

Different method kinds enforce query state:
- `queryMethods` — any query
- `queryOneMethods` — single-record query only (has `find`, `take`, etc.)
- `queryWithWhereMethods` — has `where` (safe for delete)
- `queryOneWithWhereMethods` — single + where (safe for update with nested create)

**peta-orm gap:**
No repository abstraction. Complex queries are inline or extracted as standalone functions with no chainable API or state-aware method kinds.

**Recommendation:**
Add a `createRepository(model, { queryMethods, queryOneMethods, ... })` API. Methods receive the query builder as the first argument and return a modified query builder. Enforce method availability based on query state (e.g., `delete` requires WHERE).

---

### 6. Lifecycle Hooks with Column Requirements + After-Commit

**Orchid ORM approach:**
Four levels of hooks: before, after (with required columns), after-commit, and query-level:

```ts
class SomeTable extends BaseTable {
  init(orm: typeof db) {
    // Before hooks can set values
    this.beforeCreate(({ set, columns }) => {
      set({ createdAt: new Date() });
      if (columns.includes('foo')) set({ bar: 'default' });
    });

    // After hooks require specific columns — guarantees they're selected
    this.afterCreate(['id', 'email'], async (records, query) => {
      for (const record of records) {
        await sendWelcomeEmail(record.email);
      }
    });

    // After-commit — runs after transaction commits
    this.afterCreateCommit(['id'], (records, query) => {
      // Safe for side effects like message queues
      queue.send({ type: 'user_created', userId: records[0].id });
    });
  }
}

// Query-level hooks — per-query only
await db.table
  .beforeCreate(() => console.log('before this create'))
  .afterCreateCommit(['id'], (data) => console.log('committed'))
  .create(data);
```

**peta-orm gap:**
Instance-level hooks only. No after hooks with column selection guarantees, no after-commit hooks, no query-level hooks.

**Recommendation:**
Add after-hooks that specify required columns (guarantees those columns are selected from the DB after the mutation). Add after-commit hooks that fire after the transaction commits (safe for side-effects). Add per-query hook registration via `.beforeCreate(cb)` / `.afterCreate(cols, cb)` on the query builder.

---

### 7. Scopes with Default Scope + `unscope()`

**Orchid ORM approach:**
Named scopes defined declaratively with optional `default` scope applied to all queries:

```ts
class SomeTable extends BaseTable {
  scopes = this.setScopes({
    // Applied to ALL queries by default
    default: (q) => q.where({ hidden: false }),
    active: (q) => q.where({ active: true }),
  });
}

// Scope is automatically applied
const visible = await db.someTable; // WHERE hidden = false

// Apply additional scopes
await db.someTable.scope('active'); // WHERE hidden = false AND active = true

// Remove default scope
await db.someTable.unscope('default'); // No hidden filter
```

**peta-orm gap:**
Global scopes exist (via `addGlobalScope`) but no local named scopes, no `default` scope concept, no `unscope()`.

**Recommendation:**
Support named scopes with `default` scope applied to all queries. Add `scope(name)` and `unscope(name)` methods to the query builder.

---

### 8. Mutation Safety Guards

**Orchid ORM approach:**
Update and delete operations require an explicit WHERE condition or `.all()` to prevent accidental mass operations:

```ts
await db.table.where({}).delete();       // THROWS — empty condition
await db.table.where({ id: undefined }).delete(); // THROWS — undefined value
await db.table.where({ id: 1 }).delete(); // OK — explicit condition
await db.table.all().delete();            // OK — explicit intent
```

**peta-orm gap:**
No mutation safety guards. `deleteMany()` on an empty query builder would delete all records.

**Recommendation:**
Add mutation safety: require `.all()` or at least one non-empty WHERE condition before executing update/delete on multiple records. Throw with a clear error message otherwise.

---

## Medium-Impact Improvements

### 9. `connectOrCreate` / `orCreate` / `upsert` Patterns

**Orchid ORM approach:**
Multiple find-or-create and upsert variants, including relation-aware ones:

```ts
// Standalone
const user = await db.user.orCreate(
  { email: 'test@test.com' },
  { name: 'Test', email: 'test@test.com' },
);

// Relation-aware
await db.book.create({
  author: {
    connectOrCreate: {
      where: { name: 'Author' },
      create: { name: 'Author' },
    },
  },
});

// Upsert in relation
await db.book.find(1).update({
  author: {
    upsert: {
      update: { name: 'new name' },
      create: { name: 'new name', email: '...' },
    },
  },
});
```

**peta-orm gap:**
No `connectOrCreate`, `orCreate`, or relation-aware upsert.

---

### 10. `transform` / `map` Post-Query Transformations

**Orchid ORM approach:**
Two methods for transforming query results before returning:

```ts
// map — transforms each record individually
const posts = await db.post.limit(10).map((post) => ({
  ...post,
  titleLength: post.title.length,
}));

// transform — transforms the full result (cursor pagination, null handling)
const result = await db.post
  .select('id', 'text')
  .order({ id: 'DESC' })
  .limit(100)
  .transform((nodes) => ({ nodes, cursor: nodes.at(-1)?.id }));

// Handle null aggregate
const sum = await db.order.sum('amount').transform((sum) => sum ?? 0);
```

**peta-orm gap:**
No `map` or `transform` on query builder. Results must be transformed after execution.

---

### 11. `makeHelper` / `useHelper` — Reusable Query Helpers

**Orchid ORM approach:**
Define reusable partial queries that can be composed into any query:

```ts
// Define a helper
const defaultAuthorSelect = db.author.makeHelper((q) => {
  return q.select('firstName', 'lastName');
});

// Use standalone
const result = await defaultAuthorSelect(db.author.select('id').find(1));

// Use in relation select
await db.book.select({
  author: (book) => defaultAuthorSelect(book.author),
});

// With parameters
const selectFollowing = db.user.makeHelper(
  (q, currentUser: { id: number }) => {
    return q.select({
      following: (q) => q.followers.where({ followerId: currentUser.id }).exists(),
    });
  },
);
```

**peta-orm gap:**
No composable query helper abstraction.

---

### 12. `orderByPivot` / `wherePivot` for Many-to-Many

**Orchid ORM approach:**
Filter and order many-to-many queries by pivot table columns:

```ts
class PostTable extends BaseTable {
  relations = {
    tags: this.hasAndBelongsToMany(() => TagTable, {
      columns: ['id'],
      references: ['postId'],
      through: {
        table: 'postTag',
        columns: ['tagId'],
        references: ['id'],
      },
    }),
  };
}

// Usage in queries
db.post.select({
  tags: (q) =>
    q.tags
      .wherePivot('approved', true)
      .orderByPivot('createdAt', 'DESC'),
});
```

**peta-orm gap:**
Has `pivotExtras` but no `wherePivot` or `orderByPivot` query methods.

---

### 13. Row-Level Security (RLS) Support

**Orchid ORM approach:**
First-class support for PostgreSQL Row-Level Security:

```ts
// Wrap requests with user context
await db.$withOptions(
  {
    role: 'app_user',
    setConfig: {
      'app.tenant_id': tenantId,
      'app.user_id': userId,
    },
  },
  async () => {
    // All queries in this scope use the role and config
    const project = await db.project.find(projectId);
    return project;
  },
);
```

This sets the PostgreSQL role and custom config for the duration of the callback. RLS policies can reference `current_setting('app.tenant_id')`.

**peta-orm gap:**
No RLS support. Would require connection-level SET statements.

---

### 14. Full-Text Search / JSON / Window Functions

**Orchid ORM approach:**
First-class query builder methods for advanced PostgreSQL features:

```ts
// Full-text search
await db.article.where(
  sql`to_tsvector('english', title) @@ to_tsquery('english', ${query})`,
);

// JSON functions
await db.table.select({
  data: (q) => q.json('metadata').key('settings').path('theme'),
});

// Window functions
await db.table.select(
  sql`row_number() OVER (ORDER BY score DESC)`.type((t) => t.integer()),
);
```

**peta-orm gap:**
No dedicated JSON or window function support (rely on Kysely's raw SQL).

---

### 15. Auto Foreign Keys from Relation Definitions

**Orchid ORM approach:**
When `autoForeignKeys: true` is set on `BaseTable`, migration generation automatically creates foreign key constraints based on relation definitions:

```ts
const BaseTable = createBaseTable({
  autoForeignKeys: {
    onUpdate: 'CASCADE',
    onDelete: 'CASCADE',
  },
});
```

This can be overridden per table or per relation.

**peta-orm gap:**
Migration generation exists but doesn't auto-generate FKs from relations.

---

### 16. Snake_case Auto-Translation

**Orchid ORM approach:**
Global `snakeCase: true` option auto-translates camelCase column/table names to snake_case in SQL:

```ts
const BaseTable = createBaseTable({
  snakeCase: true,
});

class Table extends BaseTable {
  readonly table = 'my_table'; // explicitly snake_case
  columns = this.setColumns((t) => ({
    id: t.identity().primaryKey(),
    myColumn: t.string(), // → "my_column" in SQL
  }));
}
```

Per-column override via `.name()`:
```ts
myColumn: t.name('custom_name').string(),
```

**peta-orm gap:**
No snake_case auto-translation. Must define all column names in their raw DB form.

---

### 17. `findBy` with Unique Constraints

**Orchid ORM approach:**
`findBy` accepts only unique column combinations (primary keys, unique constraints, compound unique constraints). TypeScript enforces valid combinations:

```ts
// TypeScript knows which columns form unique constraints
await db.user.findBy({ email: 'test@test.com' }); // OK — email is unique
// await db.user.findBy({ name: 'John' });         // TS error — name is not unique
```

**peta-orm gap:**
No unique constraint awareness. `find` works by primary key, but there's no type-safe `findBy` that only accepts unique column combinations.

---

### 18. `none()` — No-Op Query

**Orchid ORM approach:**
Resolve a query to empty results without executing SQL:

```ts
// Returns empty array without DB query
await db.table.where({ complex: 'condition' }).none(); // → []

// Returns undefined
await db.table.findOptional(123).none(); // → undefined

// Used in sub-selects
await db.user.select({
  pets: (q) => q.pets.none(), // → []
  hasPets: (q) => q.pets.none().exists(), // → false
});
```

**peta-orm gap:**
No query-level no-op. Must conditionally skip the query entirely.

---

### 19. `narrowType()` for Safe Type Narrowing

**Orchid ORM approach:**
Narrow a column's type after applying a filter that guarantees a specific value:

```ts
const rows = db.table
  .where({ nullableColumn: { not: null } })
  .narrowType()<{ nullableColumn: string }>();

rows[0].nullableColumn; // string (was string | null)
```

**peta-orm gap:**
No way to narrow types after filtering without `as` casts.

---

## Lower-Impact Improvements

### 20. `map` / `transform` Nested in Relation Selects
Both `map` and `transform` work inside relation select callbacks, enabling nested cursor pagination patterns.

### 21. `$query` Raw Query Helper with Tagged Templates
```ts
const result = await db.$query<{ one: number }>`SELECT ${value} AS one`;
const array = await db.$query.records<T>`SELECT * FROM table`;
const one = await db.$query.take<T>`SELECT * FROM table LIMIT 1`;
const value = await db.$query.get<number>`SELECT 1`;
const plucked = await db.$query.pluck<string>`SELECT name FROM table`;
```

### 22. `modify()` for Conditional Query Building
```ts
const result = await db.table
  .select('id')
  .modify((q) => (includeName ? q.select('name') : q))
  .modify((q) => (filterByAge ? q.where({ age: { gt: 18 } }) : q));
```

### 23. `merge()` for Combining Queries
```ts
const query1 = db.table.select('id').where({ id: 1 });
const query2 = db.table.select('name').where({ name: 'name' });
const result = await query1.merge(query2).take();
```

### 24. `mutating methods prefixed with _`
Every query method has a mutating pair starting with `_` (e.g., `_where`) that modifies the query builder in place instead of returning a new one.

### 25. `clear(operator)` for Resetting Query Parts
```ts
db.table.select('id', 'name').clear('select'); // clears SELECT, defaults back to *
```

### 26. `truncate()` with Options
```ts
await db.table.truncate({ restartIdentity: true, cascade: true });
```

---

## Summary: Prioritization Matrix

| # | Feature | Effort | Impact | Urgency |
|---|---------|--------|--------|---------|
| 1 | **Nested relation select callbacks** | Medium | 🔥 High | 🔴 High |
| 2 | **Relation `chain()`** | Medium | 🔥 High | 🔴 High |
| 3 | **Nested create/update/delete through relations** | Large | 🔥 High | 🔴 High |
| 4 | **Computed columns (SQL + JS)** | Medium | High | 🔴 High |
| 5 | **Repository pattern with chainable methods** | Medium | High | 🟡 Medium |
| 6 | **Lifecycle hooks with column requirements** | Medium | High | 🟡 Medium |
| 7 | **Mutation safety guards** | Small | High | 🟡 Medium |
| 8 | **Scopes with default + unscope** | Small | Medium | 🟡 Medium |
| 9 | **`connectOrCreate` / `orCreate` / `upsert`** | Medium | Medium | 🟡 Medium |
| 10 | **`transform` / `map` post-query** | Small | Medium | 🟡 Medium |
| 11 | **`makeHelper` / `useHelper`** | Medium | Medium | 🟡 Medium |
| 12 | **`wherePivot` / `orderByPivot`** | Small | Medium | 🟢 Low |
| 13 | **RLS support** | Medium | Medium | 🟢 Low |
| 14 | **Auto foreign keys from relations** | Medium | Medium | 🟢 Low |
| 15 | **Snake_case auto-translation** | Medium | Medium | 🟢 Low |
| 16 | **`findBy` with unique constraints** | Medium | Medium | 🟢 Low |
| 17 | **`none()` no-op query** | Small | Low | 🟢 Low |
| 18 | **`narrowType()`** | Small | Low | 🟢 Low |
| 19 | **`modify()` conditional query building** | Small | Low | 🟢 Low |
| 20 | **`merge()` query combination** | Small | Low | 🟢 Low |

---

## Cross-Cutting Patterns: Objection.js vs Sutando.js vs Orchid ORM

| Feature | Objection.js | Sutando.js | Orchid ORM |
|---------|-------------|------------|------------|
| **Pattern** | Active Record (class) | Active Record (class) | Data Mapper (plain objects) |
| **DB Support** | SQLite, PG, MySQL, etc. | SQLite, PG, MySQL, etc. | PostgreSQL only |
| **Query Builder** | Knex | Knex | Custom `pqb` |
| **Graph inserts** | `insertGraph` — full graph | `push()` — recursive save | Nested `create` with relations |
| **Eager loading** | `withGraphFetched` | `with()` | `select({ rel: (q) => ... })` |
| **Relation queries** | `$relatedQuery('pets')` | `related('pets')` | `chain('relation')` |
| **Aggregate loading** | Via subqueries | `withCount`, `withSum` | Inline in `select` |
| **Computed columns** | ❌ | ❌ | ✅ SQL + JS runtime + batch |
| **Repository pattern** | Custom QB subclass | ❌ | `createRepo()` with method kinds |
| **Hooks** | Instance + Static (`asFindQuery`) | Instance (`booted()`) | Before + After (with columns) + After-commit |
| **Scopes** | `modifiers` | `scope{Name}` methods | Declarative with `default` + `unscope` |
| **Validation** | JSON Schema (Ajv) | ❌ built-in | Schema → Zod/Valibot |
| **Plugin system** | `compose(Plugin)(Model)` | `compose(Model, Plugin)` | ❌ |
| **Mutation safety** | ❌ | ❌ | ✅ Guards against accidental mass ops |
| **`thenable` QB** | ✅ | ✅ | ❌ (must await terminal methods) |

---

## Key Design Philosophy Takeaways

1. **Plain objects over class instances** — Orchid ORM returns plain objects from queries. This eschews Active Record magic (no `save()`, `delete()` on instances) but makes results predictable, serializable, and free of prototype overhead. You query with functions, not methods.

2. **Relations are selectable, not just loadable** — The single biggest insight: treat relation loading as a dimension of `.select()`, not a separate `.with()`. This makes the query API consistent (you select columns and relations the same way), enables aggregate mixing, and keeps types perfect.

3. **Query composition over configuration** — `makeHelper`, `modify`, `merge`, and `createRepo` all serve the same goal: building complex queries by composing simple, reusable pieces. This avoids the "one giant query method" problem.

4. **Mutation safety is a UX feature** — Requiring explicit `.all()` or WHERE conditions before delete/update prevents the most common production incident (accidental mass update/delete). It's a small DX friction that prevents catastrophic mistakes.

5. **Hooks should be declarative about data needs** — `afterCreate(['id', 'email'], cb)` makes the data contract explicit: the hook tells the ORM what columns it needs, and the ORM guarantees they're selected. No guessing whether `email` is available.

6. **Computed columns close the gap between DB and app** — SQL computed columns inline database expressions into SELECT. JS computed columns transform results post-query. Batch async computed columns batch-fetch external data. Together they eliminate the need for separate mapping layers.

7. **PostgreSQL-only is a valid trade-off** — By focusing on a single database, Orchid ORM can offer deep PostgreSQL features (RLS, full-text search, window functions, JSONB operators) that multi-dialect ORMs can't. peta-orm's Kysely base already gives it multi-dialect support, but Orchid shows the value of dialect-specific depth.

8. **`chain()` is a superior alternative to JOINs for relations** — JOINs produce duplicate rows for `hasMany`. `chain()` uses subqueries internally, deduplicates by PK, and supports `order`, `limit`, `offset` correctly. This is a pattern worth adopting for relation-following queries.

---

*Generated from analysis of Orchid ORM v4.x documentation and source code (pqb + orchid-orm packages).*
