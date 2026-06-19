import type { Kysely } from "kysely"
import type { Column, ColumnShape, ModelDefinition } from "peta-orm"

/**
 * Push current model schema directly to the database.
 * Creates tables and columns that don't exist yet (no destructive changes).
 * Returns list of tables that were created.
 */
export async function pushSchema(db: Kysely<unknown>, models: Map<string, ModelDefinition>): Promise<string[]> {
  const createdTables: string[] = []

  for (const [, model] of models) {
    if (!model.table) continue
    if (await tableExists(db, model.table)) continue

    let qb = db.schema.createTable(model.table).ifNotExists()
    const columns = model.columns as ColumnShape

    for (const [name, col] of Object.entries(columns)) {
      qb = qb.addColumn(name, mapPushType(col) as any, (cb: any) => buildColumn(col, cb))
    }

    await qb.execute()
    createdTables.push(model.table)

    // Create non-PK, non-unique indexes
    for (const [colName, col] of Object.entries(columns)) {
      if (col.hasConstraint("index") && !col.isPrimaryKey && !col.isUnique) {
        await db.schema.createIndex(`${model.table}_${colName}_index`).on(model.table).column(colName).execute()
      }
    }
  }

  return createdTables
}

async function tableExists(db: Kysely<unknown>, name: string): Promise<boolean> {
  try {
    const tables = await db.introspection.getTables({ withInternalKyselyTables: true })
    return tables.some((t) => t.name === name)
  } catch {
    return false
  }
}

function buildColumn(col: Column, cb: any): any {
  if (col.isPrimaryKey) {
    if (col.dataType === "integer") cb = cb.autoIncrement()
    cb = cb.primaryKey()
  }
  if (!col.isNullable && !col.isPrimaryKey) cb = cb.notNull()
  if (col.defaultValue !== undefined && typeof col.defaultValue !== "function") {
    cb = cb.defaultTo(col.defaultValue)
  }
  if (col.isUnique && !col.isPrimaryKey) cb = cb.unique()

  const refConstraint = col.constraints.find((c) => c.type === "references")
  if (refConstraint?.args[0]) {
    const targetClass =
      typeof refConstraint.args[0] === "function" ? (refConstraint.args[0] as () => unknown)() : refConstraint.args[0]
    const targetTable = (targetClass as Record<string, unknown>)?.table as string | undefined
    const targetColumns = refConstraint.args[1] as string[] | undefined
    if (typeof targetTable === "string" && targetTable && targetColumns?.length) {
      const first = targetColumns[0]
      if (first) cb = cb.references(`${targetTable}.${first}`)
    }
  }

  return cb
}

function mapPushType(col: Column): string {
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
