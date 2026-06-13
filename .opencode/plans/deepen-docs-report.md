# Deepen Review — peta-docs

**Project:** peta-docs v0.2.11 · **Files analyzed:** 10 source files · **Candidates found:** 5  
*Diagnostic lens: Evan You coding style · Seam vocabulary: Matt Pocock*

---

## Summary

| Strength | Count |
|----------|-------|
| 🟢 Strong | 3 |
| 🟡 Worth exploring | 2 |
| ⚪ Speculative | 0 |

**Health check:** The package has clean barrel files, zero `any` in production code, no string throws, and a well-structured pipeline (route → scan → spec → scalar UI). The friction is concentrated in two god files (`spec.ts:415`, `route.ts:488`), a duplicated validation pattern repeated 5x, and tight coupling between the core spec builder and the Hono adapter.

---

## Candidate 1 — Extract Standard Schema validation helper in `route.ts`

**Files:** `src/hono/route.ts` (5 occurrences)  
**Strength:** 🟢 Strong · **Effort:** Tiny · **Non-breaking**

**Principles:** Modular, Separation of concerns

### Problem
The same 5-line Standard Schema validation pattern is duplicated verbatim at 5 locations in `route.ts` (lines 61-72, 288-297, 313-318, 321-326, 449-453):

```ts
const result = await schema["~standard"].validate(value)
if (Array.isArray(result)) return onError(result, c)
const r = result as { issues?: Iterable<unknown>; value?: unknown }
if (r.issues) return onError([...r.issues], c)
if ("value" in r && r.value !== undefined) { ... }
```

The **deletion test** fails: delete the helper, and the complexity reappears 5 times across the file. Each duplicate is a maintenance hazard — if the Standard Schema spec changes, all 5 copies must be updated.

### Solution
Extract a `validateOrError` helper near the top of `route.ts`:

```ts
async function validateOrError<T>(
  schema: StandardSchemaV1<T>,
  value: unknown,
  c: Context,
  onError: ValidationErrorHandler,
): Promise<T | Response> {
  const result = await schema["~standard"].validate(value)
  if (Array.isArray(result)) return onError(result, c)
  const r = result as { issues?: Iterable<unknown>; value?: unknown }
  if (r.issues) return onError([...r.issues], c)
  if ("value" in r && r.value !== undefined) return r.value as T
  return value as T
}
```

Replace all 5 call sites with `const validated = await validateOrError(schema, value, c, onError)`.

### Benefits
- **Locality**: validation logic in one place
- **Leverage**: 5 call sites → 1 helper
- **Deletion test**: removing the helper would force 5 recreations
- **Effort**: ~5 minutes

---

## Candidate 2 — Decouple `spec.ts` from `hono/scanner.ts`

**Files:** `src/spec.ts` · `src/hono/scanner.ts` · `src/scanner.ts`  
**Strength:** 🟢 Strong · **Effort:** Small · **Non-breaking**

**Principles:** Separation of concerns, Modular

### Problem
`spec.ts` hard-imports `honoScanner` from `./hono/scanner.js` as the default scanner for `getOpenAPISpec`. This creates a tight coupling between the core spec-building module and the Hono framework adapter. Importing `spec.ts` transitively imports Hono types, even when no Hono app is present. The **deletion test**: deleting `hono/scanner.ts` would break `spec.ts`, even though `getOpenAPISpec` accepts an optional scanner parameter.

### Solution
Remove the hard import from `spec.ts`. Make the scanner a required parameter for `getOpenAPISpec`. Update the public API in `src/index.ts` to provide the Hono default at the adapter level:

```ts
// src/spec.ts — no longer imports hono/scanner
export function getOpenAPISpec(app: Hono, scanner?: RouteScanner): OpenAPIObject { ... }

// src/hono/index.ts — provides the default
export function getOpenAPISpec(app: Hono) {
  const doc = await buildOpenAPISpec(honoScanner.scan(app))
  return doc
}
```

### Benefits
- **Locality**: spec.ts is framework-agnostic
- **Leverage**: adding an Elysia scanner doesn't require touching spec.ts
- **Deletion test**: removing hono/scanner doesn't break spec.ts

---

## Candidate 3 — Extract comma-split-trim-filter pattern in `route.ts`

**Files:** `src/hono/route.ts` (3 occurrences: lines 309-311, 335-338, 353-356)  
**Strength:** 🟢 Strong · **Effort:** Tiny · **Non-breaking**

**Principles:** Modular, Minimal API

### Problem
The expression `.split(",").map((s) => s.trim()).filter(Boolean)` is duplicated 3 times in `route.ts` for parsing `include`, `sort`, and `filter` query parameters. Each copy is identical.

### Solution
Extract a helper:

```ts
function parseCommaSeparated(value: string | undefined): string[] {
  return value ? value.split(",").map((s) => s.trim()).filter(Boolean) : []
}
```

### Benefits
- **Locality**: the parsing logic lives in one place
- **Leverage**: 3 call sites → 1 helper
- **Effort**: ~2 minutes

---

## Candidate 4 — Split `spec.ts` into focused modules

**Files:** `src/spec.ts` (415 lines) · `test/index.test.ts`  
**Strength:** 🟡 Worth exploring · **Effort:** Medium · **Non-breaking**

**Principles:** Modular, Separation of concerns

### Problem
`spec.ts` is a 415-line god file with 3 public exports and 13 private helpers conflating: schema conversion (`toOpenAPISchema`), response normalization (`normalizeResponse`), request body normalization (`normalizeRequestBody`), path parsing (`honoPathToOpenAPI`, `parsePathParams`), operation ID auto-generation (`autoOperationId`), tag auto-detection (`autoTags`), parameter building, pagination/filter/sort/include/fieldset handling, and the main `buildOpenAPISpec` orchestrator. The **deletion test**: delete the file, and all spec-building disappears — but these concerns have different change frequencies.

### Solution
Split into a `spec/` directory:

```
spec/
├── index.ts       — barrel: re-exports buildOpenAPISpec, getOpenAPISpec, toOpenAPISchema
├── builder.ts     — buildOpenAPISpec orchestrator (+ getOpenAPISpec if kept)
├── schema.ts      — toOpenAPISchema, normalizeResponse, normalizeRequestBody
├── path.ts        — honoPathToOpenAPI, parsePathParams, autoOperationId, autoTags
└── parameters.ts  — pagination/filter/sort/include/fieldset parameter builders
```

### Benefits
- **Locality**: schema changes stay in schema.ts, path logic in path.ts
- **Leverage**: smaller focused modules with clear seams
- **Testability**: each sub-module independently testable

---

## Candidate 5 — Split `test/index.test.ts` into per-module test files

**Files:** `test/index.test.ts` (1,784 lines) · `test/hono/` (empty directory exists)  
**Strength:** 🟡 Worth exploring · **Effort:** Medium · **Non-breaking**

**Principles:** Modular, Locality

### Problem
The single 1,784-line test file covers all modules (route.ts, spec.ts, scanner.ts, loader.ts, scalar.ts). A test failure in route validation requires scrolling past spec tests. The `test/hono/` directory exists but is empty — the expected file structure was created but never populated. The **deletion test**: the file is so large that deleting it would lose all test coverage in one shot.

### Solution
Split into focused files matching the source structure:

```
test/
├── spec.test.ts          — buildOpenAPISpec + getOpenAPISpec + toOpenAPISchema
├── scalar.test.ts        — serveScalarUI
├── hono/
│   ├── route.test.ts     — RouteBuilder, validation, paginated, auth, filter, sort, include, fieldsets
│   ├── scanner.test.ts   — honoScanner
│   └── loader.test.ts    — loadRoutes
├── types-test.ts         — (keep as-is for compile-time checks)
└── index.test.ts         — integration tests only (reduce to ~50 lines)
```

### Benefits
- **Locality**: route tests in route.test.ts, spec tests in spec.test.ts
- **Leverage**: focused test files with clear ownership
- **Parallelism**: Bun can run test files in parallel

---

## 🏆 Top Recommendation

**Candidate 1 — Extract Standard Schema validation helper.** It eliminates 5 copies of the same 5-line validation pattern in <5 minutes, with immediate payoff: if the Standard Schema spec adds `~validate` or changes the return shape, one function changes instead of five.

*Effort: Tiny · Non-breaking · ~5 minutes*

---

## Which candidate would you like to explore?
