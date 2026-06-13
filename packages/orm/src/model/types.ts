import type { ColumnShape } from "../columns/column.js"
import type { QueryBuilder } from "../query/index.js"
import type { Relation } from "../relations/base.js"
import type { InsertGraphOptions, UpsertGraphOptions } from "../relations/graph/index.js"
import type { ORMLike } from "../types.js"
import type { Attribute } from "./attribute.js"

// ─── FORBIDDEN KEYS ──────────────────────────────────────────
export const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"])

// ─── MODEL INSTANCE ──────────────────────────────────────────
export interface ModelInstance {
  readonly exists: boolean
  readonly attributes: Record<string, unknown>
  readonly dirtyAttributes: Record<string, unknown>
  isDirty(key?: string): boolean
  get<T = unknown>(key: string): T
  set(key: string, value: unknown): void
  fill(data: Record<string, unknown>): void
  reset(): void
  $getRelation<T = unknown>(name: string): T
  $setRelation(name: string, value: unknown): void
  $hasRelation(name: string): boolean
  $relationData(): Record<string, unknown>
  $load(...relations: string[]): Promise<void>
  $related(name: string): import("../relations/related-query.js").RelationQuery
  $save(): Promise<this>
  $delete(): Promise<void>
  $forceDelete(): Promise<void>
  $restore(): Promise<void>
  $trashed(): boolean
  $reload(): Promise<void>
  $toJSON(): Record<string, unknown>
  toJSON(): Record<string, unknown>
}

// ─── MODEL DEFINITION ────────────────────────────────────────
export interface ModelDefinition<TColumns extends ColumnShape = ColumnShape> {
  readonly table: string
  readonly columns: TColumns
  readonly relations: Record<string, Relation>
  readonly name: string

  _orm: ORMLike | null

  query(): QueryBuilder
  find(id: number | string): Promise<ModelInstance | undefined>
  findOrFail(id: number | string): Promise<ModelInstance>
  first(): Promise<ModelInstance | undefined>

  create(data: Record<string, unknown>): Promise<ModelInstance>
  insert(data: Record<string, unknown>): Promise<ModelInstance>
  insertMany(dataArray: Record<string, unknown>[]): Promise<ModelInstance[]>
  update(id: number | string, data: Record<string, unknown>): Promise<ModelInstance>
  delete(id: number | string): Promise<void>
  insertGraph(data: Record<string, unknown> | Record<string, unknown>[], options?: InsertGraphOptions): Promise<any>
  upsertGraph(data: Record<string, unknown> | Record<string, unknown>[], options?: UpsertGraphOptions): Promise<any>

  hydrate(row: Record<string, unknown>): ModelInstance

  use(plugin: import("../plugins/index.js").Plugin): ModelDefinition
  makeHelper<A extends any[], R>(fn: (qb: import("../query/index.js").QueryBuilder, ...args: A) => R): (...args: A) => R
  on(event: string, callback: (model: ModelInstance) => void | Promise<void>): () => void
  getHooks(): import("../hooks/index.js").HookManager

  // Static query hooks (once per query, not per instance)
  beforeDelete(callback: import("../hooks/static.js").StaticHookCallback): () => void
  afterDelete(callback: import("../hooks/static.js").StaticHookCallback): () => void
  beforeUpdate(callback: import("../hooks/static.js").StaticHookCallback): () => void
  afterUpdate(callback: import("../hooks/static.js").StaticHookCallback): () => void
  beforeCreate(callback: import("../hooks/static.js").StaticHookCallback): () => void
  afterCreate(callback: import("../hooks/static.js").StaticHookCallback): () => void
  beforeFind(callback: import("../hooks/static.js").StaticHookCallback): () => void
  afterFind(callback: import("../hooks/static.js").StaticHookCallback): () => void

  addGlobalScope(name: string, callback: (qb: QueryBuilder) => void): void
  removeGlobalScope(name: string): void
  getGlobalScopes(): Map<string, (qb: QueryBuilder) => void> | undefined

  // Backward-compat convenience methods
  registerTimestamps?(createdAtCol?: string, updatedAtCol?: string): void
  registerSoftDeletes?(deletedAtCol?: string): void
  discover?(): Promise<never>

  _init(orm: ORMLike): void
}

// ─── MODEL CONFIG ────────────────────────────────────────────
export interface ModelConfig<TColumns extends ColumnShape = ColumnShape> {
  columns: TColumns
  relations?: Record<string, Relation>
  casts?: Record<string, string>
  /** Per-attribute accessors (`get`) and/or mutators (`set`). See {@link Attribute.make}. */
  attributes?: Record<string, Attribute<any>>
  hidden?: string[]
  visible?: string[]
  appends?: string[]
  computed?: Record<string, import("./computed.js").ComputedColumn>
}
