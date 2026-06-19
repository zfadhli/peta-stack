export type ModelId = number & { readonly __brand: "ModelId" }

import type { ColumnShape, ColumnValue } from "./columns/column.js"

export interface ModelLike<TColumns extends ColumnShape = ColumnShape> {
  get<K extends keyof TColumns>(key: K): ColumnValue<TColumns[K]>
  get(key: string): unknown
  set(key: string, value: unknown): void
}

export interface ORMLike {
  readonly kysely: import("./lib/kysely.js").Database
  register(model: ModelDefinition<any>): void
  registerAll(...models: (ModelDefinition<any> | ModelDefinition<any>[])[]): void
  destroy(): Promise<void>
  transaction<T>(fn: (trx: import("kysely").Kysely<Record<string, never>>) => Promise<T>): Promise<T>
  readonly models: ReadonlyMap<string, ModelDefinition<any>>
  getModel<T extends ColumnShape = ColumnShape>(name: string): ModelDefinition<T> | undefined
  /**
   * Discover model definitions by scanning files matching a glob pattern.
   *
   * Uses `fast-glob` to resolve the pattern relative to `cwd`, then dynamically
   * imports each matching file and collects exported `ModelDefinition` values.
   * Does **not** auto-register — use `registerAll(...result)` to register them.
   *
   * @param pattern  Glob pattern (e.g. `"./src/models/**\/*.ts"`)
   * @returns  Array of discovered model definitions
   */
  discover(pattern: string): Promise<ModelDefinition<any>[]>
}

export interface ModelDefinition<TColumns extends ColumnShape = ColumnShape> {
  readonly table: string
  readonly columns: TColumns
  readonly relations: Record<string, import("./relations/base.js").Relation>
  readonly name: string
  _orm: ORMLike | null
  query(): import("./query/index.js").QueryBuilder<TColumns>
  find(id: number | string): Promise<import("./model/types.js").ModelInstance<TColumns> | undefined>
  findOrFail(id: number | string): Promise<import("./model/types.js").ModelInstance<TColumns>>
  first(): Promise<import("./model/types.js").ModelInstance<TColumns> | undefined>
  create(data: Record<string, unknown>): Promise<import("./model/types.js").ModelInstance<TColumns>>
  insert(data: Record<string, unknown>): Promise<import("./model/types.js").ModelInstance<TColumns>>
  insertMany(dataArray: Record<string, unknown>[]): Promise<import("./model/types.js").ModelInstance<TColumns>[]>
  update(id: number | string, data: Record<string, unknown>): Promise<import("./model/types.js").ModelInstance<TColumns>>
  delete(id: number | string): Promise<void>
  hydrate(row: Record<string, unknown>): import("./model/types.js").ModelInstance<TColumns>
  on(event: string, callback: (model: import("./model/types.js").ModelInstance<TColumns>) => void | Promise<void>): () => void
  getHooks(): import("./hooks/index.js").HookManager
  addGlobalScope(name: string, callback: (qb: import("./query/index.js").QueryBuilder) => void): void
  removeGlobalScope(name: string): void
  getGlobalScopes(): Map<string, (qb: import("./query/index.js").QueryBuilder) => void> | undefined
  _init(orm: ORMLike): void
}
