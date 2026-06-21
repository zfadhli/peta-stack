import type { ModelDefinition, ModelInstance } from "../model/types.js"
import type { Relation } from "./base.js"

const THUNK_CACHE = new WeakMap<object, ModelDefinition>()

export function resolveThunk(thunk: () => ModelDefinition): ModelDefinition {
  let cls = THUNK_CACHE.get(thunk)
  if (!cls) {
    cls = thunk()
    THUNK_CACHE.set(thunk, cls)
  }
  return cls
}

export function groupByArray(items: ModelInstance[], key: string): Record<string, ModelInstance[]> {
  const result: Record<string, ModelInstance[]> = {}
  for (const item of items) {
    const v = item.get(key)
    if (v == null) continue
    const k = String(v)
    if (!result[k]) result[k] = []
    result[k].push(item)
  }
  return result
}

export function getPivotInfo(relation: Relation): {
  throughTable: string
  foreignPivotKey: string
  relatedPivotKey: string
} {
  if (relation.type !== "manyToMany" || !relation.throughTable) {
    throw new Error("Not a many-to-many relation")
  }
  return {
    throughTable: relation.throughTable,
    foreignPivotKey: relation.foreignPivotKey ?? "",
    relatedPivotKey: relation.relatedPivotKey ?? "",
  }
}

export async function findRelated(
  def: ModelDefinition,
  conditions: Record<string, unknown>,
): Promise<ModelInstance | undefined> {
  const key = Object.keys(conditions)[0]!
  return def.query().where(key, "=", conditions[key]).executeTakeFirst()
}

export async function resolveTargetId(
  def: ModelDefinition,
  target: number | string | Record<string, unknown>,
): Promise<unknown> {
  if (typeof target === "number" || typeof target === "string") {
    return target
  }
  const found = await findRelated(def, target)
  if (found) return found.get("id")
  return undefined
}
