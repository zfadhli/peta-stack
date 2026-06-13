# Fix Critical ORM Bugs

## Overview

Six bugs to fix in `packages/orm/src/`. All are in production-critical paths (relations, error handling, query building). Fixes are surgical — each changes <10 lines.

---

## Fix 1: `manyToMany.query()` callback never executed

**File:** `src/relations/many-to-many.ts`, lines 80–88

**Problem:** Passes a callback as second arg to `createQueryBuilder(rel, callback)`, but that arg is typed as the ORM instance and silently ignored. The JOIN and WHERE are never applied.

**Fix:** Replace with the same pattern `hasMany.query()` uses — create the builder first, then apply constraints directly.

```ts
// BEFORE:
query(parent: ModelInstance): ReturnType<typeof createQueryBuilder> {
  const rel = getRelated()
  const pkValue = parent.get(localKey)
  if (pkValue == null) return createQueryBuilder(rel, (qb: any) => qb.where(localKey, "=", -1))
  return createQueryBuilder(rel, (qb: any) => {
    qb.innerJoin(throughTable, `${rel.table}.${localKey}`, `${throughTable}.${relatedPivotKey}`)
    qb.where(`${throughTable}.${foreignPivotKey}`, "=", pkValue)
  })
},

// AFTER:
query(parent: ModelInstance): ReturnType<typeof createQueryBuilder> {
  const rel = getRelated()
  const pkValue = parent.get(localKey)
  const qb = createQueryBuilder(rel)
  if (pkValue == null) {
    qb.where(localKey, "=", -1)
    return qb
  }
  qb.innerJoin(throughTable, `${rel.table}.${localKey}`, `${throughTable}.${relatedPivotKey}`)
  qb.where(`${throughTable}.${foreignPivotKey}`, "=", pkValue)
  return qb
},
```

---

## Fix 2: `hasManyThrough.query()` callback never executed

**File:** `src/relations/many-to-many.ts`, lines 200–208

**Problem:** Same as Fix 1 — callback passed to `createQueryBuilder` is never executed.

**Fix:** Same pattern as Fix 1.

```ts
// BEFORE:
query(parent: ModelInstance): ReturnType<typeof createQueryBuilder> {
  const pkValue = parent.get(localKey)
  if (pkValue == null) return createQueryBuilder(related, (qb: any) => qb.where(localKey, "=", -1))
  return createQueryBuilder(related, (qb: any) => {
    qb.innerJoin(through.table, `${through.table}.${throughLocalKey}`, `${related.table}.${throughForeignKey}`)
    qb.where(`${through.table}.${foreignKey}`, "=", pkValue)
  })
},

// AFTER:
query(parent: ModelInstance): ReturnType<typeof createQueryBuilder> {
  const pkValue = parent.get(localKey)
  const qb = createQueryBuilder(related)
  if (pkValue == null) {
    qb.where(localKey, "=", -1)
    return qb
  }
  qb.innerJoin(through.table, `${through.table}.${throughLocalKey}`, `${related.table}.${throughForeignKey}`)
  qb.where(`${through.table}.${foreignKey}`, "=", pkValue)
  return qb
},
```

---

## Fix 3: `defineMorphMany.query()` callback never executed

**File:** `src/relations/morph.ts`, lines 294–298

**Problem:** Same callback bug.

**Fix:**
```ts
// BEFORE:
query(parent: ModelInstance): ReturnType<typeof createQueryBuilder> {
  return createQueryBuilder(related, (qb: any) => {
    qb.where(morphId, "=", parent.get("id"))
    qb.where(morphType, "=", typeValue)
  })
},

// AFTER:
query(parent: ModelInstance): ReturnType<typeof createQueryBuilder> {
  const qb = createQueryBuilder(related)
  qb.where(morphId, "=", parent.get("id"))
  qb.where(morphType, "=", typeValue)
  return qb
},
```

---

## Fix 4: `SAFE_COLUMN` regex rejects `table.*`

**File:** `src/query/index.ts`, line 13

**Problem:** `SAFE_COLUMN = /^[a-zA-Z_][a-zA-Z0-9_.]*$/` does not allow `*`. The `loadEager` method in many-to-many generates `selectCols = ["tags.*"]` which hits `validateColumn("tags.*")` → throws.

**Fix:** Widen the regex to allow `*`:
```ts
const SAFE_COLUMN = /^[a-zA-Z_*][a-zA-Z0-9_.*]*$/
```

Note: `orderBy` and `groupBy` also use `validateColumn` — `*` doesn't make sense there, but regex widening doesn't hurt since those wouldn't naturally get `*` values.

---

## Fix 5: MySQL error codes in `normalizeError()`

**File:** `src/errors.ts`, after line 117 (before the default `UNKNOWN` return)

**Problem:** `normalizeError()` handles SQLite and PostgreSQL error codes but not MySQL.

**Fix:** Add MySQL error codes:
```ts
// MySQL error codes
if (raw.code === "ER_DUP_ENTRY" || raw.errno === 1062) {
  return new DatabaseError(msg, "UNIQUE_CONSTRAINT", table, msg)
}
if (raw.code === "ER_NO_REFERENCED_ROW_2" || raw.errno === 1452) {
  return new DatabaseError(msg, "FOREIGN_KEY_CONSTRAINT", table, msg)
}
if (raw.code === "ER_BAD_NULL_ERROR" || raw.errno === 1048) {
  return new DatabaseError(msg, "NOT_NULL_CONSTRAINT", table, msg)
}
```

Place these between the PostgreSQL block (ends at line 117) and the fallback `UNKNOWN` return (line 119).

---

## Fix 6: Dialect-agnostic error handling in `attach()` and `syncWithoutDetaching()`

**File:** `src/relations/related-query.ts`

### 6a: `attach()` (line 118–121)

**Problem:** Only catches `SQLITE_CONSTRAINT_UNIQUE` — MySQL `ER_DUP_ENTRY` and PG `23505` propagate as unhandled errors.

**Fix:** Check for all unique constraint codes:
```ts
catch (e: any) {
  const isDuplicate =
    e?.code === "SQLITE_CONSTRAINT_UNIQUE" ||
    e?.code === "SQLITE_CONSTRAINT" ||
    e?.code === "23505" ||       // PostgreSQL
    e?.code === "ER_DUP_ENTRY" || // MySQL
    e?.errno === 1062            // MySQL (numeric)
  if (!isDuplicate) throw e
}
```

### 6b: `syncWithoutDetaching()` (lines 209–214)

**Problem:** Empty `catch {}` swallows ALL errors, including real failures like FK violations.

**Fix:** Same as attach — only swallow duplicates:
```ts
catch {
  // Skip if already attached — ignore unique violations
}
```
becomes:
```ts
catch (e: any) {
  const isDuplicate =
    e?.code === "SQLITE_CONSTRAINT_UNIQUE" ||
    e?.code === "SQLITE_CONSTRAINT" ||
    e?.code === "23505" ||
    e?.code === "ER_DUP_ENTRY" ||
    e?.errno === 1062
  if (!isDuplicate) throw e
}
```

---

## Verification

After all fixes, run:
```bash
cd packages/orm
bun test                    # 292 unit tests (still pass)
bun test test/integration/  # 54 integration tests (many-to-many now works correctly)
```

Also verify the build:
```bash
bun run build
```
