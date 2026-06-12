// Re-export all public types and functions

export { applyCastsToData, castForSet, castValue, prepareForDb } from "./casts.js"
export type { ComputedColumn } from "./computed.js"
export {
  applyComputedColumnsAsync,
  computeAtRuntime,
  computeBatchAtRuntime,
  getComputedConfig,
  setComputedConfig,
  sqlComputed,
} from "./computed.js"
export { deleteModel, forceDeleteModel, restoreModel, trashedModel } from "./delete.js"
export { createInstance } from "./factory.js"
export {
  getHooksFor,
  getSoftDeleteConfig,
  hasSoftDelete,
  registerSoftDeletesFor,
  registerTimestampsFor,
} from "./hooks.js"
export { getModelDef, loadModelRelations, setModelDef } from "./relation.js"
export { getConfig, insertManyModel, insertModel, reloadModel, saveModel, setConfig, updateModel } from "./save.js"
export { addScope, getScopes, removeScope } from "./scopes.js"
export { modelToJSON } from "./serialize.js"
export type { ModelConfig, ModelDefinition, ModelInstance } from "./types.js"
export { FORBIDDEN_KEYS } from "./types.js"

import { createRelationQuery } from "../relations/related-query.js"
import { deleteModel, forceDeleteModel, restoreModel, trashedModel } from "./delete.js"
// Wire up factory with module functions (avoids circular deps)
import { setRelationQueryModule, wireDeps } from "./factory.js"
import { loadModelRelations } from "./relation.js"
import { reloadModel, saveModel } from "./save.js"
import { modelToJSON } from "./serialize.js"

wireDeps({
  saveModel,
  deleteModel,
  forceDeleteModel,
  restoreModel,
  trashedModel,
  reloadModel,
  modelToJSON,
  loadModelRelations,
})

// Wire RelationQuery module for $related() support
setRelationQueryModule({ createRelationQuery })

// ─── DEFINE MODEL FACTORY ────────────────────────────────────
import type { ColumnShape } from "../columns/column.js"
import { ModelNotRegisteredError } from "../errors.js"
import type { QueryBuilder } from "../query/index.js"
import { createQueryBuilder } from "../query/index.js"
import type { ORMLike } from "../types.js"
import { createInstance } from "./factory.js"
import { getHooksFor, registerSoftDeletesFor, registerTimestampsFor } from "./hooks.js"
import { addStaticHook } from "../hooks/static.js"
import { setConfig } from "./save.js"
import { addScope, getScopes, removeScope } from "./scopes.js"
import { createInstance } from "./factory.js"
import type { ModelConfig, ModelDefinition } from "./types.js"

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
      return mod.insertModel(this as any, data)
    },

    async insert(data) {
      const mod = await import("./save.js")
      return mod.insertModel(this as any, data)
    },

    async insertMany(dataArray) {
      const mod = await import("./save.js")
      return mod.insertManyModel(this as any, dataArray)
    },

    async update(id, data) {
      const mod = await import("./save.js")
      return mod.updateModel(this as any, id, data)
    },

    async delete(id) {
      const model = await this.findOrFail(id)
      const mod = await import("./delete.js")
      await mod.deleteModel(this as any, model as any)
    },

    hydrate(row: Record<string, unknown>) {
      return createInstance(this as any, config as any, row, true)
    },

    on(event: string, callback: any): () => void {
      const hm = getHooksFor(this as any)
      return hm.on(event as any, callback)
    },

    use(plugin: any) {
      plugin(this)
      return this
    },

    makeHelper(fn: any) {
      // Return a function that binds the query builder as first arg
      return (...args: any[]) => {
        const qb = this.query()
        return fn(qb, ...args)
      }
    },

    getHooks() {
      return getHooksFor(this as any)
    },

    addGlobalScope(name: string, callback: (qb: QueryBuilder) => void): void {
      addScope(this as any, name, callback)
    },

    removeGlobalScope(name: string): void {
      removeScope(this as any, name)
    },

    getGlobalScopes(): Map<string, (qb: QueryBuilder) => void> | undefined {
      return getScopes(this as any)
    },

    // Static hooks
    beforeDelete(callback: any) {
      return addStaticHook(def as any, "beforeDelete", callback)
    },
    afterDelete(callback: any) {
      return addStaticHook(def as any, "afterDelete", callback)
    },
    beforeUpdate(callback: any) {
      return addStaticHook(def as any, "beforeUpdate", callback)
    },
    afterUpdate(callback: any) {
      return addStaticHook(def as any, "afterUpdate", callback)
    },
    beforeCreate(callback: any) {
      return addStaticHook(def as any, "beforeCreate", callback)
    },
    afterCreate(callback: any) {
      return addStaticHook(def as any, "afterCreate", callback)
    },
    beforeFind(callback: any) {
      return addStaticHook(def as any, "beforeFind", callback)
    },
    afterFind(callback: any) {
      return addStaticHook(def as any, "afterFind", callback)
    },

    _init(orm: ORMLike) {
      this._orm = orm
      // Store config in save module
      setConfig(this as any, config as any)
      // Also store config in serialize module
      import("./serialize.js").then((mod) => mod.setConfig?.(this as any, config as any))
    },
  }

  // Store config immediately on both save and serialize modules
  setConfig(def as any, config as any)
  import("./serialize.js").then((mod) => mod.setConfig?.(def as any, config as any))
  if (config.computed) {
    import("./computed.js").then((mod) => mod.setComputedConfig?.(def as any, config.computed!))
  }
  // Add backward-compat convenience methods
  ;(def as any).registerTimestamps = (createdAtCol?: string, updatedAtCol?: string) => {
    registerTimestampsFor(def as any, createdAtCol, updatedAtCol)
  }
  ;(def as any).registerSoftDeletes = (deletedAtCol?: string) => {
    registerSoftDeletesFor(def as any, deletedAtCol)
  }
  ;(def as any).discover = async () => {
    throw new Error("discover() not yet implemented in v2")
  }

  return def
}
