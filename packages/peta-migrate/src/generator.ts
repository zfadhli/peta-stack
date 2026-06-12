import type { Column, ColumnShape, ModelDefinition } from "peta-orm"

export interface GeneratorOptions {
  name?: string
}
export interface MigrationGenerator {
  generateInitialMigration(models: Map<string, ModelDefinition>, options?: GeneratorOptions): string
}

export function createMigrationGenerator(): MigrationGenerator {
  function generateInitialMigration(models: Map<string, ModelDefinition>, options: GeneratorOptions = {}): string {
    const _name = options.name ?? "Initial"
    const parts: string[] = []
    const indexParts: string[] = []
    const warnings: string[] = []
    const registeredTables = new Set([...models.values()].map((m) => m.table).filter(Boolean))
    for (const [, modelDef] of models) {
      const table = modelDef.table
      if (!table) continue
      parts.push(generateCreateTable(table, modelDef.columns))
      for (const [colName, col] of Object.entries(modelDef.columns)) {
        if (col.hasConstraint("index") && !col.isPrimaryKey && !col.isUnique)
          indexParts.push(generateCreateIndex(table, colName))
      }
      for (const [, rel] of Object.entries(modelDef.relations ?? {})) {
        if (rel.type === "manyToMany") {
          const through = (rel as unknown as { throughTable?: string }).throughTable
          if (through && !registeredTables.has(through)) {
            warnings.push(
              `// ⚠ Detected ManyToMany "${modelDef.name}" references table "${through}" but no model is registered for it.\n//   Add a model to include the pivot table.`,
            )
          }
        }
      }
    }
    const upBody = [...parts, ...indexParts].join("\n\n")
    const downTables = [...models.values()]
      .filter((m) => m.table)
      .map((m) => `  await db.schema.dropTable("${m.table}").ifExists().execute()`)
      .join("\n")
    const warningBlock = warnings.length > 0 ? `  // Warnings:\n${warnings.join("\n")}\n\n` : ""
    return `import type { Kysely } from "kysely"\nimport { sql } from "kysely"\n\nexport async function up(db: Kysely<any>): Promise<void> {\n${warningBlock}${upBody}\n}\n\nexport async function down(db: Kysely<any>): Promise<void> {\n${downTables}\n}\n`
  }
  return { generateInitialMigration }
}

function generateCreateTable(table: string, columns: ColumnShape): string {
  const lines = [`  await db.schema.createTable("${table}").ifNotExists()`]
  for (const [name, col] of Object.entries(columns))
    lines.push(`    .addColumn("${name}", "${mapType(col)}"${columnCallback(col)})`)
  lines.push("    .execute()")
  return lines.join("\n")
}

function generateCreateIndex(table: string, column: string): string {
  return [
    `  await db.schema.createIndex("${table}_${column}_index")`,
    `    .on("${table}")`,
    `    .column("${column}")`,
    "    .execute()",
  ].join("\n")
}

function columnCallback(col: Column): string {
  const calls: string[] = []
  if (col.isPrimaryKey) {
    if (col.dataType === "integer") calls.push("autoIncrement()")
    calls.push("primaryKey()")
  }
  if (!col.isNullable && !col.isPrimaryKey) calls.push("notNull()")
  const dv = col.defaultValue
  if (dv !== undefined && typeof dv !== "function") calls.push(`defaultTo(${JSON.stringify(dv)})`)
  if (col.isUnique && !col.isPrimaryKey) calls.push("unique()")
  const refConstraint = col.constraints.find((c) => c.type === "references")
  if (refConstraint?.args[0]) {
    const targetClass = typeof refConstraint.args[0] === "function" ? refConstraint.args[0]() : refConstraint.args[0]
    const targetTable = (targetClass as Record<string, unknown>)?.table as string | undefined
    const targetColumns = refConstraint.args[1] as string[] | undefined
    if (typeof targetTable === "string" && targetTable && targetColumns?.length)
      calls.push(`references("${targetTable}.${targetColumns[0]}")`)
  }
  return calls.length === 0 ? "" : `, (c) => c.${calls.join(".")}`
}

function mapType(col: Column): string {
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
      const max = col.args[0]
      return max != null ? `varchar(${max})` : "varchar"
    }
    case "json":
    case "jsonb":
      return "json"
    case "decimal": {
      const p = col.args[0]
      const s = col.args[1]
      return p != null ? `decimal(${p}, ${s ?? 0})` : "decimal"
    }
    case "enum":
      return "text"
    default:
      return col.dataType
  }
}
