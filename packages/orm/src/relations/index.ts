export type { Relation, RelationOptions, RelationType } from "./base.js"
export { EagerLoader } from "./eager.js"
export { belongsTo, hasMany, hasOne } from "./has-many.js"
export { hasManyThrough, manyToMany } from "./many-to-many.js"
export type { MorphManyOptions, MorphOneOptions, MorphToOptions } from "./morph.js"
// Re-export morph (kept from current codebase)
export { defineMorphMany, defineMorphOne, defineMorphTo } from "./morph.js"
export type { RelationQuery } from "./related-query.js"
export { createRelationQuery } from "./related-query.js"
