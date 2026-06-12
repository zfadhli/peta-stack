# Lessons from Objection.js for peta-orm

> **Date:** 2026-06-12
> **Source:** [Objection.js](https://github.com/vincit/objection.js) — an SQL-friendly ORM built on Knex
> **Purpose:** Identify patterns, features, and design decisions from Objection.js that could inspire improvements to peta-orm.

---

## Architecture Overview

Objection.js describes itself as a **relational query builder** rather than a traditional ORM. Key architectural traits:

| Trait | Objection.js | peta-orm |
|-------|-------------|----------|
| **Base** | Class-based `Model` inheritance | Factory-based `defineModel()` with plain objects |
| **Query Builder** | Wraps Knex QueryBuilder, thenable | Wraps Kysely QueryBuilder, explicit `.execute()` |
| **Relations** | Declarative `relationMappings` static property | Declarative `relations` config object |
| **Validation** | JSON Schema (Ajv) — pluggable | ArkType — compile-time + runtime |
| **Hooks** | Instance hooks + Static query hooks | Instance lifecycle events |
| **Transactions** | 3 styles: callback, explicit, model-binding | `Model.transaction(fn)` |
| **Plugin system** | `compose()` / `mixin()` | Hooks only |

---

## High-Impact Additions

### 1. Graph Inserts — `insertGraph()`

**Objection.js approach:**
Insert an entire object graph (model + relations) in a single call. The method topologically sorts the graph, inserts models in dependency order, backfills foreign keys, and returns the inserted graph with generated IDs.

```js
const graph = await Person.query().insertGraph({
  firstName: 'Sylvester',
  children: [{
    firstName: 'Sage',
    pets: [{ name: 'Fluffy', species: 'dog' }]
  }]
});
```

Supports `#id`/`#ref` for shared references, `relate: true` for linking to existing rows, and `#dbRef` for direct DB references.

**peta-orm gap:**
No equivalent. Users must manually insert parent, get ID, insert child, get ID, etc. For deeply nested graphs this creates significant boilerplate.

**Recommendation:**
Add `insertGraph(data, options?)` to `ModelDefinition`. Walk the relation graph, topologically sort by dependency (parents before children, belongsTo before hasMany), insert each level with `RETURNING *`, backfill FK columns on children, and optionally relate existing rows. Use the existing relation definitions to determine the shape.

---

### 2. Graph Upserts — `upsertGraph()`

**Objection.js approach:**
Insert-or-update an entire object graph. By default, objects with an `id` are updated, objects without an `id` are inserted, and objects missing from the graph are deleted. Configurable via options:

```js
await Person.query().upsertGraph(graph, {
  relate: true,      // Link existing rows instead of inserting
  unrelate: true,    // Unlink instead of deleting
  noDelete: ['movies'] // Don't delete missing movies
});
```

**peta-orm gap:**
No equivalent. Complex nested form submissions (e.g., an article with its tags and comments) require manual diff-and-apply logic.

**Recommendation:**
Implement `upsertGraph(graph, options?)`. Use IDs to distinguish insert vs update. Walk the relation tree, apply changes level by level. Support `relate`/`unrelate`/`noDelete`/`noInsert`/`noUpdate` options per relation path.

---

### 3. Relation Query Builders — `$relatedQuery()` / `relatedQuery()`

**Objection.js approach:**
Query, insert, update, delete, relate, or unrelate through a named relation — all with a familiar query builder API:

```js
// Instance-level: query relations of a single model
const dogs = await person.$relatedQuery('pets')
  .where('species', 'dog')
  .orderBy('name');

// Static-level: query relations across multiple parents
const dogs = await Person.relatedQuery('pets')
  .for([1, 2, 3])
  .where('species', 'dog');

// Insert through a relation
await person.$relatedQuery('pets').insert({ name: 'Fluffy' });

// Relate (many-to-many)
await Person.relatedQuery('movies').for(100).relate(200);

// Unrelate
await Person.relatedQuery('movies').for(100).unrelate()
  .where('name', 'like', 'Terminator%');
```

**peta-orm gap:**
Only `$load()` for lazy-reading relations. No way to insert, update, delete, relate, or unrelate through a relation.

**Recommendation:**
Add `$relatedQuery(name)` on `ModelInstance` and `ModelDefinition.relatedQuery(name)`. The instance variant scopes to the parent's FK value. The static variant accepts `.for(parentIds)` or `.for(subquery)`. Both return a query builder filtered to the relation's join conditions.

---

### 4. Static Query Hooks

**Objection.js approach:**
Static hooks run **once per query** (not per instance), giving access to `asFindQuery()` — a transform of the executing query into a SELECT that previews which rows would be affected:

```js
class Person extends Model {
  static async beforeDelete({ asFindQuery, cancelQuery }) {
    // Preview what will be deleted
    const ids = await asFindQuery().select('id');
    await auditLog(ids);

    // Cancel and do a soft delete instead
    cancelQuery(await asFindQuery().patch({ deleted: true }));
  }

  static async afterFind({ result }) {
    return { data: result, meta: { count: result.length } };
  }
}
```

Available hooks: `beforeInsert`, `afterInsert`, `beforeUpdate`, `afterUpdate`, `beforeDelete`, `afterDelete`, `beforeFind`, `afterFind`.

**peta-orm gap:**
Instance-level hooks only (`beforeCreate`, `afterCreate`, etc.). No `beforeDelete` that can inspect the full scope of a `deleteMany()`, no `afterFind` for result wrapping.

**Recommendation:**
Add static hooks to `ModelDefinition`:

```ts
User.onQuery('beforeDelete', async ({ query, asFindQuery, cancelQuery }) => {
  const ids = await asFindQuery().select('id');
  await auditLog({ action: 'delete', userIds: ids });
});
```

The `asFindQuery()` pattern is the killer feature — it transforms any update/delete into a SELECT, enabling soft-delete, auditing, and pre-validation.

---

## Medium-Impact Improvements

### 5. Thenable QueryBuilder

**Objection.js approach:**
QueryBuilder is thenable — it can be `await`ed directly:

```js
const person = await Person.query().where('id', 1);
// No need for .execute()
```

Implemented via `.then(resolve, reject)` on the QB prototype.

**peta-orm gap:**
Requires terminal methods: `.execute()`, `.collect()`, `.executeTakeFirst()`, etc.

**Recommendation:**
Make the QueryBuilder implement `PromiseLike` (or be thenable). Keep terminal methods for explicit style, but allow `await` for the common case.

---

### 6. Eager Loading Modifiers

**Objection.js approach:**
Granular per-relation modification of eager loads:

```js
// Inline modifiers per relation path
await Person.query()
  .withGraphFetched('[children.[pets, movies], movies]')
  .modifyGraph('children.pets', builder => {
    builder.where('age', '>', 10).select('name');
  });

// Named reusable modifiers on the model class
class Person extends Model {
  static get modifiers() {
    return {
      onlyDogs: builder => builder.where('species', 'dog'),
      orderByName: builder => builder.orderBy('name'),
    };
  }
}

// Usage with argument binding
await Person.query().withGraphFetched(
  'pets(onlyDogs, orderByName)'
);
```

**peta-orm gap:**
`.with(name, callback)` supports inline callbacks but no named modifiers, no aliasing, no relation argument binding.

**Recommendation:**
Add `modifiers` config to `ModelDefinition`. Support `modifyGraph(path, callback)` on QueryBuilder. Allow expressions like `with('posts.comments(modRecent)')` where `modRecent` is a named modifier.

---

### 7. Relation Expression Syntax

**Objection.js approach:**
A rich string-based DSL for declaring eager loads:

```js
// Basic
'pets'

// Multiple
'[pets, children]'

// Nested
'[pets, children.[pets, children]]'

// Aliased
'[children as kids]'

// Recursive (any depth)
'children.^'

// Recursive (up to 3 levels)
'children.^3'

// With modifiers
'pets(onlyDogs, orderByName)'
```

**peta-orm gap:**
Simple dot-notation only: `'posts.comments'`. No aliasing, no recursion, no modifier syntax.

**Recommendation:**
Add a `RelationExpression` parser (or adopt a subset of Objection's syntax). Support `^` for recursive relations. Add `as` for aliasing. Parse into an AST for `allowGraph()` security checking.

---

### 8. `$query()` Instance Method

**Objection.js approach:**
Create a query scoped to the model instance's primary key:

```js
const person = await Person.query().findById(1);
await person.$query().patch({ lastName: 'Updated' });
// Generates: UPDATE persons SET ... WHERE id = 1

await person.$query().delete();
// Generates: DELETE FROM persons WHERE id = 1
```

**peta-orm gap:**
`$save()` and `$delete()` exist but are specialized. No general `$query()` for arbitrary operations.

**Recommendation:**
Add `$query()` to `ModelInstance` that returns a QueryBuilder pre-filtered to the instance's PK. This enables any query operation on the instance without special methods.

---

### 9. Composite Primary Keys

**Objection.js approach:**
`idColumn` accepts an array for composite keys:

```js
class OrderItem extends Model {
  static get idColumn() { return ['orderId', 'productId']; }
}

const item = await OrderItem.query().findById([123, 456]);
```

Composite keys are first-class in relations, queries, and hooks.

**peta-orm gap:**
Hardcoded single-column `"id"` primary key assumption throughout the codebase. Blocked use cases: junction tables, multi-tenant schemas, legacy databases.

**Recommendation:**
Support `primaryKey: string | string[]` in `ModelConfig`. Update all internal queries (`find()`, `save()`, `delete()`, relation matching) to handle composite keys.

---

### 10. `allowGraph()` Security

**Objection.js approach:**
Explicit whitelist of allowed relation expressions — critical when the expression comes from user input:

```js
// In an Express route
expressApp.get('/people', async (req, res) => {
  const people = await Person.query()
    .allowGraph('[pets, children.pets]')  // Only these are allowed
    .withGraphFetched(req.query.eager);  // From user input
  res.send(people);
});
```

**peta-orm gap:**
Any relation name passed to `.with()` is accepted. No security boundary.

**Recommendation:**
Add `allowGraph(expression)` to QueryBuilder. Throw if a user-supplied expression references a relation outside the whitelist. Parse the expression to validate against the allow list before executing.

---

## Lower-Impact Improvements

### 11. Data Lifecycle Hooks (format/parse pipeline)

**Objection.js approach:**
Four hooks that transform data as it moves between formats:

| Hook | Direction | Purpose |
|------|-----------|---------|
| `$parseDatabaseJson` | DB → Model | Convert DB raw values to JS types (e.g., string → Date) |
| `$formatDatabaseJson` | Model → DB | Convert JS types to DB format (e.g., Date → ISO string) |
| `$parseJson` | External → Model | Validate/transform API input |
| `$formatJson` | Model → External | Transform for JSON output (e.g., hide fields, format dates) |

**peta-orm gap:**
Attribute-level accessors/mutators (`get{Name}Attribute`, `set{Name}Attribute`) but no holistic pipeline. JSON columns are auto-serialized but no general transform hooks.

**Recommendation:**
Add optional `$parseDatabaseJson` / `$formatDatabaseJson` / `$parseJson` / `$formatJson` methods to `ModelConfig`. Call them during hydrate, insert, update, and serialization flows.

---

### 12. Plugin / Mixin System

**Objection.js approach:**
`compose()` applies mixins to Model classes:

```js
const { compose } = require('objection');
const MyPlugin = (Model) => class extends Model {
  static get tableName() { return 'my_table'; }
};
const MyModel = compose(MyPlugin)(Model);
```

**peta-orm gap:**
No plugin system. Models are plain objects from `defineModel()`. Extending cross-cutting behavior requires manual composition.

**Recommendation:**
Design a plugin API: `defineModel(table, config).use(plugin(options))`. Plugins can add hooks, columns, methods, or scopes.

---

### 13. `joinRelated()`

**Objection.js approach:**
Auto-join through relation chains:

```js
await Person.query()
  .select('parent:parent.name as grandParentName')
  .joinRelated('parent.parent');
```

Generates correct JOINs with table aliases.

**peta-orm gap:**
Requires manual `.innerJoin('table', 'lhs', 'rhs')` with explicit column names.

**Recommendation:**
Add `joinRelated(expression)` to QueryBuilder that walks the relation graph and generates the correct JOIN chain with aliases.

---

### 14. `patchAndFetchById()` / `updateAndFetchById()`

**Objection.js approach:**
Combined update + fetch in a single chain:

```js
const updated = await Person.query()
  .patchAndFetchById(1, { age: 31 });
// UPDATE persons SET age = 31 WHERE id = 1
// SELECT * FROM persons WHERE id = 1
```

**peta-orm gap:**
`update(id, data)` returns the count of affected rows (from Kysely), not the updated model. Must manually re-`find()` after update.

**Recommendation:**
Add `patchAndFetch(id, data)` to `ModelDefinition` that runs `UPDATE` then `SELECT *` (or uses `RETURNING *` on PostgreSQL).

---

### 15. Custom QueryBuilder Per Model

**Objection.js approach:**
Models can return a custom QueryBuilder subclass:

```js
class Person extends Model {
  static get QueryBuilder() {
    return MyCustomQueryBuilder;
  }
}
```

Enables model-specific query methods.

**peta-orm gap:**
Single `QueryBuilder` for all models.

**Recommendation:**
Allow `queryBuilder` option in `ModelConfig` to provide a factory or subclass. Register custom methods during model definition.

---

### 16. `whereJson()` / JSON Query Methods

**Objection.js approach:**
First-class JSON column queries with syntax for PostgreSQL, MySQL, SQLite:

```js
await Person.query()
  .whereJsonPath('address', '$.city', '=', 'Helsinki')
  .whereJsonSuperset('permissions', { admin: true });
```

**peta-orm gap:**
No JSON-specific query methods. Must use `raw()` or Kysely's JSON support directly.

---

## Summary: Prioritization Matrix

| Feature | Effort | Impact | Urgency |
|---------|--------|--------|---------|
| Graph inserts (`insertGraph`) | Large | High | 🔴 High |
| Static query hooks | Medium | High | 🔴 High |
| `$relatedQuery` / `relatedQuery` | Medium | High | 🔴 High |
| Thenable QueryBuilder | Small | Medium | 🟡 Medium |
| Eager loading modifiers | Medium | Medium | 🟡 Medium |
| `allowGraph` security | Small | Medium | 🟡 Medium |
| Composite primary keys | Large | Medium | 🟡 Medium |
| `$query()` instance method | Small | Medium | 🟡 Medium |
| Relation expression DSL | Medium | Medium | 🟢 Low |
| Plugin system | Large | Medium | 🟢 Low |
| `joinRelated()` | Medium | Low | 🟢 Low |
| Data lifecycle hooks | Medium | Low | 🟢 Low |
| Custom QB per model | Small | Low | 🟢 Low |

---

## Key Design Philosophy Takeaways

Beyond specific features, Objection.js teaches several design principles:

1. **"SQL-friendly, not SQL-hiding"** — Give users access to the full power of SQL (raw queries, subqueries, window functions) while making common tasks easy.

2. **Queries, not entities** — Don't wrap everything in objects. Work with query builders directly. The `.then()` pattern makes this natural.

3. **Progressive complexity** — Simple things are one-liners (`Person.query().findById(1)`). Complex things remain possible without fighting the framework.

4. **Explicit over magic** — Relation mappings are verbose but explicit. You can always tell which columns and tables are involved.

5. **Composition over configuration** — Plugins via `compose()` / `mixin()`, not a global config object.

6. **Graph operations are the killer feature** — `insertGraph` and `upsertGraph` are what make people choose Objection.js over raw Knex. They eliminate an enormous class of boilerplate.

7. **Static hooks > instance hooks** — Instance-per-row hooks are a performance trap. Static hooks with `asFindQuery()` are the correct abstraction.

8. **Security is built-in** — `allowGraph()` whitelisting for user-supplied relation expressions. Don't let eager loading become an attack vector.

---

*Generated from analysis of Objection.js v3.x documentation and source code.*
