import { applyCastsToData, castForSet, castValue } from "./casts.js"
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
import type { ModelConfig, ModelDefinition, ModelInstance } from "./types.js"
import { FORBIDDEN_KEYS } from "./types.js"

// Store model definition on instance for collection.load() to find
const instanceDefs = new WeakMap<object, ModelDefinition>()

export function setModelDefOnInstance(instance: object, def: ModelDefinition): void {
  instanceDefs.set(instance, def)
}

export function getModelDefFromInstance(instance: object): ModelDefinition | undefined {
  return instanceDefs.get(instance)
}

export function createInstance(
  def: ModelDefinition,
  config: ModelConfig,
  data: Record<string, unknown>,
  exists: boolean,
): ModelInstance {
  const instance: ModelInstance = {
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
        if (!FORBIDDEN_KEYS.has(key)) {
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
      return loadModelRelations(instance, def, ...relations)
    },

    $related: (name: string) => {
      const { createRelationQuery } = requireRelationQuery()
      return createRelationQuery(instance, def, name)
    },

    $save: () => {
      return saveModel(def, instance)
    },

    $delete: () => {
      return deleteModel(def, instance)
    },

    $forceDelete: () => {
      return forceDeleteModel(def, instance)
    },

    $restore: () => {
      return restoreModel(def, instance)
    },

    $trashed(): boolean {
      return trashedModel(def, instance)
    },

    $reload: () => {
      return reloadModel(def, instance)
    },

    $toJSON(): Record<string, unknown> {
      return modelToJSON(def, instance)
    },

    toJSON(): Record<string, unknown> {
      return modelToJSON(def, instance)
    },
  }

  if (exists) {
    // DB read path — apply casts, NO set mutators
    const applied = applyCastsToData(config, data || {}, "get")
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

// These are set by the wiring in index.ts to avoid circular deps
export let saveModel: (def: ModelDefinition, model: ModelInstance) => Promise<ModelInstance> = undefined as any
export let deleteModel: (def: ModelDefinition, model: ModelInstance) => Promise<void> = undefined as any
export let forceDeleteModel: (def: ModelDefinition, model: ModelInstance) => Promise<void> = undefined as any
export let restoreModel: (def: ModelDefinition, model: ModelInstance) => Promise<void> = undefined as any
export let trashedModel: (def: ModelDefinition, model: ModelInstance) => boolean = undefined as any
export let reloadModel: (def: ModelDefinition, model: ModelInstance) => Promise<void> = undefined as any
export let modelToJSON: (def: ModelDefinition, model: ModelInstance) => Record<string, unknown> = undefined as any
export let loadModelRelations: (model: ModelInstance, def: ModelDefinition, ...relations: string[]) => Promise<void> =
  undefined as any

// Lazy import to avoid circular deps
let _relationQueryModule: any = null
function requireRelationQuery(): any {
  if (!_relationQueryModule) {
    // Will be set by wireDeps or loaded lazily
    throw new Error("RelationQuery module not wired yet")
  }
  return _relationQueryModule
}

export function setRelationQueryModule(mod: any): void {
  _relationQueryModule = mod
}

export function wireDeps(deps: {
  saveModel: typeof saveModel
  deleteModel: typeof deleteModel
  forceDeleteModel: typeof forceDeleteModel
  restoreModel: typeof restoreModel
  trashedModel: typeof trashedModel
  reloadModel: typeof reloadModel
  modelToJSON: typeof modelToJSON
  loadModelRelations: typeof loadModelRelations
}): void {
  saveModel = deps.saveModel
  deleteModel = deps.deleteModel
  forceDeleteModel = deps.forceDeleteModel
  restoreModel = deps.restoreModel
  trashedModel = deps.trashedModel
  reloadModel = deps.reloadModel
  modelToJSON = deps.modelToJSON
  loadModelRelations = deps.loadModelRelations
}
