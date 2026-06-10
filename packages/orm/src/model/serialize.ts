import type { ModelDefinition, ModelInstance } from "./index.js"
import { getRawRelations, getState } from "./state.js"

const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"])

export function modelToJSON(
  def: ModelDefinition,
  model: ModelInstance,
  visited?: WeakSet<ModelInstance>,
): Record<string, unknown> {
  visited = visited ?? new WeakSet()
  if (visited.has(model)) return {}
  visited.add(model)
  const config = def._config
  const state = getState(model)
  const attrs = { ...state.attributes }
  const output: Record<string, unknown> = {}
  const hiddenSet = new Set(config.hidden ?? [])
  const visible = config.visible
  const idx = model as unknown as Record<string, unknown>
  let keys: string[]
  if (visible && visible.length > 0) keys = visible
  else keys = Object.keys(attrs).filter((k) => !hiddenSet.has(k))
  for (const key of keys) {
    if (FORBIDDEN_KEYS.has(key)) continue
    let value = attrs[key]
    const casts = config.casts ?? {}
    if (casts[key]) value = castValue(value, casts[key])
    const accessor = `get${key.charAt(0).toUpperCase()}${key.slice(1)}Attribute`
    if (typeof idx[accessor] === "function") value = idx[accessor]()
    output[key] = value
  }
  for (const appendKey of config.appends ?? []) {
    const accessor = `get${appendKey.charAt(0).toUpperCase()}${appendKey.slice(1)}Attribute`
    if (typeof idx[accessor] === "function") output[appendKey] = idx[accessor]()
  }
  const relations = getRawRelations(model)
  for (const [relName, relValue] of Object.entries(relations)) {
    if (hiddenSet.has(relName)) continue
    if (visible && visible.length > 0 && !visible.includes(relName)) continue
    if (Array.isArray(relValue)) {
      output[relName] = relValue
        .filter((r): r is ModelInstance => r != null && typeof r === "object")
        .map((r) => modelToJSON(def, r, visited))
    } else if (relValue != null && typeof relValue === "object") {
      output[relName] = modelToJSON(def, relValue as ModelInstance, visited)
    } else {
      output[relName] = relValue
    }
  }
  return output
}

function castValue(value: unknown, type: string): unknown {
  switch (type) {
    case "date":
      return value ? new Date(value as string) : value
    case "json":
      return typeof value === "string" ? JSON.parse(value) : value
    case "boolean":
      return value === true || value === 1 || value === "1" || value === "true"
    case "float":
      return value != null ? Number(value) : value
    case "integer":
      return value != null ? Math.round(Number(value)) : value
    default:
      return value
  }
}
