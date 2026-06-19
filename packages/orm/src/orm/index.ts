import type { Dialect } from "kysely"
import { Kysely } from "kysely"
import { pathToFileURL } from "url"
import type { ColumnShape } from "../columns/column.js"
import type { Database } from "../lib/kysely.js"
import type { ModelDefinition } from "../model/types.js"
import type { ORMLike } from "../types.js"

export interface ORMConfig {
  dialect: Dialect
  models?: Record<string, ModelDefinition>
}

/**
 * Create an ORM instance — the central registry that wires Kysely to model definitions.
 * Replaces createPeta() from v0.x.
 */
export function createORM(config: ORMConfig): ORMLike & { kysely: Database } {
  const kysely = new Kysely<Record<string, never>>({
    dialect: config.dialect,
  }) as unknown as Database

  const modelMap = new Map<string, ModelDefinition>()

  const orm: ORMLike & { kysely: Database } = {
    kysely,

    register(model: ModelDefinition): void {
      model._init(orm as any)
      modelMap.set(model.name, model)
      // Config is already stored by _init() — no need to re-set here
    },

    registerAll(...models: (ModelDefinition | ModelDefinition[])[]): void {
      const flat = models.flat()
      for (const model of flat) {
        if (!model.table) continue // Skip models with empty table name
        this.register(model)
      }
    },

    async destroy(): Promise<void> {
      await kysely.destroy()
    },

    async transaction<T>(fn: (trx: Database) => Promise<T>): Promise<T> {
      return kysely.transaction().execute((trx: any) => fn(trx))
    },

    get models(): ReadonlyMap<string, ModelDefinition> {
      return modelMap
    },

    getModel<T extends ColumnShape = ColumnShape>(name: string): ModelDefinition<T> | undefined {
      return modelMap.get(name) as ModelDefinition<T> | undefined
    },

    async discover(pattern: string): Promise<ModelDefinition<any>[]> {
      const fg = await import("fast-glob")
      const entries = await fg.glob(pattern, { absolute: true, onlyFiles: true })

      if (entries.length === 0) {
        throw new Error(`discover: no files matched pattern "${pattern}"`)
      }

      const models: ModelDefinition<any>[] = []
      const seen = new Set<string>()

      for (const fp of entries) {
        const mod = await import(pathToFileURL(fp).href)
        for (const val of Object.values(mod)) {
          if (
            val &&
            typeof val === "object" &&
            "columns" in val &&
            "table" in val &&
            typeof (val as any).table === "string" &&
            (val as any).table.length > 0
          ) {
            const def = val as ModelDefinition<any>
            if (!seen.has(def.table)) {
              seen.add(def.table)
              models.push(def)
            }
          }
        }
      }

      return models
    },
  }

  // Register initial models if provided
  if (config.models) {
    for (const [_name, model] of Object.entries(config.models)) {
      orm.register(model)
    }
  }

  return orm
}
