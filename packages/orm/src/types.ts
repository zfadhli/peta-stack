import type { Kysely } from "kysely"
import type { ColumnShape, ColumnValue } from "./columns/column.js"

export type Database = Kysely<Record<string, never>>

import type { ModelDefinition } from "./model/types.js"

export interface ModelLike<TColumns extends ColumnShape = ColumnShape> {
  get<K extends keyof TColumns>(key: K): ColumnValue<TColumns[K]>
  get(key: string): unknown
  set(key: string, value: unknown): void
}

export interface ORMLike {
  readonly kysely: Database
  register(model: ModelDefinition<any>): void
  registerAll(...models: (ModelDefinition<any> | ModelDefinition<any>[])[]): void
  destroy(): Promise<void>
  transaction<T>(fn: (orm: ORMLike) => Promise<T>): Promise<T>
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
