# Deepen Review — peta-orm

**Project:** peta-orm · **Files analyzed:** 56 · **Source lines:** ~6,874 · **Candidates found:** 6  
*Diagnostic lens: Evan You coding style · Seam vocabulary: Matt Pocock*

---

## Summary

| Strength | Count |
|----------|-------|
| 🟢 Strong | 3 |
| 🟡 Worth exploring | 2 |
| ⚪ Speculative | 1 |

---

## Candidate 1 — Split `relations/graph.ts` → `relations/graph/`

**Files:** `relations/graph.ts` (1077 lines) · `relations/morph.ts`  
**Strength:** 🟢 Strong · **Effort:** Medium · **Non-breaking**

**Principles:** Modular, Separation of concerns

### Problem
1077-line god file handling 5+ distinct concerns: #id/#ref graph parsing, morph resolution, insert orchestration, upsert orchestration, allow-graph security. The **deletion test** fails: complexity is concentrated but in one monolithic file with no **seam** between concerns. A change to graph parsing risks leaking into upsert logic and vice versa.

### Solution
Split into:
- `relations/graph/parser.ts` — graph data structure + #id/#ref/#dbRef resolution
- `relations/graph/insert.ts` — insertGraph orchestration
- `relations/graph/upsert.ts` — upsertGraph orchestration
- `relations/graph/security.ts` — allowGraph whitelist validation

Each has a focused **interface** and clear **seam** for testing.

### Benefits
- **Locality**: insert bug fixes stay in insert.ts
- **Leverage**: each sub-module exposes a minimal interface
- **Deletion test**: each module can be tested independently

### Before/After

```
Before:                           After:
relations/morph.ts ─┐             graph/parser.ts ─┐
query/index.ts ─────┤             graph/insert.ts ─┤
model/index.ts ─────┤             graph/upsert.ts ─┤
                    ▼             graph/security.ts ┤
           relations/graph.ts                     ▼
           1077 lines, 5+              graph/index.ts (barrel)
           concerns mixed                    → consumers
```

---

## Candidate 2 — Split `query/index.ts` → `query/types.ts` + `query/builder.ts`

**Files:** `query/index.ts` (770 lines)  
**Strength:** 🟢 Strong · **Effort:** Medium · **Non-breaking**

**Principles:** Modular, Minimal API

### Problem
770-line file doing double duty as interface definition AND implementation. The `QueryBuilder` interface (115 lines) is defined inline above `createQueryBuilder` (650 lines). No **seam** — consumers who only need the interface must import from the file that contains the full implementation. Crosses 5 concern boundaries: query building, mutation safety, eager loading delegation, pagination, soft-delete scope filtering.

### Solution
Extract `QueryBuilder` interface → `query/types.ts`. Keep implementation in `query/builder.ts`. `query/index.ts` becomes a pure barrel. This creates a clean **seam** between contract and implementation. The **deletion test** passes: you could swap the implementation without touching consumers.

---

## Candidate 3 — Eliminate mutable `wireDeps` pattern

**Files:** `model/factory.ts` · `model/index.ts` · `model/serialize.ts` · `model/relation.ts`  
**Strength:** 🟢 Strong · **Effort:** Medium · **Breaking** (internal)

**Principles:** Strict TS, Separation of concerns

### Problem
8 mutable `let` variables initialized as `undefined as any` in factory.ts, set via `wireDeps()` called from model/index.ts. Creates bidirectional dependency, bypasses TS with `as any`, introduces runtime ordering constraint. The **interface is not a contract** — callers can't trust types because values might still be `undefined` at runtime.

### Solution
Replace with a **registry pattern**: create a `ModelRuntime` object with properly typed methods initialized once at module load time. Each submodule exports its functions and the registry collects them. Gives callers a proper **seam** and eliminates the `as any` escape hatch.

---

## Candidate 4 — Add typed `_morph*` properties to `Relation` interface

**Files:** `relations/base.ts` · `relations/morph.ts` · `relations/graph.ts`  
**Strength:** 🟡 Worth exploring · **Effort:** Small · **Non-breaking**

**Principles:** Strict TS, Minimal API

### Problem
`graph.ts` accesses morph metadata via `(relation as any)._morphMap`, `_morphType`, `_morphId`, `_morphTypeValue`. The `Relation` interface doesn't declare these, forcing `as any` access. The **interface is not a contract** — 4+ casts originate from this single gap.

### Solution
Add optional typed properties to `Relation`:

```ts
interface Relation {
  type: RelationType
  _morphMap?: Record<string, ModelDefinition>
  _morphType?: string
  _morphId?: string
  _morphTypeValue?: string
  // ...existing props
}
```

The morph functions already set these — they just need type declarations.

---

## Candidate 5 — Extract `normalizeError` from `errors.ts`

**Files:** `errors.ts` (136 lines)  
**Strength:** 🟡 Worth exploring · **Effort:** Small · **Non-breaking**

**Principles:** Modular, Separation of concerns

### Problem
`errors.ts` conflates two concerns: error class definitions (6 classes, 45 lines) and a multi-dialect SQL error normalizer (`normalizeError`, 90 lines with hardcoded codes for SQLite, PostgreSQL, and MySQL). **Deletion test**: delete normalizer, save/delete paths break; delete error classes, typed catch blocks break. Different rates of change.

### Solution
Extract `normalizeError` + `DatabaseErrorCode` into `errors/normalizer.ts`. Keep error classes in `errors.ts` as barrel. The normalizer becomes the **seam** for dialect-specific error handling.

---

## Candidate 6 — Move `defineModel` to `model/define.ts`

**Files:** `model/index.ts` (221 lines)  
**Strength:** ⚪ Speculative · **Effort:** Small · **Non-breaking**

**Principles:** Modular, Minimal API

### Problem
`model/index.ts` is a non-pure barrel: it both re-exports AND defines the 135-line `defineModel()` factory with `wireDeps()` side effects, static hook delegation, and computed config setup. The **interface is noisy** — consumers who only need a type must import from a file that triggers `wireDeps` side effects.

### Solution
Extract `defineModel` into `model/define.ts`. Make `model/index.ts` a pure barrel re-exporting from `define.ts`, `types.ts`, `state.ts`, etc.

---

## 🏆 Top Recommendation

**Candidate 1 — Split `relations/graph.ts`.** A 1077-line god file is the single biggest source of architectural risk in the ORM. It is the deepest module (hides the most complexity behind a small interface) but has no internal **seams**. Splitting into `graph/parser.ts`, `graph/insert.ts`, `graph/upsert.ts`, and `graph/security.ts` would immediately improve **locality** and enable targeted unit testing. This is the highest-leverage change: one split gives four independently-testable modules and eliminates the primary source of `as any` casts (19 casts for morph metadata access).

*Effort: Medium · Non-breaking · Estimated 2-3 hours*

---

## Which candidate would you like to explore?
