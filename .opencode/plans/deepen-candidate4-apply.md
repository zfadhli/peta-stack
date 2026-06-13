# Deepen Candidate 4: Add typed `_morph*` properties to `Relation` interface

## Problem
Morph metadata accessed via `(relation as any)._morphMap` / `_morphType` / `_morphId` / `_morphTypeValue` across 4 files. The `Relation` interface doesn't declare these properties.

## Fix

### Step 1: Add morph properties to `Relation` interface

File: `src/relations/base.ts`

Add to the `Relation` interface (before `query` method):

```ts
// Morph (polymorphic) metadata — set by defineMorphTo/MorphMany/MorphOne
_morphMap?: Record<string, () => ModelDefinition>
_morphType?: string
_morphId?: string
_morphTypeValue?: string
```

### Step 2: Remove `as any` from 12 access sites

**File: `src/relations/morph.ts`**

- Line 77: `(relation as any)._morphMap` → `relation._morphMap`
- Line 78: `(relation as any)._morphType` → `relation._morphType`
- Line 145: `_morphMap: morphMap as any` → `_morphMap: morphMap`
- Line 146: `_morphType: morphType as any` → `_morphType: morphType`
- Line 147: `_morphId: morphId as any` → `_morphId: morphId`

**File: `src/relations/graph/morph.ts`**

- Line 9: `(relation as any)?.[MORPH_MAP_KEY]` → `relation._morphMap !== undefined` (and remove `MORPH_MAP_KEY` const if no longer used)
- Line 14: `(relation as any)?._morphType` → `relation._morphType`
- Line 19: `(relation as any)?._morphType` → `relation._morphType`
- Line 24: `(relation as any)?._morphTypeValue` → `relation._morphTypeValue`
- Line 29: `(relation as any)?._morphId` → `relation._morphId`

**File: `src/relations/graph/insert.ts`**

- Line 234: `(relation as any)._morphMap` → `relation._morphMap`

**File: `src/relations/eager.ts`**

- Line 10-14: Change `isMorphRelation(relation: any)` → `isMorphRelation(relation: Relation)` and simplify body:
  ```ts
  function isMorphRelation(relation: Relation): boolean {
    return relation._morphMap !== undefined
  }
  ```
- Remove `MORPH_MAP_KEY` constant on line 10 if no longer needed elsewhere.

### Step 3: Verify

```bash
cd packages/orm
bun test
bun run build
```

## Delivery checklist

- [ ] `base.ts`: 4 optional properties added
- [ ] `morph.ts`: 5 `as any` casts removed
- [ ] `graph/morph.ts`: 5 `as any` casts removed
- [ ] `graph/insert.ts`: 1 `as any` cast removed
- [ ] `eager.ts`: parameter typed, `MORPH_MAP_KEY` const removed
- [ ] All tests pass, build succeeds
