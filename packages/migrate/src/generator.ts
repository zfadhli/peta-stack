import type { Column, ColumnShape, ModelDefinition } from "peta-orm"
import type { SchemaColumn, SchemaDiff } from "./types.js"

export interface GeneratorOptions {
  name?: string
}

export interface MigrationGenerator {
  generateInitialMigration(models: Map<string, ModelDefinition>, options?: GeneratorOptions): string
  generateMigrationFromDiff(diffs: SchemaDiff[], options?: GeneratorOptions): string
}

export function createMigrationGenerator(): MigrationGenerator {
  function generateInitialMigration(models: Map<string, ModelDefinition>, _options: GeneratorOptions = {}): string {
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

  function generateMigrationFromDiff(diffs: SchemaDiff[], _options: GeneratorOptions = {}): string {
    const upParts: string[] = []
    const downParts: string[] = []
    const warnings: string[] = []

    for (const diff of diffs) {
      switch (diff.type) {
        case "createTable": {
          const cols = (diff.details?.columns ?? []) as SchemaColumn[]
          const indexes = (diff.details?.indexes ?? []) as Array<{ name: string; columns: string[] }>
          upParts.push(generateCreateTableFromSchema(diff.table, cols))
          for (const idx of indexes) {
            upParts.push(generateCreateIndexFromSchema(diff.table, idx.name, idx.columns))
          }
          downParts.push(`  await db.schema.dropTable("${diff.table}").ifExists().execute()`)
          break
        }
        case "dropTable": {
          upParts.push(`  await db.schema.dropTable("${diff.table}").ifExists().execute()`)
          downParts.push(`  // ⚠ Cannot auto-restore dropped table "${diff.table}" — manual recovery needed`)
          warnings.push(`// ⚠ Dropped table "${diff.table}". The down() function cannot restore it.`)
          break
        }
        case "addColumn": {
          const col = diff.details as unknown as SchemaColumn
          upParts.push(
            `  await db.schema.alterTable("${diff.table}").addColumn("${col.name}", "${col.type}"${columnCallbackFromSchema(col)}).execute()`,
          )
          downParts.push(`  await db.schema.alterTable("${diff.table}").dropColumn("${col.name}").execute()`)
          break
        }
        case "dropColumn": {
          upParts.push(`  await db.schema.alterTable("${diff.table}").dropColumn("${diff.column}").execute()`)
          downParts.push(
            `  // ⚠ Cannot auto-restore dropped column "${diff.table}.${diff.column}" — manual recovery needed`,
          )
          warnings.push(`// ⚠ Dropped column "${diff.table}.${diff.column}". The down() function cannot restore it.`)
          break
        }
        case "alterColumn": {
          const details = diff.details as { from: SchemaColumn; to: SchemaColumn } | undefined
          upParts.push(`  // ⚠ ALTER COLUMN "${diff.table}.${diff.column}" — manual review recommended`)
          if (details) {
            upParts.push(`  //   from: ${details.from.type} → to: ${details.to.type}`)
            upParts.push(`  //   nullable: ${details.from.isNullable} → ${details.to.isNullable}`)
          }
          upParts.push(
            `  await db.schema.alterTable("${diff.table}").alterColumn("${diff.column}", (col) => col.setDataType("${details?.to.type ?? "text"}")).execute()`,
          )
          warnings.push(`// ⚠ ALTER COLUMN "${diff.table}.${diff.column}". Down migration is not auto-generated.`)
          break
        }
        case "addIndex": {
          const idxDetails = diff.details as { indexName?: string; columns?: string[] } | undefined
          const idxName = idxDetails?.indexName ?? `${diff.table}_${diff.column ?? "idx"}_index`
          const idxCols = idxDetails?.columns ?? (diff.column ? [diff.column] : [])
          upParts.push(generateCreateIndexFromSchema(diff.table, idxName, idxCols))
          downParts.push(`  await db.schema.dropIndex("${idxName}").ifExists().execute()`)
          break
        }
        case "dropIndex": {
          const idxDetails = diff.details as { indexName?: string } | undefined
          const idxName = idxDetails?.indexName ?? `${diff.table}_idx`
          upParts.push(`  await db.schema.dropIndex("${idxName}").ifExists().execute()`)
          downParts.push(`  // ⚠ Cannot auto-restore dropped index "${idxName}" — manual recovery needed`)
          warnings.push(`// ⚠ Dropped index "${idxName}". The down() function cannot restore it.`)
          break
        }
      }
    }

    const upBody = upParts.join("\n\n")
    const downBody = downParts.join("\n\n")
    const warningBlock = warnings.length > 0 ? `  // Warnings:\n${warnings.join("\n")}\n\n` : ""

    return `import type { Kysely } from "kysely"\nimport { sql } from "kysely"\n\nexport async function up(db: Kysely<any>): Promise<void> {\n${warningBlock}${upBody}\n}\n\nexport async function down(db: Kysely<any>): Promise<void> {\n${downBody}\n}\n`
  }

  return { generateInitialMigration, generateMigrationFromDiff }
}

// ─── Create table from ModelDefinition columns ──────────────

function generateCreateTable(table: string, columns: ColumnShape): string {
  const lines = [`  await db.schema.createTable("${table}").ifNotExists()`]
  for (const [name, col] of Object.entries(columns))
    lines.push(`    .addColumn("${name}", "${mapType(col)}"${columnCallback(col)})`)
  lines.push("    .execute()")
  return lines.join("\n")
}

// ─── Create table from SchemaColumn ─────────────────────────

function generateCreateTableFromSchema(table: string, columns: SchemaColumn[]): string {
  const lines = [`  await db.schema.createTable("${table}").ifNotExists()`]
  for (const col of columns) {
    const ref = col.references ? `, (c) => c.references("${col.references.table}.${col.references.column}")` : ""
    const extras: string[] = []
    if (col.isPrimaryKey) extras.push("primaryKey()")
    if (!col.isNullable && !col.isPrimaryKey) extras.push("notNull()")
    if (col.isUnique && !col.isPrimaryKey) extras.push("unique()")
    if (col.defaultValue !== undefined && col.defaultValue !== null) {
      extras.push(`defaultTo(${JSON.stringify(col.defaultValue)})`)
    }
    const cb = extras.length > 0 ? `, (c) => c.${extras.join(".")}${ref ? `.${ref.slice(5)}` : ""}` : ref
    lines.push(`    .addColumn("${col.name}", "${col.type}"${cb})`)
  }
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

function generateCreateIndexFromSchema(table: string, indexName: string, columns: string[]): string {
  const lines = [`  await db.schema.createIndex("${indexName}").on("${table}")`]
  for (const col of columns) {
    lines.push(`    .column("${col}")`)
  }
  lines.push("    .execute()")
  return lines.join("\n")
}

// ─── Column helpers ─────────────────────────────────────────

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

function columnCallbackFromSchema(col: SchemaColumn): string {
  const calls: string[] = []
  if (col.isPrimaryKey) {
    calls.push("primaryKey()")
  }
  if (!col.isNullable && !col.isPrimaryKey) calls.push("notNull()")
  if (col.defaultValue !== undefined && col.defaultValue !== null && typeof col.defaultValue !== "function")
    calls.push(`defaultTo(${JSON.stringify(col.defaultValue)})`)
  if (col.isUnique && !col.isPrimaryKey) calls.push("unique()")
  if (col.references) {
    calls.push(`references("${col.references.table}.${col.references.column}")`)
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
