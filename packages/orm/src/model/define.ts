import type { ColumnShape } from "../columns/column.js"
import { ModelNotRegisteredError } from "../errors.js"
import type { LifecycleEvent } from "../hooks/index.js"
import { addStaticHook } from "../hooks/static.js"
import type { QueryBuilder } from "../query/index.js"
import { createQueryBuilder } from "../query/index.js"
import type { ORMLike } from "../types.js"
import { setComputedConfig } from "./computed.js"
import { createInstance } from "./factory.js"
import { getHooksFor, registerSoftDeletesFor, registerTimestampsFor } from "./hooks.js"
import { setConfig } from "./save.js"
import { addScope, getScopes, removeScope } from "./scopes.js"
import { setConfig as setSerializeConfig } from "./serialize.js"
import type { ModelConfig, ModelDefinition, ModelInstance } from "./types.js"

// ─── DEFINE MODEL FACTORY ────────────────────────────────────

export function defineModel<TColumns extends ColumnShape>(
  table: string,
  config: ModelConfig<TColumns>,
): ModelDefinition<TColumns> {
  const def: ModelDefinition<TColumns> = {
    table,
    columns: config.columns,
    relations: config.relations ?? {},
    name: table,

    _orm: null,

    query() {
      if (!this._orm) throw new ModelNotRegisteredError(this.name)
      return createQueryBuilder(this)
    },

    async find(id) {
      return this.query().find(id)
    },

    async findOrFail(id) {
      return this.query().findOrFail(id)
    },

    async first() {
      return this.query().first()
    },

    async create(data) {
      const mod = await import("./save.js")
      return mod.insertModel(def, data) as Promise<ModelInstance<TColumns>>
    },

    async insert(data) {
      const mod = await import("./save.js")
      return mod.insertModel(def, data) as Promise<ModelInstance<TColumns>>
    },

    async insertMany(dataArray) {
      const mod = await import("./save.js")
      return mod.insertManyModel(def, dataArray) as Promise<ModelInstance<TColumns>[]>
    },

    async updateMany(
      data: Record<string, unknown>,
      where: Record<string, unknown>[],
    ): Promise<number> {
      let qb = this.query().all()
      // ponytail: batch OR via whereIn — all clauses use the same keys
      if (where.length > 0) {
        const keys = Object.keys(where[0]!)
        for (const key of keys) {
          const values = where.map((c) => c[key])
          qb = qb.whereIn(key, values)
        }
      }
      return (qb as any).updateMany(data)
    },

    async deleteMany(where: Record<string, unknown>[]): Promise<number> {
      let qb = this.query().all()
      if (where.length > 0) {
        const keys = Object.keys(where[0]!)
        for (const key of keys) {
          const values = where.map((c) => c[key])
          qb = qb.whereIn(key, values)
        }
      }
      return (qb as any).deleteMany()
    },

    async update(id, data) {
      const mod = await import("./save.js")
      return mod.updateModel(def, id, data) as Promise<ModelInstance<TColumns>>
    },

    async insertGraph(data, options) {
      const mod = await import("../relations/graph/index.js")
      return mod.insertGraph(def, data, options)
    },

    async upsertGraph(data, options) {
      const mod = await import("../relations/graph/index.js")
      return mod.upsertGraph(def, data, options)
    },

    async delete(id) {
      const model = await this.findOrFail(id)
      const mod = await import("./delete.js")
      await mod.deleteModel(def, model)
    },

    hydrate(row: Record<string, unknown>) {
      return createInstance(def, config, row, true)
    },

    on(event: string, callback: any): () => void {
      const hm = getHooksFor(def)
      return hm.on(event as LifecycleEvent, callback)
    },

    use(plugin: any) {
      plugin(def)
      return def
    },

    makeHelper<A extends any[], R>(fn: (qb: QueryBuilder, ...args: A) => R): (...args: A) => R {
      // Return a function that binds the query builder as first arg
      return (...args: A): R => {
        const qb = def.query()
        return fn(qb, ...args)
      }
    },

    getHooks() {
      return getHooksFor(def)
    },

    addGlobalScope(name: string, callback: (qb: QueryBuilder) => void): void {
      addScope(def, name, callback)
    },

    removeGlobalScope(name: string): void {
      removeScope(def, name)
    },

    getGlobalScopes(): Map<string, (qb: QueryBuilder) => void> | undefined {
      return getScopes(def)
    },

    // Static hooks
    beforeDelete(callback: any) {
      return addStaticHook(def, "beforeDelete", callback)
    },
    afterDelete(callback: any) {
      return addStaticHook(def, "afterDelete", callback)
    },
    beforeUpdate(callback: any) {
      return addStaticHook(def, "beforeUpdate", callback)
    },
    afterUpdate(callback: any) {
      return addStaticHook(def, "afterUpdate", callback)
    },
    beforeCreate(callback: any) {
      return addStaticHook(def, "beforeCreate", callback)
    },
    afterCreate(callback: any) {
      return addStaticHook(def, "afterCreate", callback)
    },
    beforeFind(callback: any) {
      return addStaticHook(def, "beforeFind", callback)
    },
    afterFind(callback: any) {
      return addStaticHook(def, "afterFind", callback)
    },

    _init(orm: ORMLike) {
      def._orm = orm
      // Store config in save module
      setConfig(def, config)
      // Also store config in serialize module
      setSerializeConfig?.(def, config)
    },
  }

  // Store config immediately on both save and serialize modules
  setConfig(def, config)
  setSerializeConfig?.(def, config)
  if (config.computed) {
    setComputedConfig?.(def, config.computed!)
  }
  // Add backward-compat convenience methods
  def.registerTimestamps = (createdAtCol?: string, updatedAtCol?: string) => {
    registerTimestampsFor(def, createdAtCol, updatedAtCol)
  }
  def.registerSoftDeletes = (deletedAtCol?: string) => {
    registerSoftDeletesFor(def, deletedAtCol)
  }

  return def
}
