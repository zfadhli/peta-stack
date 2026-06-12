# Lessons from Sutando.js for peta-orm

> **Date:** 2026-06-12
> **Source:** [Sutando.js](https://github.com/sutandojs/sutando) — a modern Node.js ORM heavily inspired by Laravel Eloquent
> **Purpose:** Identify patterns, features, and design decisions from Sutando.js that could inspire improvements to peta-orm.

---

## Architecture Overview

Sutando.js is essentially a port of **Laravel Eloquent** to Node.js, built on Knex.js. It uses class-based Active Record models and follows Eloquent's conventions closely.

| Aspect | Sutando.js | peta-orm |
|--------|-----------|----------|
| **Pattern** | Class-based Active Record (`class User extends Model`) | Factory-based (`defineModel()`) |
| **Query Builder** | Knex.js | Kysely |
| **Relations** | Instance methods (`relationPosts()`) | Config object (`relations: { ... }`) |
| **Plugin System** | `compose(Model, SoftDeletes)` — class mixins | Hooks only |
| **Validation** | None built-in | ArkType-based column schemas |
| **Serialization** | `hidden`/`visible`/`appends` properties on class | Same, via `ModelConfig` |
| **Hooks** | Instance hooks via `booted()` + static registration | Instance lifecycle events via `on()` |
| **Stars** | 301⭐ | Internal |

---

## High-Impact Additions

### 1. Relation Query Builder — `related('name')`

**Sutando approach:**
Every relation definition doubles as a query builder. Call `related('name')` on a model instance to get a query builder scoped to that relation:

```js
// Query through a relation with full builder support
const comment = await user.related('posts')
  .where('active', 1)
  .orderBy('created_at', 'desc')
  .first();

// Insert through a relation
await user.related('comments').save(comment);

// Create through a relation
const comment = await post.related('comments').create({
  message: 'A new comment.'
});

// Create multiple
await post.related('comments').createMany([
  { message: 'First' },
  { message: 'Second' },
]);
```

This is possible because Sutando relations are **methods**, not static config — they return a `Relation` instance that extends the query builder.

**peta-orm gap:**
Only `$load()` for lazy-reading relations. No way to query, insert, or create through a relation. Users must manually query the related model's table and add FK constraints.

**Recommendation:**
Add `$related(name)` to `ModelInstance` that returns a QueryBuilder pre-joined to the relation's foreign key. This opens up querying, inserting, and updating through relations.

---

### 2. Attach / Detach / Sync for Many-to-Many

**Sutando approach:**
Full pivot table management via the relation query builder:

```js
// Attach a role with pivot data
await user.related('roles').attach(roleId, { expires: expires });

// Detach specific roles
await user.related('roles').detach([1, 2, 3]);

// Detach all
await user.related('roles').detach();

// Sync — replace all with given IDs
await user.related('roles').sync([1, 2, 3]);

// Sync with pivot data per ID
await user.related('roles').sync({ 1: { expires: true }, 2: {} });

// Sync without detaching missing IDs
await user.related('roles').syncWithoutDetaching([1, 2, 3]);

// Sync with uniform pivot data
await user.related('roles').syncWithPivotValues([1, 2, 3], { active: true });

// Update a single pivot row
await user.related('roles').updateExistingPivot(roleId, { active: false });
```

**peta-orm gap:**
No many-to-many management API at all. Users must manually insert/delete rows in the pivot table.

**Recommendation:**
Add `attach`, `detach`, `sync`, `syncWithoutDetaching`, and `updateExistingPivot` methods accessible through `$related('roles')`. These should handle the pivot table operations automatically based on the relation definition.

---

### 3. Aggregate Loading — `withCount` / `loadCount`

**Sutando approach:**
Load aggregate values (count, sum, avg, min, max) for relations without loading the related models:

```js
// Query-time
const posts = await Post.query().withCount('comments').get();
console.log(posts[0].comments_count);

// Multiple relations
const posts = await Post.query().withCount({
  comments: query => query.where('content', 'like', 'code%'),
}).get();

// Other aggregates
const posts = await Post.query()
  .withSum('comments', 'votes')
  .withAvg('reviews', 'rating')
  .withMin('prices', 'amount')
  .withMax('prices', 'amount')
  .withExists('comments')
  .get();

// Deferred (after model is already loaded)
await post.loadCount('comments');
await post.loadSum('comments', 'votes');
await post.loadAvg('reviews', 'rating');
```

The loaded aggregates are available as `{relation}_{function}_{column}` attributes on the model.

**peta-orm gap:**
No aggregate loading. Getting a count of related items requires either a separate query or loading all related models and counting in JS.

**Recommendation:**
Add `withCount`, `withSum`, `withAvg`, `withMin`, `withMax`, `withExists` to the QueryBuilder, plus deferred `loadCount`, `loadSum`, etc. on ModelInstance and Collection.

---

### 4. `firstOrCreate` / `updateOrCreate` / `firstOrNew`

**Sutando approach:**
Find-or-create patterns that combine a lookup with conditional insert:

```js
// Find by name, or create with additional attributes
const flight = await Flight.query().firstOrCreate(
  { name: 'London to Paris' },
  { delayed: 1, arrival_time: '11:30' }
);

// Same but don't persist — just return a new instance
const flight = await Flight.query().firstOrNew(
  { name: 'Tokyo to Sydney' },
  { delayed: 1 }
);
// flight is not saved yet — call flight.save() manually

// Update existing or create new
const flight = await Flight.query().updateOrCreate(
  { departure: 'Oakland', destination: 'San Diego' },
  { price: 99, discounted: 1 }
);
```

**peta-orm gap:**
No find-or-create or update-or-create methods. Users must write manual lookup + conditional insert logic.

**Recommendation:**
Add `firstOrCreate`, `firstOrNew`, and `updateOrCreate` to the QueryBuilder. All three accept a "match" object and an optional "additional" attributes object.

---

### 5. Local Query Scopes

**Sutando approach:**
Named, reusable query constraints defined as methods on the model:

```js
class User extends Model {
  scopePopular(query) {
    return query.where('votes', '>', 100);
  }
  scopeActive(query) {
    query.where('active', 1);
  }
  scopeOfType(query, type) {
    return query.where('type', type);
  }
}

// Usage — chainable, no "scope" prefix
const users = await User.query()
  .popular()
  .active()
  .ofType('admin')
  .orderBy('created_at')
  .get();
```

Scopes receive the query builder and can return it or mutate it in place. Dynamic parameters are supported.

**peta-orm gap:**
Only global scopes (applied to all queries). No local/named scopes that can be selectively applied.

**Recommendation:**
Allow models to define a `scopes` config object or methods. Register them on the QueryBuilder instance so they're chainable: `User.query().popular().active().get()`.

---

## Medium-Impact Improvements

### 6. Pivot Table Features

**Sutando approach:**
Rich pivot table support for many-to-many relations:

```js
// Define with extra pivot columns
return this.belongsToMany(Role).withPivot('active', 'created_by');

// Auto-manage pivot timestamps
return this.belongsToMany(Role).withTimestamps();

// Custom pivot attribute name
return this.belongsToMany(Podcast).as('subscription').withTimestamps();

// Query filtering via pivot columns
return this.belongsToMany(Role)
  .wherePivot('approved', 1)
  .wherePivotIn('priority', [1, 2])
  .wherePivotBetween('created_at', ['2020-01-01', '2020-12-31'])
  .wherePivotNull('expired_at');

// Ordering via pivot columns
return this.belongsToMany(Badge)
  .orderByPivot('created_at', 'desc');
```

**peta-orm gap:**
Basic pivot extras exist (`pivotExtras` on `manyToMany`) but no `withPivot`, `withTimestamps`, `wherePivot`, `orderByPivot`, or custom pivot attribute naming.

**Recommendation:**
Flesh out the pivot API to match. Chainable methods on the relation builder for `withPivot(...cols)`, `withTimestamps()`, `as(name)`, `wherePivot(...)`, and `orderByPivot(...)`.

---

### 7. Plugin System with `compose()`

**Sutando approach:**
Class mixins via a `compose()` helper:

```js
const { Model, compose, SoftDeletes, HasUniqueIds } = require('sutando');

class Post extends compose(Model, SoftDeletes, HasUniqueIds) {}
```

Plugins are just functions that take a class and return a subclass:

```js
// Simple plugin
const SoftDeletes = (Model) => {
  return class extends Model {
    static booted() {
      Model.booted();
      this.deleting(model => { model.deleted_at = new Date(); });
    }
  };
};

// Parameterized plugin
const HasSlug = ({ column }) => (Model) => {
  return class extends Model {
    static booted() {
      Model.booted();
      this.creating(model => {
        if (model[column] === undefined) {
          model[column] = _.kebabCase(model.title);
        }
      });
    }
  };
};

// Usage: class Post extends compose(Model, HasSlug({ column: 'slug' })) {}
```

**peta-orm gap:**
No plugin system. Models are plain objects from `defineModel()`. Extending cross-cutting behavior requires manual composition or hook reuse.

**Recommendation:**
Design a `Model.use(plugin)` or `compose()` API for peta-orm's factory-based models. Since peta-orm doesn't use classes, a wrapper-based approach could work:

```ts
const Post = defineModel('posts', { columns, relations })
  .use(softDeletes())
  .use(hasUniqueIds({ column: 'uuid' }));
```

Where each `.use()` wraps the definition to add hooks, columns, or methods.

---

### 8. `push()` — Recursive Save

**Sutando approach:**
Save a model and all of its loaded/dirty relations in one call:

```js
post.title = 'Updated Title';
post.comments.get(0).message = 'Updated Message';
post.comments.get(0).author.name = 'New Name';

await post.push(); // saves post, comment, and author
```

This recursively walks the loaded relation graph and persists any dirty models.

**peta-orm gap:**
`$save()` only persists the single model. Saving related models requires manual iteration.

**Recommendation:**
Add `$push()` to `ModelInstance` that walks `$relationData()`, finds dirty related models (recursively), and persists them in dependency order within a transaction.

---

### 9. `associate` / `dissociate` for BelongsTo

**Sutando approach:**
Set or clear a belongs-to relationship without manually setting foreign keys:

```js
// Associate — sets the foreign key
const account = await Account.query().find(10);
user.related('account').associate(account);
await user.save(); // user.account_id = 10

// Dissociate — clears the foreign key
user.related('account').dissociate();
await user.save(); // user.account_id = null
```

**peta-orm gap:**
Must manually set FK columns and save. No convenience methods.

**Recommendation:**
Add `associate(model)` and `dissociate()` to the relation query builder for `belongsTo` relations.

---

### 10. `Accessor` / `Mutator` via `Attribute` Class

**Sutando approach:**
A dedicated `Attribute` class with explicit `get` and `set` callbacks:

```js
const { Model, Attribute } = require('sutando');

class User extends Model {
  attributeFirstName() {
    return Attribute.make({
      get: (value, attributes) => value.toUpperCase(),
      set: value => value.toLocaleLowerCase()
    });
  }

  // Computed from multiple attributes
  attributeFullName() {
    return Attribute.make({
      get: (value, attributes) => `${attributes.first_name} ${attributes.last_name}`,
      set: (value) => ({
        first_name: value.split(' ')[0],
        last_name: value.split(' ')[1],
      }),
    });
  }
}
```

Key advantages:
- Explicit `Attribute.make()` — no magic method naming convention
- `set` can return an object to update multiple attributes
- Access to all current attributes via second argument to `get`
- No naming collision risk with `get{Name}Attribute` convention

**peta-orm gap:**
Uses convention-based `get{Name}Attribute` / `set{Name}Attribute` method naming. Less discoverable, harder to type, and limited to single-attribute transformations.

**Recommendation:**
Add an `Attribute` class/helper as an alternative to the convention-based approach:

```ts
const User = defineModel('users', {
  columns: { ... },
  attributes: {
    firstName: Attribute.make({
      get: (value) => value.toUpperCase(),
      set: (value) => value.toLowerCase(),
    }),
    fullName: Attribute.make({
      get: (_, attrs) => `${attrs.firstName} ${attrs.lastName}`,
      set: (value) => {
        const [first, last] = value.split(' ');
        return { firstName: first, lastName: last };
      },
    }),
  },
});
```

---

### 11. Collection `toQuery()`

**Sutando approach:**
Convert a collection into a WHERE IN query for bulk operations:

```js
const users = await User.query().where('status', 'VIP').get();
await users.toQuery().update({ status: 'Administrator' });
// Produces: UPDATE users SET status = 'Administrator' WHERE id IN (...)
```

**peta-orm gap:**
No way to convert a collection back into a query for bulk operations.

**Recommendation:**
Add `toQuery()` to Collection that returns a QueryBuilder with a `WHERE id IN (...)` constraint built from the collection's model IDs.

---

### 12. Custom Cast Classes

**Sutando approach:**
Extensible casting via custom classes:

```js
const { CastsAttributes } = require('sutando');

class Json extends CastsAttributes {
  static get(model, key, value, attributes) {
    try { return JSON.parse(value); }
    catch (e) { return null; }
  }
  static set(model, key, value, attributes) {
    return JSON.stringify(value);
  }
}

class User extends Model {
  casts = {
    options: Json,
  };
}
```

**peta-orm gap:**
Only built-in cast types (json, boolean, integer, etc.). No way to register custom cast logic.

**Recommendation:**
Allow custom cast classes/functions in the `casts` config:

```ts
const User = defineModel('users', {
  columns: { ... },
  casts: {
    metadata: CustomJsonCast,
    status: {
      get: (value) => StatusEnum[value],
      set: (value) => value.name,
    },
  },
});
```

---

### 13. `is()` / `isNot()` Model Comparison

**Sutando approach:**
Check if two model instances represent the same row:

```js
if (post.is(anotherPost)) {
  // Same primary key, table, and connection
}

if (post.isNot(anotherPost)) {
  // Different model
}
```

**peta-orm gap:**
No built-in comparison. Users must compare `.get('id')` manually.

**Recommendation:**
Add `is(other)` and `isNot(other)` to `ModelInstance` that compares primary key values and table names.

---

### 14. `makeVisible` / `makeHidden` at Runtime

**Sutando approach:**
Temporarily override serialization visibility at the instance level:

```js
// Show a normally hidden attribute
user.makeVisible('password').toData();

// Hide a normally visible attribute
user.makeHidden('email').toData();

// Override entire arrays
user.setVisible(['id', 'name']).toData();
user.setHidden(['email', 'password']).toData();

// Append computed attributes at runtime
user.append('is_admin').toData();
user.setAppends(['is_admin']).toData();
```

**peta-orm gap:**
`hidden`/`visible`/`appends` are model-level config only. No per-instance overrides.

**Recommendation:**
Add `makeVisible()`, `makeHidden()`, `setVisible()`, `setHidden()`, `append()`, and `setAppends()` to `ModelInstance`. These modify the instance's serialization temporarily.

---

## Lower-Impact Improvements

### 15. `refresh()` vs `fresh()`

**Sutando approach:**
Two distinct methods for re-syncing with the database:

```js
// Re-hydrate the existing instance (mutates in place)
await flight.refresh();
// flight is the same JS object, attributes updated

// Get a new instance from the DB
const freshFlight = await flight.fresh();
// flight is untouched, freshFlight is a new model instance
```

**peta-orm gap:**
Only `$reload()` (equivalent to `refresh()`). No `fresh()`.

---

### 16. `booted()` Static Hook Registration

**Sutando approach:**
Register hooks in a static `booted()` method that runs once when the model class is first loaded:

```js
class User extends Model {
  static booted() {
    this.creating(user => { ... });
    this.created(user => { ... });
    this.deleting(user => { ... });
  }
}
```

This is cleaner than registering hooks at module level after the class definition.

**peta-orm gap:**
Hooks must be registered after `defineModel()` via `.on()`. No equivalent of `booted()`.

---

### 17. `increment` / `decrement`

**Sutando approach:**
Atomic column increments without manual SELECT + UPDATE:

```js
await db.table('users').increment('votes');
await db.table('users').increment('votes', 5);
await db.table('users').decrement('votes');
await db.table('users').decrement('votes', 5);
```

**peta-orm gap:**
No increment/decrement convenience methods.

---

### 18. `whereX` Magic Methods

**Sutando approach:**
Convert `whereApproved(1)` into `where('approved', 1)` via `__call` magic:

```js
// These are equivalent:
const users = await User.query().where('approved', 1).get();
const users = await User.query().whereApproved(1).get();

const posts = await Post.query().whereViewsCount('>', 100).get();
```

**peta-orm gap:**
No magic where methods.

---

### 19. `pluck()` on Query Builder

**Sutando approach:**
Retrieve a single column's values as an array:

```js
const titles = await db.table('users').pluck('title');
// ['Developer', 'Designer', 'Manager']
```

**peta-orm gap:**
No `pluck()` on the query builder.

---

### 20. Serialization Date Format Control

**Sutando approach:**
Customize date serialization globally or per-model:

```js
class User extends Model {
  // Custom format for all date attributes
  serializeDate(date) {
    return dayjs(date).format('YYYY-MM-DD');
  }

  // Storage format
  dateFormat = 'X'; // Unix timestamp
}

// Per-attribute format via cast
casts = {
  created_at: 'datetime:YYYY-MM-DD',
};
```

**peta-orm gap:**
No date format customization.

---

### 21. `chunk()` Memory-Efficient Iteration

**Sutando approach:**
Process large result sets in chunks without loading all into memory:

```js
await Flight.query().chunk(200, flights => {
  flights.map(flight => { /* process */ });
});
```

**peta-orm gap:**
peta-orm already has `.chunk(size, callback)` — parity exists here.

---

### 22. `trashed()` / `withTrashed()` / `onlyTrashed()`

**Sutando approach:**
Soft delete query scopes:

```js
// Check if model is soft-deleted
if (flight.trashed()) { ... }

// Include soft-deleted in results
const flights = await Flight.query().withTrashed().get();

// Only soft-deleted
const flights = await Flight.query().onlyTrashed().get();
```

**peta-orm gap:**
Soft deletes exist but implemented via built-in `registerSoftDeletes()`, not a plugin. API surface is similar.

---

### 23. Model Default Attribute Values

**Sutando approach:**
Default values for newly instantiated models:

```js
class Flight extends Model {
  attributes = {
    options: '[]',
    delayed: false,
  };
}
```

**peta-orm gap:**
Column-level defaults via `.default(value)` on column definitions. Different approach but equivalent.

---

## Summary: Prioritization Matrix

| # | Feature | Effort | Impact | Urgency |
|---|---------|--------|--------|---------|
| 1 | **Relation query builder** (`related()`) | Medium | 🔥 High | 🔴 High |
| 2 | **Attach/Detach/Sync** (many-to-many) | Medium | 🔥 High | 🔴 High |
| 3 | **`withCount` / aggregate loading** | Medium | 🔥 High | 🔴 High |
| 4 | **`firstOrCreate` / `updateOrCreate`** | Small | High | 🔴 High |
| 5 | **Local query scopes** | Medium | High | 🟡 Medium |
| 6 | **Pivot table extras** (`wherePivot`, `orderByPivot`, etc.) | Medium | Medium | 🟡 Medium |
| 7 | **Plugin system** (`compose()` / `.use()`) | Large | High | 🟡 Medium |
| 8 | **`push()` recursive save** | Medium | Medium | 🟡 Medium |
| 9 | **`associate` / `dissociate`** | Small | Medium | 🟡 Medium |
| 10 | **`Attribute` class for accessors** | Medium | Medium | 🟡 Medium |
| 11 | **Collection `toQuery()`** | Small | Medium | 🟢 Low |
| 12 | **Custom cast classes** | Small | Medium | 🟢 Low |
| 13 | **`is()` / `isNot()` model comparison** | Small | Low | 🟢 Low |
| 14 | **`makeVisible` / `makeHidden` runtime** | Small | Low | 🟢 Low |
| 15 | **`refresh()` vs `fresh()`** | Small | Low | 🟢 Low |
| 16 | **`booted()` static hook registration** | Small | Low | 🟢 Low |
| 17 | **`increment` / `decrement`** | Small | Low | 🟢 Low |
| 18 | **`whereX` magic methods** | Small | Low | 🟢 Low |
| 19 | **`pluck()` on query builder** | Small | Low | 🟢 Low |

---

## Cross-Cutting Patterns: Objection.js vs Sutando.js

These two ORMs share a common ancestor (Knex.js + Active Record) but have different design philosophies. Here's how they compare:

| Feature | Objection.js | Sutando.js | Winner for peta-orm |
|---------|-------------|------------|---------------------|
| **Graph inserts** | `insertGraph()` — full graph support with `#id`/`#ref` | `push()` — recursive single-model save | Objection.js |
| **Graph upserts** | `upsertGraph()` — full upsert with options | `updateOrCreate()` — single level only | Objection.js |
| **Relation queries** | `$relatedQuery('pets')` | `related('pets')` | Tie (both great) |
| **Aggregate loading** | Via `modifyGraph` + subqueries | `withCount`, `withSum`, etc. — built-in | Sutando.js |
| **Scopes** | `modifiers` on model class | `scope{Name}` method convention | Sutando.js |
| **Attach/Detach/Sync** | Manual pivot operations | Full `attach`/`detach`/`sync` API | Sutando.js |
| **Hooks** | Instance + Static hooks with `asFindQuery()` | Instance hooks via `booted()` | Objection.js (static hooks) |
| **Plugin system** | `compose(Plugin)(Model)` | `compose(Model, PluginA, PluginB)` | Tie |
| **Accessors** | `$parseDatabaseJson` / `$formatDatabaseJson` | `Attribute.make({get, set})` | Sutando.js (cleaner) |
| **Security** | `allowGraph()` for eager loading whitelist | None | Objection.js |
| **Thenable QB** | Yes (`await Person.query()`) | Yes (`await User.query()`) | Tie (both have it) |
| **Validation** | JSON Schema (Ajv) | None built-in | peta-orm (ArkType) |

---

## Key Design Philosophy Takeaways

1. **Relations as methods, not config** — Sutando defines relations as instance methods (`relationPosts()`). This enables runtime composition, overriding, and dynamic relation conditions. peta-orm's config-object approach is more declarative but less flexible.

2. **"Convention over configuration"** — Sutando follows Laravel conventions aggressively: table name from class name, FK from snake_case model name + `_id`, pivot table from alphabetical model names. This reduces boilerplate at the cost of implicit behavior.

3. **Active Record is intuitive for CRUD** — The `new Model()` / `model.save()` / `model.delete()` pattern is immediately familiar to developers from Rails, Laravel, or Django. peta-orm's factory-based approach is more functional but less conventional.

4. **Every relation is a query builder** — This is the single most powerful pattern in Sutando (and Objection.js). Relations don't just define connections — they provide a query builder pre-scoped to that connection. This eliminates an enormous amount of manual FK handling.

5. **Plugin systems via mixins are powerful but hard to retrofit** — Sutando's class-based architecture makes `compose(Model, Plugin)` natural. peta-orm's factory-based models would need a different approach (e.g., `.use(plugin)` chaining).

6. **Don't reinvent the query builder** — Sutando delegates to Knex.js. peta-orm delegates to Kysely. Both are good choices. The value of an ORM is in relations, hydration, hooks, and DX — not SQL generation.

7. **Aggregate loading is table stakes** — `withCount` is consistently one of the most-used features in Eloquent/Sutando. Users frequently need counts/averages of related data without loading the related models.

8. **Find-or-create patterns eliminate boilerplate** — `firstOrCreate` and `updateOrCreate` are small methods with outsized impact on code clarity. They replace 5-10 line manual lookup + conditional insert blocks with a single line.

---

*Generated from analysis of Sutando.js v1.7.4 documentation and source code.*
