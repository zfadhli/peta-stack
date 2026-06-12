import { castValue } from "./casts.js"
import { getConfig as getSaveConfig } from "./save.js"
import { getRawRelations, getState } from "./state.js"
import type { ModelConfig, ModelDefinition, ModelInstance } from "./types.js"

const VISITED = new WeakSet<object>()

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
        value = attrDef.get(value, model as any)
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
      result[relName] = relValue.map((item: any) => {
        if (item && typeof item.$toJSON === "function") {
          if (VISITED.has(item)) return { id: (item as any).get("id") }
          VISITED.add(item)
          const json = (item as any).$toJSON()
          VISITED.delete(item)
          return json
        }
        return item
      })
    } else if (relValue && typeof (relValue as any).$toJSON === "function") {
      if (VISITED.has(relValue as any)) {
        result[relName] = { id: (relValue as any).get("id") }
      } else {
        VISITED.add(relValue as any)
        result[relName] = (relValue as any).$toJSON()
        VISITED.delete(relValue as any)
      }
    } else if (relValue != null) {
      result[relName] = relValue
    }
  }

  for (const append of appends) {
    if (!(append in result)) {
      const accessor = `get${append.charAt(0).toUpperCase()}${append.slice(1)}Attribute`
      if (typeof (model as any)[accessor] === "function") {
        result[append] = (model as any)[accessor]()
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
