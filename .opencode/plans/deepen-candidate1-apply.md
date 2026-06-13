# Deepen Candidate 1: Split `relations/graph.ts` → `relations/graph/`

## Steps

### Step 1: Create `relations/graph/` directory with 7 files

Each file extracts code from `graph.ts` by section, preserving logic **exactly** — no behavioral changes.

### Step 2: Extract `types.ts`

Move from graph.ts lines 1-57:

```ts
// types.ts
export interface InsertGraphOptions { ... }
export interface UpsertGraphOptions extends InsertGraphOptions { ... }
interface RefEntry { node: Record<string, unknown>; def: ModelDefinition }
interface GraphContext { refMap: Map<string, RefEntry>; processedRefs: Map<string, ModelInstance>; allowRefs: boolean; allowedGraphSet: Set<string> | undefined }
```

### Step 3: Extract `security.ts`

Move from graph.ts: `isRelationAllowed`, `isRelPathAllowed`, `resolveAllowGraph`, `assertRelationAllowed`, `joinPath`, `relNameFromPath`.

```ts
// security.ts
import { RelationNotAllowedError } from "../../errors.js"
import type { InsertGraphOptions } from "./types.js"
export function isRelationAllowed(relName: string, allowedSet: Set<string>): boolean { ... }
export function isRelPathAllowed(relName: string, option: boolean | string[] | undefined): boolean { ... }
export function resolveAllowGraph(options: InsertGraphOptions): Set<string> | undefined { ... }
export function assertRelationAllowed(def: ModelDefinition, fullPath: string, allowedSet: Set<string> | undefined): void { ... }
export function joinPath(parentPath: string, relName: string): string { ... }
export function relNameFromPath(path: string): string { ... }
```

### Step 4: Extract `morph.ts`

Move from graph.ts lines 137-176:

```ts
// morph.ts
import type { Relation } from "../base.js"
const MORPH_MAP_KEY = "_morphMap"
const THUNK_CACHE = new WeakMap<object, ModelDefinition>()
export function resolveThunk(thunk: () => ModelDefinition): ModelDefinition { ... }
export function isMorphToRelation(relation: Relation): boolean { ... }
export function isMorphManyRelation(relation: Relation): boolean { ... }
export function getMorphType(relation: Relation): string | undefined { ... }
export function getMorphTypeValue(relation: Relation): string | undefined { ... }
export function getMorphId(relation: Relation): string | undefined { ... }
```

### Step 5: Extract `parser.ts`

Move from graph.ts lines 58-285 (helpers + extractGraphRelationData + collectRefs/resolveRefs):

```ts
// parser.ts
import { DatabaseError } from "../../errors.js"
import type { ModelDefinition, ModelInstance } from "../../model/types.js"
import type { Relation } from "../base.js"
import type { GraphContext } from "./types.js"
export function getPrimaryKeyColumn(def: ModelDefinition): string { ... }
export function getDb(def: ModelDefinition): any { ... }
export function getPivotInfo(relation: Relation): { throughTable: string; foreignPivotKey: string; relatedPivotKey: string } { ... }
export async function findRelated(def: ModelDefinition, conditions: Record<string, unknown>): Promise<ModelInstance | undefined> { ... }
export async function resolveTargetId(def: ModelDefinition, target: number | string | Record<string, unknown>): Promise<unknown> { ... }
export function extractGraphRelationData(def: ModelDefinition, node: Record<string, unknown>): { columnData: Record<string, unknown>; relationOps: Record<string, unknown> } { ... }
export function collectRefs(node: Record<string, unknown>, def: ModelDefinition, refMap: Map<string, RefEntry>): void { ... }
export function resolveRefs(node: Record<string, unknown>, context: GraphContext): void { ... }
```

### Step 6: Extract `insert.ts`

Move from graph.ts lines 287-736 (insertGraph + processNode + processBelongsTo + processMorphTo + processHasMany + processManyToMany):

```ts
// insert.ts
import { DatabaseError } from "../../errors.js"
import type { ModelDefinition, ModelInstance } from "../../model/types.js"
import type { Relation } from "../base.js"
import type { InsertGraphOptions, GraphContext } from "./types.js"
import { assertRelationAllowed, joinPath } from "./security.js"
import { isMorphToRelation, isMorphManyRelation, getMorphType, getMorphTypeValue, getMorphId, resolveThunk } from "./morph.js"
import { getPrimaryKeyColumn, getDb, getPivotInfo, findRelated, resolveTargetId, extractGraphRelationData, collectRefs, resolveRefs } from "./parser.js"
export async function insertGraph(def, data, options?): Promise<any> { ... }
async function processNode(node, def, parentFK, options, context, path): Promise<ModelInstance> { ... }
async function processBelongsTo(relation, op, options, context, path, parentColumnData?): Promise<ModelInstance | null> { ... }
async function processMorphTo(relation, op, options, context, path, parentColumnData?): Promise<ModelInstance | null> { ... }
async function processHasMany(instance, relation, op, pkValue, options, context, path): Promise<void> { ... }
async function processManyToMany(instance, relation, op, pkValue, options, context, path): Promise<void> { ... }
```

### Step 7: Extract `upsert.ts`

Move from graph.ts lines 738-1077 (upsertGraph + upsertNode + upsertHasMany + upsertManyToMany):

```ts
// upsert.ts
import { DatabaseError } from "../../errors.js"
import type { ModelDefinition, ModelInstance } from "../../model/types.js"
import type { Relation } from "../base.js"
import type { UpsertGraphOptions, GraphContext } from "./types.js"
import { isRelPathAllowed, assertRelationAllowed, joinPath, relNameFromPath } from "./security.js"
import { isMorphManyRelation, getMorphType, getMorphTypeValue } from "./morph.js"
import { getPrimaryKeyColumn, getDb, getPivotInfo, findRelated, resolveTargetId, extractGraphRelationData, collectRefs, resolveRefs } from "./parser.js"
import { processNode } from "./insert.js"
export async function upsertGraph(def, data, options?): Promise<any> { ... }
async function upsertNode(node, def, parentFK, options, context, path): Promise<ModelInstance> { ... }
async function upsertHasMany(instance, relation, op, pkValue, options, context, path): Promise<void> { ... }
async function upsertManyToMany(instance, relation, op, pkValue, options, context, path): Promise<void> { ... }
```

### Step 8: Create `index.ts` barrel

```ts
// index.ts
export { isRelationAllowed } from "./security.js"
export { insertGraph } from "./insert.js"
export { upsertGraph } from "./upsert.js"
export type { InsertGraphOptions, UpsertGraphOptions } from "./types.js"
```

### Step 9: Update consumer imports

**`../relations/index.ts`** — Add re-export from `./graph/index.js`:
```ts
export { insertGraph, upsertGraph, isRelationAllowed } from "./graph/index.js"
```

**`../model/index.ts`** — Change dynamic import:
```ts
// Before:
const mod = await import("../relations/graph.js")
// After:
const mod = await import("../relations/graph/index.js")
```
There are 2 occurrences (insertGraph and upsertGraph).

**`../query/index.ts`** — Change static import:
```ts
// Before:
import { isRelationAllowed } from "../relations/graph.js"
// After:
import { isRelationAllowed } from "../relations/graph/security.js"
```

Also change the 2 dynamic imports:
```ts
// Before:
const { insertGraph: doInsertGraph } = await import("../relations/graph.js")
// After:
const { insertGraph: doInsertGraph } = await import("../relations/graph/index.js")
```

**`../model/types.ts`** — Change type imports:
```ts
// Before:
import type { InsertGraphOptions, UpsertGraphOptions } from "../relations/graph.js"
// After:
import type { InsertGraphOptions, UpsertGraphOptions } from "../relations/graph/index.js"
```

### Step 10: Update test imports

**`../test/graph.test.ts`** — May import from `"../src/relations/graph.js"`:
```ts
// Before:
import { insertGraph, upsertGraph, isRelationAllowed } from "../src/relations/graph.js"
// After:
import { insertGraph, upsertGraph, isRelationAllowed } from "../src/relations/graph/index.js"
```

### Step 11: Delete old `graph.ts`

After verifying everything imports correctly, delete `relations/graph.ts`.

### Verification

```bash
cd packages/orm
bun test                    # 292 unit tests
bun test test/integration/  # 54 integration tests
bun run build               # build must succeed
bun run typecheck           # no type errors
```

## Delivery checklist

- [ ] 7 new files created, 0 behavioral changes
- [ ] 4 consumer files updated (model/index.ts, query/index.ts, model/types.ts, relations/index.ts)
- [ ] 1 test file updated (graph.test.ts)
- [ ] 1 file deleted (graph.ts)
- [ ] All tests pass
- [ ] Build succeeds
