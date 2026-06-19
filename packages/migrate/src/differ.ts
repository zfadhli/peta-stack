import type { SchemaColumn, SchemaDiff, SchemaIndex, SchemaSnapshot, SchemaTable } from "./types.js"

/**
 * Compare two SchemaSnapshots and produce a list of SchemaDiff operations.
 * Compares `prev` (old) vs `next` (new) to generate a migration plan.
 */
export function diffSnapshots(prev: SchemaSnapshot, next: SchemaSnapshot): SchemaDiff[] {
  const diffs: SchemaDiff[] = []
  const prevTables = new Map(prev.tables.map((t) => [t.name, t]))
  const nextTables = new Map(next.tables.map((t) => [t.name, t]))

  // Dropped tables
  for (const [name] of prevTables) {
    if (!nextTables.has(name)) {
      diffs.push({ type: "dropTable", table: name })
    }
  }

  // Created tables
  for (const [name, table] of nextTables) {
    if (!prevTables.has(name)) {
      diffs.push({ type: "createTable", table: name, details: { columns: table.columns, indexes: table.indexes } })
    }
  }

  // Modified tables
  for (const [name, nextTable] of nextTables) {
    const prevTable = prevTables.get(name)
    if (!prevTable) continue
    const tableDiffs = diffTable(prevTable, nextTable)
    diffs.push(...tableDiffs)
  }

  return diffs
}

function diffTable(prev: SchemaTable, next: SchemaTable): SchemaDiff[] {
  const diffs: SchemaDiff[] = []
  const prevColumns = new Map(prev.columns.map((c) => [c.name, c]))
  const nextColumns = new Map(next.columns.map((c) => [c.name, c]))

  // Dropped columns
  for (const [name] of prevColumns) {
    if (!nextColumns.has(name)) {
      diffs.push({ type: "dropColumn", table: prev.name, column: name })
    }
  }

  // Added columns
  for (const [name, col] of nextColumns) {
    if (!prevColumns.has(name)) {
      diffs.push({ type: "addColumn", table: prev.name, column: name, details: { ...col } })
    }
  }

  // Altered columns
  for (const [name, nextCol] of nextColumns) {
    const prevCol = prevColumns.get(name)
    if (!prevCol) continue
    if (columnsDiffer(prevCol, nextCol)) {
      diffs.push({
        type: "alterColumn",
        table: prev.name,
        column: name,
        details: { from: prevCol, to: nextCol },
      })
    }
  }

  // Index diffs
  const prevIndexes = new Map(prev.indexes.map((i) => [i.name, i]))
  const nextIndexes = new Map(next.indexes.map((i) => [i.name, i]))

  for (const [name] of prevIndexes) {
    if (!nextIndexes.has(name)) {
      diffs.push({ type: "dropIndex", table: prev.name, details: { indexName: name } })
    }
  }
  for (const [name, idx] of nextIndexes) {
    if (!prevIndexes.has(name)) {
      diffs.push({
        type: "addIndex",
        table: prev.name,
        details: { indexName: name, columns: idx.columns, unique: idx.unique },
      })
    }
  }

  return diffs
}

function columnsDiffer(a: SchemaColumn, b: SchemaColumn): boolean {
  if (a.type !== b.type) return true
  if (a.isNullable !== b.isNullable) return true
  if (a.isPrimaryKey !== b.isPrimaryKey) return true
  if (a.isUnique !== b.isUnique) return true
  if (JSON.stringify(a.defaultValue) !== JSON.stringify(b.defaultValue)) return true
  if (JSON.stringify(a.references) !== JSON.stringify(b.references)) return true
  return false
}
