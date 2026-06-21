import type { ColumnShape } from "../columns/column.js"
import { applyCastsToData, castForSet, castValue } from "./casts.js"
import { getRuntime } from "./runtime.js"
import {
  fillAttrs,
  getAttr,
  getDirtyAttributes,
  getExists,
  getRawRelations,
  getState,
  initState,
  isDirty,
  resetAttrs,
  setAttr,
  syncOriginal,
} from "./state.js"
import type { ModelConfig, ModelDefinition, ModelInstance, SerializedShape } from "./types.js"
import { FORBIDDEN_KEYS } from "./types.js"

// Store model definition on instance for collection.load() to find
const instanceDefs = new WeakMap<object, ModelDefinition<any>>()

export function setModelDefOnInstance(instance: object, def: ModelDefinition<any>): void {
  instanceDefs.set(instance, def)
}

export function getModelDefFromInstance(instance: object): ModelDefinition<any> | undefined {
  return instanceDefs.get(instance)
}

export function createInstance<TColumns extends ColumnShape = ColumnShape>(
  def: ModelDefinition<TColumns>,
  config: ModelConfig<TColumns>,
  data: Record<string, unknown>,
  exists: boolean,
): ModelInstance<TColumns> {
  const validColumns = new Set(Object.keys(def.columns))
  const instance: ModelInstance<TColumns> = {
    get exists() {
      return getExists(instance)
    },

    get attributes() {
      return { ...getState(instance).attributes }
    },

    get dirtyAttributes() {
      return getDirtyAttributes(instance)
    },

    isDirty(key?: string): boolean {
      return isDirty(instance, key)
    },

    get<T = unknown>(key: string): T {
      const val = getAttr(instance, key)
      let result: unknown = val
      if (config.casts?.[key]) {
        result = castValue(result, config.casts[key])
      }
      const attrDef = config.attributes?.[key]
      if (attrDef?.get) {
        result = attrDef.get(result as T, instance as any)
      }
      return result as T
    },

    set(key: string, value: unknown): void {
      if (FORBIDDEN_KEYS.has(key)) return
      let result = value
      const attrDef = config.attributes?.[key]
      if (attrDef?.set) {
        result = attrDef.set(result, instance as any)
      }
      const finalVal = config.casts?.[key] ? castForSet(result, config.casts[key]) : result
      setAttr(instance, key, finalVal)
    },

    fill(data: Record<string, unknown>): void {
      const safe: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(data)) {
        if (!FORBIDDEN_KEYS.has(key) && validColumns.has(key)) {
          let v: unknown = value
          const attrDef = config.attributes?.[key]
          if (attrDef?.set) {
            v = attrDef.set(v, instance as any)
          }
          safe[key] = config.casts?.[key] ? castForSet(v, config.casts[key]) : v
        }
      }
      fillAttrs(instance, safe)
    },

    reset(): void {
      resetAttrs(instance)
    },

    $getRelation<T = unknown>(name: string): T {
      return (getRawRelations(instance)?.[name] as T) ?? (null as T)
    },

    $setRelation(name: string, value: unknown): void {
      getRawRelations(instance)[name] = value
    },

    $hasRelation(name: string): boolean {
      return name in (getRawRelations(instance) ?? {})
    },

    $relationData(): Record<string, unknown> {
      return { ...getRawRelations(instance) }
    },

    $load: (...relations: string[]) => {
      return getRuntime().loadModelRelations(instance, def, ...relations)
    },

    $related: (name: string) => {
      return getRuntime().createRelationQuery(instance, def, name)
    },

    $save: () => {
      return getRuntime().saveModel(def, instance) as Promise<ModelInstance<TColumns>>
    },

    $delete: () => {
      return getRuntime().deleteModel(def, instance)
    },

    $forceDelete: () => {
      return getRuntime().forceDeleteModel(def, instance)
    },

    $restore: () => {
      return getRuntime().restoreModel(def, instance)
    },

    $trashed(): boolean {
      return getRuntime().trashedModel(def, instance)
    },

    $reload: () => {
      return getRuntime().reloadModel(def, instance)
    },

    $toJSON(): SerializedShape<TColumns> {
      return getRuntime().modelToJSON(def, instance) as SerializedShape<TColumns>
    },

    toJSON(): SerializedShape<TColumns> {
      return getRuntime().modelToJSON(def, instance) as SerializedShape<TColumns>
    },
  }

  if (exists) {
    // DB read path — apply casts, NO set mutators
    const applied = applyCastsToData(config, data || {})
    initState(instance, applied, true)
  } else {
    // New record path — start empty, fill via set pipeline, then sync original
    initState(instance, {}, false)
    if (data && Object.keys(data).length > 0) {
      instance.fill(data)
    }
    syncOriginal(instance)
  }

  // Store the model def for reverse lookups (collection.load, etc.)
  setModelDefOnInstance(instance, def)

  return instance
}
