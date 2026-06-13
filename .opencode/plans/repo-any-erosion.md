# Plan: repo/index.ts `any` erosion

## Target: `packages/orm/src/repo/index.ts`
## Current: 13 `any` → Target: 5 `any` (8 reductions)

## Edits

1. **Line 42**: `function wrapQB(qb: QueryBuilder): any {` → `function wrapQB(qb: QueryBuilder): QueryBuilder {`
   - Proxy wraps a QueryBuilder; always used as one.

2. **Line 44**: `get(target: any, prop: string | symbol)` → `get(target: QueryBuilder, prop: string | symbol)`
   - Inner proxy receives a QueryBuilder via `wrapQB(qb)`.

3. **Line 55**: `as Function` → `as (...args: unknown[]) => unknown`
   - More precise than casting to `any → any`.

4. **Line 59**: `function (this: any, ...args: any[])` → `function (this: QueryBuilder, ...args: any[])`
   - Called as method on the QB proxy — `this` IS the QB.

5. **Line 70**: `new Proxy({} as any, {` → `new Proxy({} as Record<string, never>, {`
   - Empty target object, no dynamic props.

6. **Line 71**: `get(_target: any, prop: string | symbol)` → `get(_target: Record<string, never>, prop: string | symbol)`
   - Same empty object, never accessed.

7. **Line 82**: `as Function` → `as (...args: unknown[]) => unknown`
   - Same as #3.

8. **Line 87**: `(qb as any)[prop]` → `(qb as Record<string, unknown>)[prop]`
   - Dynamic prop access on QB.

## Verification
- `npx tsc --noEmit` — 0 errors
- `bun test` — 292 pass, 0 fail
