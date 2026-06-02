import type { Model, ModelClass } from "./model"
import { getAttr, getRawAttrs, getRawRelations } from "./model-state"

export function modelToJSON(model: Model, visited?: WeakSet<Model>): Record<string, unknown> {
  visited = visited ?? new WeakSet()
  if (visited.has(model)) return { __circular: true }
  visited.add(model)

  const modelClass = model.constructor as ModelClass
  const hidden = modelClass.$hidden
  const visible = modelClass.$visible

  let keys = Object.keys(getRawAttrs(model))
  if (visible.length > 0) {
    keys = keys.filter((k) => visible.includes(k))
  }
  keys = keys.filter((k) => !hidden.includes(k))

  const data: Record<string, unknown> = {}
  for (const key of keys) {
    data[key] = getAttr(model, key)
  }

  for (const key of modelClass.$appends) {
    const accessor = `get${key.charAt(0).toUpperCase() + key.slice(1)}Attribute`
    if (typeof (model as any)[accessor] === "function") {
      data[key] = (model as any)[accessor]()
    }
  }

  const relations = getRawRelations(model)
  for (const [key, value] of Object.entries(relations)) {
    if (hidden.includes(key)) continue
    if (visible.length > 0 && !visible.includes(key)) continue
    if (value === null) {
      data[key] = null
    } else if (Array.isArray(value)) {
      data[key] = value.map((m: Model) => modelToJSON(m, visited))
    } else {
      data[key] = modelToJSON(value as Model, visited)
    }
  }

  return data
}
