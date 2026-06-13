# Deepen Candidate 2: Split `query/index.ts` → `query/types.ts` + `query/builder.ts`

## Steps

### Step 1: Create `query/types.ts`

Extract `QueryBuilder` interface from `query/index.ts` lines 15-116.

```ts
// types.ts — QueryBuilder interface only
import type { ModelInstance } from "../model/types.js"
import type { InsertGraphOptions, UpsertGraphOptions } from "../relations/graph/index.js"

export interface QueryBuilder extends PromiseLike<ModelInstance[]> {
  // Core execution (lines 18-25)
  execute(): Promise<ModelInstance[]>
  collect(): Promise<import("../collection/index.js").Collection>
  executeTakeFirst(): Promise<ModelInstance | undefined>
  executeTakeFirstOrThrow(): Promise<ModelInstance>
  find(id: number | string): Promise<ModelInstance | undefined>
  findOrFail(id: number | string): Promise<ModelInstance>
  first(): Promise<ModelInstance | undefined>
  toSQL(): { sql: string; parameters: readonly unknown[] }

  // Aggregates (lines 27-32)
  count(): Promise<number>
  sum(column: string): Promise<number>
  avg(column: string): Promise<number>
  min(column: string): Promise<number>
  max(column: string): Promise<number>

  // Aggregate subqueries (lines 34-40)
  withCount(relation: string): QueryBuilder
  withSum(relation: string, column: string): QueryBuilder
  withAvg(relation: string, column: string): QueryBuilder
  withMin(relation: string, column: string): QueryBuilder
  withMax(relation: string, column: string): QueryBuilder
  withExists(relation: string): QueryBuilder

  // Chunking & pagination (lines 42-44)
  chunk(size: number, callback: (chunk: ModelInstance[]) => Promise<void>): Promise<void>
  paginate(page: number, perPage?: number): Promise<import("../pagination/index.js").Paginator>

  // Graph operations (lines 46-48)
  insertGraph(data: Record<string, unknown> | Record<string, unknown>[], options?: InsertGraphOptions): Promise<any>
  upsertGraph(data: Record<string, unknown> | Record<string, unknown>[], options?: UpsertGraphOptions): Promise<any>

  // Eager loading (lines 50-63)
  with(...relations: (string | Record<string, (qb: QueryBuilder) => void>)[]): QueryBuilder
  allowGraph(...paths: string[]): QueryBuilder

  // Scopes (lines 65-84)
  withTrashed(): QueryBuilder
  onlyTrashed(): QueryBuilder
  withoutTrashed(): QueryBuilder
  ignoreGlobalScopes(names?: string[]): QueryBuilder

  // Query methods (lines 86-115)
  all(): QueryBuilder
  where(column: string, operator: string, value?: unknown): QueryBuilder
  whereRef(col1: string, operator: string, col2: string): QueryBuilder
  orWhere(column: string, operator: string, value?: unknown): QueryBuilder
  whereIn(column: string, values: unknown[]): QueryBuilder
  orWhereIn(column: string, values: unknown[]): QueryBuilder
  whereNotIn(column: string, values: unknown[]): QueryBuilder
  whereNull(column: string): QueryBuilder
  whereNotNull(column: string): QueryBuilder
  orderBy(column: string, direction?: "asc" | "desc"): QueryBuilder
  limit(n: number): QueryBuilder
  offset(n: number): QueryBuilder
  select(...columns: string[]): QueryBuilder
  selectAll(table?: string): QueryBuilder
  innerJoin(table: string, lhs: string, rhs: string): QueryBuilder
  leftJoin(table: string, lhs: string, rhs: string): QueryBuilder
  groupBy(...columns: string[]): QueryBuilder
  having(column: string, operator: string, value: unknown): QueryBuilder
  when(condition: boolean, callback: (qb: QueryBuilder) => QueryBuilder): QueryBuilder
  unless(condition: boolean, callback: (qb: QueryBuilder) => QueryBuilder): QueryBuilder
  [key: string]: any  // index signature for dynamic methods
}
```

### Step 2: Create `query/builder.ts`

Move everything else from `query/index.ts` (lines 1-14 + 117-770). Replace `import type { ModelInstance } from "../model/types.js"` with `import type { QueryBuilder } from "./types.js"` (ModelInstance is already imported via ModelDefinition).

```ts
// builder.ts — createQueryBuilder implementation
import { sql as kyselySql } from "kysely"
import { ModelNotFoundError, RelationNotAllowedError, RelationNotFoundError } from "../errors.js"
import type { ModelDefinition, ModelInstance } from "../model/types.js"
import { type EagerLoad, EagerLoader } from "../relations/eager.js"
import type { InsertGraphOptions, UpsertGraphOptions } from "../relations/graph/index.js"
import { isRelationAllowed } from "../relations/graph/index.js"
import type { QueryBuilder } from "./types.js"

// ... copy everything from line 8 to 770 verbatim ...
// (rawSql, SAFE_COLUMN, createQueryBuilder closure with all helpers and self methods)
```

### Step 3: Create `query/index.ts` (barrel)

```ts
// index.ts — barrel
export type { QueryBuilder } from "./types.js"
export { createQueryBuilder } from "./builder.js"
```

### Step 4: Update `src/index.ts`

```ts
// Before:
export type { QueryBuilder } from "./query/index.js"
export { createQueryBuilder } from "./query/index.js"

// After:
export type { QueryBuilder } from "./query/types.js"
export { createQueryBuilder } from "./query/builder.js"
```

### Step 5: Remove old `query/index.ts` content

After creating the 3 new files, verify the barrel replaces the old file. The file at `query/index.ts` is overwritten by Step 3.

### Step 6: Verify

```bash
cd packages/orm
bun test            # 292 unit tests
bun test test/integration/  # 54 integration tests
bun run build       # build succeeds
bun run typecheck   # no type errors
```

## Delivery checklist

- [ ] `query/types.ts` created (101 lines, interface only)
- [ ] `query/builder.ts` created (654 lines, implementation only)  
- [ ] `query/index.ts` overwritten with 4-line barrel
- [ ] `src/index.ts` imports updated to new paths
- [ ] All 346 tests pass
- [ ] Build succeeds
