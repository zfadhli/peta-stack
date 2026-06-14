# Plugin Authoring Guide

peta-orm has a plugin system that lets you extend model behavior. Built-in plugins include `timestamps()`, `softDeletes()`, and `ulid()`.

## Plugin Interface

A plugin is a function that receives the model definition and returns nothing (or a modified definition):

```ts
type Plugin = (def: ModelDefinition) => void
```

## Built-in Plugins

### timestamps()

Adds `createdAt` and `updatedAt` columns that are automatically set on create and update.

```ts
import { timestamps } from "peta-orm"

const Post = defineModel("posts", {
  columns: {
    id: t.integer().primaryKey(),
    title: t.string(255),
    ...t.timestamps(),  // Adds createdAt, updatedAt columns
  },
}).use(timestamps())
```

### softDeletes()

Adds a `deletedAt` column. Records are excluded from queries by default.

```ts
import { softDeletes } from "peta-orm"

const User = defineModel("users", {
  columns: {
    id: t.integer().primaryKey(),
    name: t.string(255),
    ...t.timestamps(),
  },
}).use(softDeletes())
```

See [the ORM README](https://github.com/zfadhli/peta-stack/tree/main/packages/orm#soft-deletes) for query methods.

### ulid()

Generates ULID primary keys instead of auto-increment integers. ULIDs are sortable, URL-safe, and human-readable.

```ts
import { ulid } from "peta-orm"

const Post = defineModel("posts", {
  columns: {
    id: t.string(26).primaryKey(),  // ULID length
    title: t.string(255),
  },
}).use(ulid())
```

## Writing a Custom Plugin

### Hook-Based Plugin

Plugins can register lifecycle hooks on the model:

```ts
import type { Plugin } from "peta-orm"

function slugify(sourceField: string, targetField: string): Plugin {
  return (def) => {
    def.on("beforeCreate", (model) => {
      const source = model.get(sourceField) as string
      if (source) {
        model.set(targetField, source.toLowerCase().replace(/\s+/g, "-"))
      }
    })
    def.on("beforeUpdate", (model) => {
      if (model.dirty(sourceField)) {
        const source = model.get(sourceField) as string
        if (source) {
          model.set(targetField, source.toLowerCase().replace(/\s+/g, "-"))
        }
      }
    })
  }
}

// Usage
const Post = defineModel("posts", {
  columns: {
    id: t.integer().primaryKey(),
    title: t.string(255),
    slug: t.string(255).unique(),
  },
}).use(slugify("title", "slug"))
```

### Composing Plugins

Multiple plugins can be chained:

```ts
const Post = defineModel("posts", {
  columns: { /* ... */ },
})
  .use(timestamps())
  .use(ulid())
  .use(slugify("title", "slug"))
```

Plugin order matters — hooks fire in registration order.

## Plugin Best Practices

1. **Keep plugins pure** — They should only operate on the model definition and hook system, not external state.
2. **Use WeakMap for plugin state** — If your plugin needs per-model-instance state, store it in a WeakMap keyed on the model instance to avoid memory leaks.
3. **Document hooks used** — Make it clear which lifecycle events your plugin hooks into.
4. **Handle both create and update** — Most plugins that transform data need to handle both `beforeCreate` and `beforeUpdate`.

### Plugin with State

```ts
import type { Plugin, ModelInstance } from "peta-orm"

const counters = new WeakMap<ModelInstance, number>()

function viewCounter(): Plugin {
  return (def) => {
    def.on("afterCreate", (model) => {
      counters.set(model, 0)
    })
    def.on("afterFind", (model) => {
      const count = counters.get(model) ?? 0
      model.set("_views", count + 1)
      counters.set(model, count + 1)
    })
  }
}
```

## Available Hooks

| Hook | Timing | Mutate model? |
|------|--------|--------------|
| `beforeCreate` | Before INSERT | Yes |
| `afterCreate` | After INSERT | No |
| `beforeUpdate` | Before UPDATE | Yes |
| `afterUpdate` | After UPDATE | No |
| `beforeDelete` | Before DELETE | Yes |
| `afterDelete` | After DELETE | No |
| `afterFind` | After SELECT (per row) | Yes |

Hooks registered via `def.on()` are instance-level. For static hooks that affect query building, see the [Query Builder Internals](./query-builder) page.
