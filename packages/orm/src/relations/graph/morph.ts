import type { Relation } from "../base.js"
import { resolveThunk } from "../helpers.js"

/** Whether this relation is a MorphTo (polymorphic belongsTo) */
export function isMorphToRelation(relation: Relation): boolean {
  return relation._morphMap !== undefined
}

/** Whether this relation is a MorphMany or MorphOne (polymorphic hasMany/hasOne) */
export function isMorphManyRelation(relation: Relation): boolean {
  return relation._morphType !== undefined && !isMorphToRelation(relation)
}

/** Get the morph type column name (e.g. "commentableType") from a morph relation */
export function getMorphType(relation: Relation): string | undefined {
  return relation._morphType
}

/** Get the morph type value (e.g. "morph_posts") from a MorphMany/MorphOne relation */
export function getMorphTypeValue(relation: Relation): string | undefined {
  return relation._morphTypeValue
}

/** Get the morph id column name (e.g. "commentableId") from a morph relation */
export function getMorphId(relation: Relation): string | undefined {
  return relation._morphId
}

export { resolveThunk }
