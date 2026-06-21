import { ModelNotRegisteredError } from "../../errors.js"
import type { ModelDefinition, ModelInstance } from "../../model/types.js"
import type { Relation } from "../base.js"
import type { GraphContext, RefEntry } from "./types.js"

// ─── HELPERS ───────────────────────────────────────────────────

export function getPrimaryKeyColumn(def: ModelDefinition): string {
  const cols = def.columns as Record<string, any>
  for (const [name, col] of Object.entries(cols)) {
    if (col.isPrimaryKey) return name
  }
  return "id"
}

export function getDb(def: ModelDefinition): any {
  if (!def._orm) throw new ModelNotRegisteredError(def.name)
  return (def._orm as any).kysely
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

// ─── EXTRACT RELATION DATA FROM A GRAPH NODE ──────────────────

/**
 * Splits a graph node's keys into column data and relation operations.
 * Handles both the old-style { create: ..., connect: ... } wrappers and
 * the new graph-style where nested objects/arrays represent relations directly.
 */
export function extractGraphRelationData(
  def: ModelDefinition,
  node: Record<string, unknown>,
): {
  columnData: Record<string, unknown>
  relationOps: Record<string, unknown>
} {
  const columnData: Record<string, unknown> = {}
  const relationOps: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(node)) {
    // Skip internal markers
    if (key === "#id" || key === "#ref" || key === "#dbRef") continue

    if (def.relations[key]) {
      // This key is a relation name — treat the value as relation data
      relationOps[key] = value
    } else {
      columnData[key] = value
    }
  }

  return { columnData, relationOps }
}

// ─── REF COLLECTION & RESOLUTION ──────────────────────────────

export function collectRefs(
  node: Record<string, unknown>,
  def: ModelDefinition,
  refMap: Map<string, RefEntry>,
): void {
  const id = node["#id"]
  if (id && typeof id === "string") {
    if (refMap.has(id)) {
      throw new Error(`Duplicate #id "${id}" in graph`)
    }
    refMap.set(id, { node, def })
  }

  for (const [key, value] of Object.entries(node)) {
    if (key === "#id" || key === "#ref" || key === "#dbRef") continue

    // Only recurse into relation keys to find nested #id markers
    if (def.relations[key]) {
      const relation = def.relations[key]
      const relatedDef = relation.relatedModelClass

      if (Array.isArray(value)) {
        for (const item of value) {
          if (item && typeof item === "object") {
            collectRefs(item as Record<string, unknown>, relatedDef, refMap)
          }
        }
      } else if (value && typeof value === "object") {
        // For belongsTo/hasOne, the object might have #id inside,
        // or it could have { create: { ... } } wrapper
        const inner = (value as Record<string, unknown>).create as
          | Record<string, unknown>
          | undefined
        if (inner && typeof inner === "object") {
          collectRefs(inner, relatedDef, refMap)
        } else {
          collectRefs(value as Record<string, unknown>, relatedDef, refMap)
        }
      }
    }
  }
}

export function resolveRefs(node: Record<string, unknown>, context: GraphContext): void {
  for (const [key, value] of Object.entries(node)) {
    if (key === "#id" || key === "#ref" || key === "#dbRef") continue

    if (value && typeof value === "object") {
      if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
          const item = value[i]
          if (item && typeof item === "object") {
            if ("#ref" in item) {
              const refId = (item as any)["#ref"]
              if (!context.allowRefs) {
                throw new Error(
                  `#ref is used but allowRefs option is not enabled. Set { allowRefs: true } to use #ref.`,
                )
              }
              const entry = context.refMap.get(refId)
              if (!entry) {
                throw new Error(`#ref "${refId}" not found in graph`)
              }
              value[i] = entry.node
            } else {
              resolveRefs(item as Record<string, unknown>, context)
            }
          }
        }
      } else {
        const obj = value as Record<string, unknown>
        // Handle { create: {...} } wrapper
        if (obj.create && typeof obj.create === "object") {
          resolveRefs(obj.create as Record<string, unknown>, context)
        }
        resolveRefs(obj, context)
      }
    }
  }
}
