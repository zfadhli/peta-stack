# Deepen Candidate 3: Eliminate mutable `wireDeps` pattern

## Problem
8 mutable `let` variables + `wireDeps()` + `setRelationQueryModule()` in `model/factory.ts` — all using `undefined as any` to bypass TS — to work around a circular dependency between factory.ts and save/delete/serialize modules.

## Solution
Replace with `model/runtime.ts` registry — a single properly typed object initialized at module load time.

## Steps

### Step 1: Create `model/runtime.ts`

```ts
import type { ModelDefinition, ModelInstance } from "./types.js"
import type { RelationQuery } from "../relations/related-query.js"

export interface ModelRuntime {
  saveModel: (def: ModelDefinition, model: ModelInstance) => Promise<ModelInstance>
  deleteModel: (def: ModelDefinition, model: ModelInstance) => Promise<void>
  forceDeleteModel: (def: ModelDefinition, model: ModelInstance) => Promise<void>
  restoreModel: (def: ModelDefinition, model: ModelInstance) => Promise<void>
  trashedModel: (def: ModelDefinition, model: ModelInstance) => boolean
  reloadModel: (def: ModelDefinition, model: ModelInstance) => Promise<void>
  modelToJSON: (def: ModelDefinition, model: ModelInstance) => Record<string, unknown>
  loadModelRelations: (model: ModelInstance, def: ModelDefinition, ...relations: string[]) => Promise<void>
  createRelationQuery: (instance: ModelInstance, def: ModelDefinition, relationName: string) => RelationQuery
}

let runtime: ModelRuntime | null = null

export function initRuntime(fns: ModelRuntime): void {
  runtime = fns
}

export function getRuntime(): ModelRuntime {
  if (!runtime) throw new Error("Model runtime not initialized. Call initRuntime() first.")
  return runtime
}
```

### Step 2: Modify `model/factory.ts`

- Add `import { getRuntime } from "./runtime.js"`
- Remove lines 172-215 (all `let` declarations, `wireDeps`, `setRelationQueryModule`, `requireRelationQuery`)
- Replace all `saveModel(...)`, `deleteModel(...)`, etc. calls with `getRuntime().saveModel(...)`, etc.

The affected instance methods:
- `$save` → `getRuntime().saveModel(def, instance)`
- `$delete` → `getRuntime().deleteModel(def, instance)`
- `$forceDelete` → `getRuntime().forceDeleteModel(def, instance)`
- `$restore` → `getRuntime().restoreModel(def, instance)`
- `$trashed` → `getRuntime().trashedModel(def, instance)`
- `$reload` → `getRuntime().reloadModel(def, instance)`
- `$toJSON` / `toJSON` → `getRuntime().modelToJSON(def, instance)`
- `$load` → `getRuntime().loadModelRelations(instance, def, ...relations)`
- `$related` → `getRuntime().createRelationQuery(instance, def, name)`

### Step 3: Modify `model/index.ts`

Before:
```ts
import { setRelationQueryModule, wireDeps } from "./factory.js"
// ...
wireDeps({ saveModel, deleteModel, ... })
setRelationQueryModule({ createRelationQuery })
```

After:
```ts
import { initRuntime } from "./runtime.js"
// ...
initRuntime({
  saveModel,
  deleteModel,
  forceDeleteModel,
  restoreModel,
  trashedModel,
  reloadModel,
  modelToJSON,
  loadModelRelations,
  createRelationQuery,
})
```

### Step 4: Verify

```bash
cd packages/orm
bun test                  # 292 unit tests
bun test test/integration/ # 54 integration tests
bun run build
```

## Delivery checklist

- [ ] `model/runtime.ts` created (30 lines, typed registry)
- [ ] `model/factory.ts`: 43 lines removed, `getRuntime()` calls added, 0 `as any`
- [ ] `model/index.ts`: `initRuntime()` replaces `wireDeps()` + `setRelationQueryModule()`
- [ ] All 346 tests pass
- [ ] Build succeeds
- [ ] 0 behavioral changes
