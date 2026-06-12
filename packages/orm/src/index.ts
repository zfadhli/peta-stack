// ─── ORM Registry ──────────────────────────────────────────

// ─── Collection ────────────────────────────────────────────
export type { Collection } from "./collection/index.js"
export { createCollection } from "./collection/index.js"
export type { ColumnShape } from "./columns/column.js"
// ─── Columns ───────────────────────────────────────────────
export type { Column, ColumnTypes, ColumnValue, Constraint, SchemaConfig } from "./columns/index.js"
export { createArkTypeSchemaConfig, createColumn, t } from "./columns/index.js"
// ─── Errors ────────────────────────────────────────────────
export type { DatabaseErrorCode } from "./errors.js"
export {
  DatabaseError,
  ModelNotFoundError,
  ModelNotRegisteredError,
  normalizeError,
  RelationNotFoundError,
  ValidationError,
} from "./errors.js"
// ─── Hooks ─────────────────────────────────────────────────
export type { HookCallback, HookManager, LifecycleEvent } from "./hooks/index.js"
export { createHookManager } from "./hooks/index.js"
// ─── Model System ──────────────────────────────────────────
export { defineModel } from "./model/index.js"
export type { ModelConfig, ModelDefinition, ModelInstance } from "./model/types.js"
export type { ORMConfig } from "./orm/index.js"
export { createORM, createORM as createPeta } from "./orm/index.js"
// ─── Pagination ───────────────────────────────────────────
export type { PaginatedResult, Paginator, PaginatorJson } from "./pagination/index.js"
export { createPaginator } from "./pagination/index.js"
// ─── Query Builder ─────────────────────────────────────────
export type { QueryBuilder } from "./query/index.js"
export { createQueryBuilder } from "./query/index.js"
// ─── Relations ────────────────────────────────────────────
export type { Relation, RelationOptions, RelationType } from "./relations/base.js"
export {
  belongsTo,
  defineMorphMany,
  defineMorphOne,
  defineMorphTo,
  hasMany,
  hasManyThrough,
  hasOne,
  manyToMany,
} from "./relations/index.js"
export type { MorphManyOptions, MorphOneOptions, MorphToOptions } from "./relations/morph.js"
// ─── Types ─────────────────────────────────────────────────
export type { ModelId, ORMLike } from "./types.js"
