export type ModelId = number & { readonly __brand: "ModelId" }

export interface ModelLike {
  instanceId: number
  get<T = unknown>(key: string): T
  set(key: string, value: unknown): void
}

import type { ColumnShape } from "./columns/column.js"

export interface ORMLike {
  readonly kysely: import("./lib/kysely.js").Database
  register(model: ModelDefinition<any>): void
  registerAll(...models: ModelDefinition<any>[]): void
  destroy(): Promise<void>
  transaction<T>(fn: (trx: import("kysely").Kysely<Record<string, never>>) => Promise<T>): Promise<T>
  readonly models: ReadonlyMap<string, ModelDefinition<any>>
  getModel<T extends ColumnShape = ColumnShape>(name: string): ModelDefinition<T> | undefined
}

export interface ModelDefinition<TColumns extends ColumnShape = ColumnShape> {
  readonly table: string
  readonly columns: TColumns
  readonly relations: Record<string, import("./relations/base.js").Relation>
  readonly name: string
  _orm: ORMLike | null
  query(): import("./query/index.js").QueryBuilder
  find(id: number | string): Promise<import("./model/types.js").ModelInstance | undefined>
  findOrFail(id: number | string): Promise<import("./model/types.js").ModelInstance>
  first(): Promise<import("./model/types.js").ModelInstance | undefined>
  create(data: Record<string, unknown>): Promise<import("./model/types.js").ModelInstance>
  insert(data: Record<string, unknown>): Promise<import("./model/types.js").ModelInstance>
  insertMany(dataArray: Record<string, unknown>[]): Promise<import("./model/types.js").ModelInstance[]>
  update(id: number | string, data: Record<string, unknown>): Promise<import("./model/types.js").ModelInstance>
  delete(id: number | string): Promise<void>
  hydrate(row: Record<string, unknown>): import("./model/types.js").ModelInstance
  on(event: string, callback: (model: import("./model/types.js").ModelInstance) => void | Promise<void>): () => void
  getHooks(): import("./hooks/index.js").HookManager
  addGlobalScope(name: string, callback: (qb: import("./query/index.js").QueryBuilder) => void): void
  removeGlobalScope(name: string): void
  getGlobalScopes(): Map<string, (qb: import("./query/index.js").QueryBuilder) => void> | undefined
  _init(orm: ORMLike): void
}
