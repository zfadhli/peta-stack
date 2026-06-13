import type { ModelDefinition } from "../../model/types.js"
import type { Relation } from "../base.js"

// Sentinel key used to mark morphTo relations
const MORPH_MAP_KEY = "_morphMap"

/** Whether this relation is a MorphTo (polymorphic belongsTo) */
export function isMorphToRelation(relation: Relation): boolean {
  return (relation as any)?.[MORPH_MAP_KEY] !== undefined
}

/** Whether this relation is a MorphMany or MorphOne (polymorphic hasMany/hasOne) */
export function isMorphManyRelation(relation: Relation): boolean {
  return (relation as any)?._morphType !== undefined && !isMorphToRelation(relation)
}

/** Get the morph type column name (e.g. "commentableType") from a morph relation */
export function getMorphType(relation: Relation): string | undefined {
  return (relation as any)?._morphType
}

/** Get the morph type value (e.g. "morph_posts") from a MorphMany/MorphOne relation */
export function getMorphTypeValue(relation: Relation): string | undefined {
  return (relation as any)?._morphTypeValue
}

/** Get the morph id column name (e.g. "commentableId") from a morph relation */
export function getMorphId(relation: Relation): string | undefined {
  return (relation as any)?._morphId
}

// Inlined resolveThunk to avoid circular dep via morph.ts → query/index.ts
const THUNK_CACHE = new WeakMap<object, ModelDefinition>()
export function resolveThunk(thunk: () => ModelDefinition): ModelDefinition {
  let cls = THUNK_CACHE.get(thunk)
  if (!cls) {
    cls = thunk()
    THUNK_CACHE.set(thunk, cls)
  }
  return cls
}
