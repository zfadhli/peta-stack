# Deepen Candidate 6: Move `defineModel` to `model/define.ts`

## Steps

### Step 1: Create `model/define.ts`

Extract lines 49-218 from `model/index.ts` into a new file:

```ts
import type { ColumnShape } from "../columns/column.js"
import { ModelNotRegisteredError } from "../errors.js"
import { addStaticHook } from "../hooks/static.js"
import type { QueryBuilder } from "../query/index.js"
import { createQueryBuilder } from "../query/index.js"
import type { ORMLike } from "../types.js"
import { createInstance } from "./factory.js"
import { getHooksFor, registerSoftDeletesFor, registerTimestampsFor } from "./hooks.js"
import { setConfig } from "./save.js"
import { addScope, getScopes, removeScope } from "./scopes.js"
import type { ModelConfig, ModelDefinition } from "./types.js"

// ─── DEFINE MODEL FACTORY ────────────────────────────────────

export function defineModel<TColumns extends ColumnShape>(
  table: string,
  config: ModelConfig<TColumns>,
): ModelDefinition<TColumns> {
  // ... exact same code as lines 66-218 of model/index.ts
}
```

### Step 2: Update `model/index.ts`

Remove the `defineModel` function definition (lines 49-218) and replace with a re-export:

Before:
```ts
// ─── DEFINE MODEL FACTORY ────────────────────────────────────
import type { ColumnShape } from "../columns/column.js"
import { ModelNotRegisteredError } from "../errors.js"
// ... etc
export function defineModel<TColumns extends ColumnShape>(...) { ... }
```

After:
```ts
export { defineModel } from "./define.js"
```

The barrel part (lines 1-47) stays completely unchanged.

### Step 3: Update `src/index.ts`

Before:
```ts
export { Attribute, defineModel } from "./model/index.js"
```

After:
```ts
export { Attribute } from "./model/index.js"
export { defineModel } from "./model/define.js"
```

### Step 4: Verify

```bash
cd packages/orm
bun test                    # 292 unit tests
bun test test/integration/  # 54 integration tests
bun run build
```

## Delivery checklist

- [ ] `model/define.ts` created with `defineModel()` function
- [ ] `model/index.ts`: `defineModel` removed, replaced with re-export
- [ ] `src/index.ts`: `defineModel` import updated to `./model/define.js`
- [ ] All 346 tests pass, build succeeds
