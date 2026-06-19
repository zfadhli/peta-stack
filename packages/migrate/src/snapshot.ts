import type { Column, ColumnShape, ModelDefinition } from "peta-orm"
import type { SchemaColumn, SchemaIndex, SchemaSnapshot, SchemaTable } from "./types.js"

/**
 * Extract a SchemaSnapshot from a map of model definitions.
 */
export function createSnapshot(models: Map<string, ModelDefinition>): SchemaSnapshot {
  const tables: SchemaTable[] = []

  for (const [, model] of models) {
    if (!model.table) continue

    const columns: SchemaColumn[] = []
    const indexes: SchemaIndex[] = []

    for (const [name, col] of Object.entries(model.columns)) {
      columns.push(columnToSchema(name, col))

      if (col.hasConstraint("index") && !col.isPrimaryKey && !col.isUnique) {
        indexes.push({
          name: `${model.table}_${name}_index`,
          columns: [name],
        })
      }
    }

    tables.push({ name: model.table, columns, indexes })
  }

  return { version: 1, tables }
}

function columnToSchema(name: string, col: Column): SchemaColumn {
  const refConstraint = col.constraints.find((c) => c.type === "references")
  let references: { table: string; column: string } | undefined

  if (refConstraint?.args[0]) {
    const targetClass = typeof refConstraint.args[0] === "function"
      ? (refConstraint.args[0] as () => unknown)()
      : refConstraint.args[0]
    const targetTable = (targetClass as Record<string, unknown>)?.table as string | undefined
    const targetColumns = refConstraint.args[1] as string[] | undefined
    if (typeof targetTable === "string" && targetTable && targetColumns?.length) {
      const first = targetColumns[0]
      if (first) {
        references = { table: targetTable, column: first }
      }
    }
  }

  return {
    name,
    type: mapSnapshotType(col),
    isNullable: col.isNullable ?? false,
    isPrimaryKey: col.isPrimaryKey ?? false,
    isUnique: col.isUnique ?? false,
    defaultValue: col.defaultValue,
    references,
  }
}

function mapSnapshotType(col: Column): string {
  switch (col.dataType) {
    case "integer":
    case "smallint":
    case "bigint":
    case "text":
    case "boolean":
    case "timestamp":
    case "date":
    case "float":
    case "double":
    case "uuid":
      return col.dataType
    case "string": {
      const max = col.args[0] as number | undefined
      return max != null ? `varchar(${max})` : "varchar"
    }
    case "json":
    case "jsonb":
      return "json"
    case "decimal": {
      const p = col.args[0] as number | undefined
      const s = col.args[1] as number | undefined
      return p != null ? `decimal(${p}, ${s ?? 0})` : "decimal"
    }
    case "enum":
      return "text"
    default:
      return col.dataType
  }
}

/**
 * Load snapshot from a JSON file path.
 */
export async function loadSnapshot(filePath: string): Promise<SchemaSnapshot | null> {
  try {
    const { readFileSync } = await import("node:fs")
    const data = readFileSync(filePath, "utf-8")
    return JSON.parse(data) as SchemaSnapshot
  } catch {
    return null
  }
}

/**
 * Save snapshot to a JSON file path.
 */
export async function saveSnapshot(filePath: string, snapshot: SchemaSnapshot): Promise<void> {
  const { writeFileSync } = await import("node:fs")
  writeFileSync(filePath, JSON.stringify(snapshot, null, 2))
}
