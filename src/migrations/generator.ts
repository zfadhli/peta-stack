import { Column } from "../columns/column"
import type { ColumnShape } from "../columns/column"
import type { ModelClass } from "../model/model"
import { ManyToMany } from "../relations/relation"

export interface GeneratorOptions {
  name?: string
}

export class MigrationGenerator {
  generateInitialMigration(models: Map<string, ModelClass>, options: GeneratorOptions = {}): string {
    const name = options.name ?? "Initial"
    const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14)
    const parts: string[] = []
    const indexParts: string[] = []
    const warnings: string[] = []

    const registeredTables = new Set([...models.values()].map((m) => m.table).filter(Boolean))

    for (const [, modelClass] of models) {
      const table = modelClass.table
      if (!table) continue
      const cols = modelClass.columns

      parts.push(this.#generateCreateTable(table, cols))

      for (const [colName, col] of Object.entries(cols)) {
        if (col.hasConstraint("index") && !col.isPrimaryKey && !col.isUnique) {
          indexParts.push(this.#generateCreateIndex(table, colName))
        }
      }

      // Warn about ManyToMany pivot tables without a registered model
      for (const [relName, rel] of Object.entries(modelClass.relations ?? {})) {
        if (rel instanceof ManyToMany) {
          const through = rel.throughTable
          if (!registeredTables.has(through)) {
            warnings.push(
              `// ⚠ Detected ManyToMany "${modelClass.name}.${relName}" references table "${through}" ` +
                `but no model is registered for it.\n` +
                `//   Add a model class with static override table = "${through}" to include the pivot ` +
                `table in the generated migration.`,
            )
          }
        }
      }
    }

    const upBody = [...parts, ...indexParts].join("\n\n")
    const downTables = [...models.values()]
      .filter((m) => m.table)
      .map((m) => `  await db.schema.dropTable("${m.table}").ifExists().execute()`)

    const warningBlock = warnings.length > 0 ? `  // Warnings:\n${warnings.join("\n")}\n\n` : ""

    return `import type { Kysely } from "kysely"
import { sql } from "kysely"

export async function up(db: Kysely<any>): Promise<void> {
${warningBlock}${upBody}
}

export async function down(db: Kysely<any>): Promise<void> {
${downTables.join("\n")}
}
`
  }

  #generateCreateTable(table: string, columns: ColumnShape): string {
    const lines: string[] = []
    lines.push(`  await db.schema.createTable("${table}").ifNotExists()`)

    for (const [name, col] of Object.entries(columns)) {
      const typeSql = this.#mapType(col)
      const cb = this.#columnCallback(col)
      lines.push(`    .addColumn("${name}", "${typeSql}"${cb})`)
    }

    lines.push("    .execute()")
    return lines.join("\n")
  }

  #generateCreateIndex(table: string, column: string): string {
    return [
      `  await db.schema.createIndex("${table}_${column}_index")`,
      `    .on("${table}")`,
      `    .column("${column}")`,
      "    .execute()",
    ].join("\n")
  }

  #columnCallback(col: Column): string {
    const calls: string[] = []

    if (col.isPrimaryKey) {
      if (col.dataType === "integer") {
        calls.push("autoIncrement()")
      }
      calls.push("primaryKey()")
    }

    if (!col.isNullable && !col.isPrimaryKey) {
      calls.push("notNull()")
    }

    const dv = col.defaultValue
    if (dv !== undefined && typeof dv !== "function") {
      calls.push(`defaultTo(${JSON.stringify(dv)})`)
    }

    if (col.isUnique && !col.isPrimaryKey) {
      calls.push("unique()")
    }

    const refConstraint = col.constraints.find((c) => c.type === "references")
    if (refConstraint?.args[0]) {
      const targetClass = typeof refConstraint.args[0] === "function" ? refConstraint.args[0]() : refConstraint.args[0]
      const targetTable = (targetClass as any)?.table as string | undefined
      const targetColumns = refConstraint.args[1] as string[] | undefined
      if (typeof targetTable === "string" && targetTable && targetColumns?.length) {
        calls.push(`references("${targetTable}.${targetColumns[0]}")`)
      }
    }

    if (calls.length === 0) return ""

    const str = calls.join(".")
    return `, (c) => c.${str}`
  }

  #mapType(col: Column): string {
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
      case "enum": {
        return "text"
      }
      default:
        return col.dataType
    }
  }
}
