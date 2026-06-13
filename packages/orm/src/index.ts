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
  RelationNotAllowedError,
  RelationNotFoundError,
  ValidationError,
} from "./errors.js"
// ─── Hooks ─────────────────────────────────────────────────
export type { HookCallback, HookManager, LifecycleEvent } from "./hooks/index.js"
export { createHookManager } from "./hooks/index.js"
// ─── Model System ──────────────────────────────────────────
export { Attribute, defineModel } from "./model/index.js"
export type { ModelConfig, ModelDefinition, ModelInstance } from "./model/types.js"
export type { ORMConfig } from "./orm/index.js"
export { createORM, createORM as createPeta } from "./orm/index.js"
// ─── Pagination ───────────────────────────────────────────
export type { PaginatedResult, Paginator, PaginatorJson } from "./pagination/index.js"
export { createPaginator } from "./pagination/index.js"
// ─── Plugins ────────────────────────────────────────────────
export type { Plugin } from "./plugins/index.js"
export { softDeletes } from "./plugins/soft-deletes.js"
export { timestamps } from "./plugins/timestamps.js"
export { ulid } from "./plugins/ulid.js"
// ─── Query Builder ─────────────────────────────────────────
export type { QueryBuilder } from "./query/types.js"
export { createQueryBuilder } from "./query/builder.js"
// ─── Relations ────────────────────────────────────────────
export type { Relation, RelationOptions, RelationType } from "./relations/base.js"
export type { InsertGraphOptions, UpsertGraphOptions } from "./relations/graph/index.js"
export {
  belongsTo,
  defineMorphMany,
  defineMorphOne,
  defineMorphTo,
  hasMany,
  hasManyThrough,
  hasOne,
  manyToMany,
  resolveMorphRelation,
} from "./relations/index.js"
export type { MorphManyOptions, MorphOneOptions, MorphToOptions } from "./relations/morph.js"

// ─── Types ─────────────────────────────────────────────────
export type { ModelId, ORMLike } from "./types.js"
