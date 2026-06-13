import { castValue } from "./casts.js"
import { getConfig as getSaveConfig } from "./save.js"
import { getRawRelations, getState } from "./state.js"
import type { ModelConfig, ModelDefinition, ModelInstance } from "./types.js"

const VISITED = new WeakSet<object>()

/** Minimal interface for model-like objects with serialization support. */
interface SerializableModel {
  get(key: string): unknown
  $toJSON(): Record<string, unknown>
}

/** Type guard: checks if a value looks like a SerializableModel. */
function isSerializableModel(value: unknown): value is SerializableModel {
  return value !== null && typeof value === "object" && typeof (value as Record<string, unknown>).$toJSON === "function"
}

export function modelToJSON(def: ModelDefinition, model: ModelInstance): Record<string, unknown> {
  const config = getSaveConfig(def) ?? getConfig(def)
  const state = getState(model)
  const result: Record<string, unknown> = {}

  const attributes = state.attributes
  const hidden = config?.hidden ?? []
  const visible = config?.visible
  const appends = config?.appends ?? []
  const casts = config?.casts ?? {}

  const keys = visible && visible.length > 0 ? visible : Object.keys(attributes)

  for (const key of keys) {
    if (hidden.includes(key)) continue
    if (key in attributes) {
      let value = attributes[key]
      if (casts[key]) {
        value = castValue(value, casts[key])
      }
      const attrDef = config?.attributes?.[key]
      if (attrDef?.get) {
        value = attrDef.get(value, model)
      }
      result[key] = value
    }
  }

  // Add relations
  const relations = getRawRelations(model)
  for (const [relName, relValue] of Object.entries(relations)) {
    if (hidden.includes(relName)) continue
    if (visible && visible.length > 0 && !visible.includes(relName)) continue

    if (Array.isArray(relValue)) {
      result[relName] = relValue.map((item): unknown => {
        if (isSerializableModel(item)) {
          if (VISITED.has(item)) return { id: item.get("id") }
          VISITED.add(item)
          const json = item.$toJSON()
          VISITED.delete(item)
          return json
        }
        return item
      })
    } else if (isSerializableModel(relValue)) {
      if (VISITED.has(relValue)) {
        result[relName] = { id: relValue.get("id") }
      } else {
        VISITED.add(relValue)
        result[relName] = relValue.$toJSON()
        VISITED.delete(relValue)
      }
    } else if (relValue != null) {
      result[relName] = relValue
    }
  }

  for (const append of appends) {
    if (!(append in result)) {
      const accessor = `get${append.charAt(0).toUpperCase()}${append.slice(1)}Attribute`
      const fn = (model as unknown as Record<string, unknown>)[accessor]
      if (typeof fn === "function") {
        result[append] = (fn as Function).call(model)
      }
    }
  }

  return result
}

const configMap = new WeakMap<ModelDefinition, ModelConfig>()

export function setConfig(def: ModelDefinition, config: ModelConfig): void {
  configMap.set(def, config)
}

export function getConfig(def: ModelDefinition): ModelConfig | undefined {
  return configMap.get(def)
}
