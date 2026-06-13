# Deepen Candidate 5: Extract `normalizeError` from `errors.ts`

## Goal
Split `errors.ts` (136 lines, two concerns) into error classes + dialect-specific normalizer.

## Steps

### Step 1: Rename `errors.ts` → `errors/classes.ts`

Create directory `errors/`, move file as-is (it's the error classes). No content changes.

### Step 2: Create `errors/normalizer.ts`

Extract lines 63-136 from the original `errors.ts`:

```ts
import { DatabaseError } from "./classes.js"

interface RawError {
  code?: string
  errno?: number
  message?: string
}

export function normalizeError(e: unknown, table?: string): DatabaseError {
  // ... exact same code as lines 69-136
}
```

### Step 3: Create `errors/index.ts` (barrel)

```ts
export type { DatabaseErrorCode } from "./classes.js"
export {
  DatabaseError,
  ModelNotFoundError,
  ModelNotRegisteredError,
  RelationNotAllowedError,
  RelationNotFoundError,
  ValidationError,
} from "./classes.js"
export { normalizeError } from "./normalizer.js"
```

### Step 4: Update `src/index.ts`

Change re-exports to pull from the new barrel:

```ts
// Before:
export type { DatabaseErrorCode } from "./errors.js"
export { DatabaseError, ... normalizeError, ... } from "./errors.js"

// After:
export { normalizeError } from "./errors/normalizer.js"
// and the rest from the barrel:
export type { DatabaseErrorCode } from "./errors/index.js"
export { DatabaseError, ... } from "./errors/index.js"
```

Actually, cleaner: re-export everything from the barrel:

```ts
export type { DatabaseErrorCode } from "./errors/index.js"
export {
  DatabaseError,
  ModelNotFoundError,
  ModelNotRegisteredError,
  normalizeError,
  RelationNotAllowedError,
  RelationNotFoundError,
  ValidationError,
} from "./errors/index.js"
```

### Step 5: Update 2 consumer files

- `src/model/save.ts`: Change `import { DatabaseError, normalizeError } from "../errors.js"` → `import { DatabaseError } from "../errors/index.js"` + `import { normalizeError } from "../errors/normalizer.js"`
- `src/model/delete.ts`: Change `import { DatabaseError, ModelNotRegisteredError, normalizeError } from "../errors.js"` → `import { DatabaseError, ModelNotRegisteredError } from "../errors/index.js"` + `import { normalizeError } from "../errors/normalizer.js"`

### Step 6: Verify

```bash
cd packages/orm
bun test                    # 292 unit tests
bun test test/integration/  # 54 integration tests
bun run build
```

## Delivery checklist

- [ ] `errors/` directory created
- [ ] `errors/classes.ts`: error classes unchanged
- [ ] `errors/normalizer.ts`: normalizeError extracted, imports DatabaseError from classes
- [ ] `errors/index.ts`: barrel re-exporting both
- [ ] `src/index.ts`: re-exports from barrel
- [ ] `model/save.ts`: normalizeError import path updated
- [ ] `model/delete.ts`: normalizeError import path updated
- [ ] All 346 tests pass, build succeeds
