import { createDeleteBuilder } from "../builder/delete.js"
import type { QueryBuilder } from "../builder/query.js"
import { createQueryBuilder } from "../builder/query.js"
import { createUpdateBuilder } from "../builder/update.js"
import type { ColumnShape } from "../columns/column.js"
import { ModelNotRegisteredError } from "../errors.js"
import type { Database } from "../lib/kysely.js"
import type { Relation } from "../relations/relation.js"
import type { ModelLike, PetaLike } from "../types.js"
import { deleteModel, forceDeleteModel, restoreModel, trashedModel } from "./delete.js"
import { getHooksFor, registerSoftDeletesFor, registerTimestampsFor } from "./hooks.js"
import { loadModelRelations, setModelDef } from "./relation.js"
import { insertManyModel, insertModel, reloadModel, saveModel } from "./save.js"
import { addScope, getScopes, removeScope } from "./scope.js"
import { modelToJSON } from "./serialize.js"
import {
  fillAttrs,
  getAttr,
  getDirtyAttributes,
  getExists,
  getRawRelations,
  getState,
  initState,
  isDirty,
  resetAttrs,
  setAttr,
  setExists,
} from "./state.js"

export interface ModelInstance extends ModelLike {
  exists: boolean
  readonly attributes: Readonly<Record<string, unknown>>
  readonly dirtyAttributes: Partial<Record<string, unknown>>
  readonly isDirty: boolean
  get<T = unknown>(key: string): T
  set(key: string, value: unknown): void
  fill(data: Partial<Record<string, unknown>>): void
  reset(): void
  $getRelation(name: string): ModelInstance | ModelInstance[] | null
  $setRelation(name: string, value: ModelInstance | ModelInstance[] | Record<string, unknown> | null): void
  $hasRelation(name: string): boolean
  $relationData(): Record<string, ModelInstance | ModelInstance[] | null>
  $load(...names: string[]): Promise<void>
  toJSON(): Record<string, unknown>
  $toJSON(visited?: WeakSet<ModelInstance>): Record<string, unknown>
  $save(): Promise<ModelInstance>
  $delete(): Promise<void>
  $forceDelete(): Promise<void>
  $restore(): Promise<void>
  $trashed(): boolean
  $reload(): Promise<ModelInstance>
}

export interface ModelDefinition {
  readonly table: string
  readonly columns: ColumnShape
  readonly relations: Record<string, Relation>
  readonly name: string
  _peta: PetaLike | null
  _config: ModelConfig
  _init(): ModelInstance
  _hydrate(row: Record<string, unknown>): ModelInstance
  query(): QueryBuilder
  find(id: number | string): Promise<ModelInstance | undefined>
  findOrFail(id: number | string): Promise<ModelInstance>
  insert(data: Record<string, unknown>): Promise<ModelInstance>
  insertMany(dataArray: Record<string, unknown>[], kysely?: Database): Promise<ModelInstance[]>
  update(id: number | string, data: Record<string, unknown>, kysely?: Database): Promise<ModelInstance>
  delete(id: number | string, kysely?: Database): Promise<void>
  hydrate(row: Record<string, unknown>): ModelInstance
  transaction<T>(fn: (kysely: Database) => Promise<T>): Promise<T>
  on(event: string, callback: (model: ModelInstance) => void | Promise<void>): void
  readonly hooks: ReturnType<typeof getHooksFor>
  addGlobalScope(name: string, callback: (qb: QueryBuilder) => void): void
  removeGlobalScope(name: string): void
  getGlobalScopes(): Map<string, (qb: QueryBuilder) => void>
  registerTimestamps(createdAtColumn?: string, updatedAtColumn?: string): void
  registerSoftDeletes(deletedAtColumn?: string): void
}

export interface ModelConfig<TColumns extends ColumnShape = ColumnShape> {
  columns: TColumns
  relations?: Record<string, Relation>
  casts?: Record<string, string>
  hidden?: string[]
  visible?: string[]
  appends?: string[]
}

let INSTANCE_ID = 0

export function defineModel<TColumns extends ColumnShape>(
  table: string,
  config: ModelConfig<TColumns>,
): ModelDefinition {
  const columns = config.columns
  const relations = config.relations ?? {}
  const def: ModelDefinition = {
    table,
    columns,
    relations,
    name: table.charAt(0).toUpperCase() + table.slice(1),
    _peta: null,
    _config: config as ModelConfig,
    _init(): ModelInstance {
      return createInstance(def, config)
    },
    _hydrate(row: Record<string, unknown>): ModelInstance {
      const instance = createInstance(def, config)
      const state = getState(instance)
      state.attributes = { ...row }
      state.original = { ...row }
      state.exists = true
      return instance
    },
    query() {
      const peta = def._peta
      if (!peta) throw new ModelNotRegisteredError(def.name)
      return createQueryBuilder(def, peta)
    },
    find(id: number | string): Promise<ModelInstance | undefined> {
      return def.query().find(id)
    },
    findOrFail(id: number | string): Promise<ModelInstance> {
      return def.query().findOrFail(id)
    },
    insert(data: Record<string, unknown>): Promise<ModelInstance> {
      return insertModel(def, data)
    },
    insertMany(dataArray: Record<string, unknown>[], kysely?: Database): Promise<ModelInstance[]> {
      return insertManyModel(def, dataArray, kysely)
    },
    async update(id: number | string, data: Record<string, unknown>, kysely?: Database): Promise<ModelInstance> {
      const peta = def._peta
      if (!peta) throw new ModelNotRegisteredError(def.name)
      return createUpdateBuilder(def, peta, kysely).execute(id, data)
    },
    async delete(id: number | string, kysely?: Database): Promise<void> {
      const peta = def._peta
      if (!peta) throw new ModelNotRegisteredError(def.name)
      return createDeleteBuilder(def, peta, kysely).execute(id)
    },
    hydrate(row: Record<string, unknown>): ModelInstance {
      return def._hydrate(row)
    },
    transaction<T>(fn: (kysely: Database) => Promise<T>): Promise<T> {
      const peta = def._peta
      if (!peta) throw new ModelNotRegisteredError(def.name)
      return peta.transaction(fn)
    },
    on(event: string, callback: (model: ModelInstance) => void | Promise<void>): void {
      getHooksFor(def).on(event as never, callback as never)
    },
    get hooks() {
      return getHooksFor(def)
    },
    addGlobalScope(name: string, callback: (qb: QueryBuilder) => void): void {
      addScope(def, name, callback as never)
    },
    removeGlobalScope(name: string): void {
      removeScope(def, name)
    },
    getGlobalScopes(): Map<string, (qb: QueryBuilder) => void> {
      return getScopes(def) as never
    },
    registerTimestamps(createdAtColumn = "createdAt", updatedAtColumn = "updatedAt"): void {
      registerTimestampsFor(def, createdAtColumn, updatedAtColumn)
    },
    registerSoftDeletes(deletedAtColumn = "deletedAt"): void {
      registerSoftDeletesFor(def, deletedAtColumn)
    },
  }
  return def
}

const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"])

function createInstance(def: ModelDefinition, config: ModelConfig): ModelInstance {
  const id = ++INSTANCE_ID
  const instance: ModelInstance = {
    instanceId: id,
    get exists(): boolean {
      return getExists(instance)
    },
    set exists(value: boolean) {
      setExists(instance, value)
    },
    get attributes(): Readonly<Record<string, unknown>> {
      return getState(instance).attributes
    },
    get dirtyAttributes(): Partial<Record<string, unknown>> {
      return getDirtyAttributes(instance)
    },
    get isDirty(): boolean {
      return isDirty(instance)
    },
    get<T = unknown>(key: string): T {
      const self = instance as unknown as Record<string, unknown>
      const accessor = `get${key.charAt(0).toUpperCase()}${key.slice(1)}Attribute`
      if (typeof self[accessor] === "function") return self[accessor]() as T
      const val = getAttr(instance, key)
      const casts = config.casts ?? {}
      if (casts[key]) return castValue(val, casts[key]) as T
      return val as T
    },
    set(key: string, value: unknown): void {
      if (FORBIDDEN_KEYS.has(key)) return
      const self = instance as unknown as Record<string, unknown>
      const mutator = `set${key.charAt(0).toUpperCase()}${key.slice(1)}Attribute`
      if (typeof self[mutator] === "function") {
        self[mutator](value)
        return
      }
      // Auto-stringify objects for json-cast columns
      const casts = config.casts ?? {}
      if (casts[key] === "json" && value !== null && typeof value === "object") {
        setAttr(instance, key, JSON.stringify(value))
        return
      }
      setAttr(instance, key, value)
    },
    fill(data: Partial<Record<string, unknown>>): void {
      const casts = config.casts ?? {}
      const processed: Record<string, unknown> = {}
      for (const [key, val] of Object.entries(data)) {
        if (casts[key] === "json" && val !== null && typeof val === "object") {
          processed[key] = JSON.stringify(val)
        } else {
          processed[key] = val
        }
      }
      fillAttrs(instance, processed)
    },
    reset(): void {
      resetAttrs(instance)
    },
    $getRelation(name: string): ModelInstance | ModelInstance[] | null {
      return (getRawRelations(instance)[name] as ModelInstance | ModelInstance[] | null) ?? null
    },
    $setRelation(name: string, value: ModelInstance | ModelInstance[] | Record<string, unknown> | null): void {
      ;(getRawRelations(instance) as Record<string, unknown>)[name] = value
    },
    $hasRelation(name: string): boolean {
      return name in getRawRelations(instance)
    },
    $relationData(): Record<string, ModelInstance | ModelInstance[] | null> {
      const raw = getRawRelations(instance)
      const result: Record<string, ModelInstance | ModelInstance[] | null> = {}
      for (const key of Object.keys(raw)) result[key] = raw[key] as never
      return result
    },
    async $load(...names: string[]): Promise<void> {
      await loadModelRelations(instance, ...names)
    },
    toJSON(): Record<string, unknown> {
      return instance.$toJSON()
    },
    $toJSON(visited?: WeakSet<ModelInstance>): Record<string, unknown> {
      return modelToJSON(def, instance, visited)
    },
    async $save(): Promise<ModelInstance> {
      await saveModel(def, instance)
      return instance
    },
    async $delete(): Promise<void> {
      await deleteModel(def, instance)
    },
    async $forceDelete(): Promise<void> {
      await forceDeleteModel(def, instance)
    },
    async $restore(): Promise<void> {
      await restoreModel(def, instance)
    },
    $trashed(): boolean {
      return trashedModel(def, instance)
    },
    async $reload(): Promise<ModelInstance> {
      await reloadModel(def, instance)
      return instance
    },
  }
  initState(instance)
  setModelDef(instance, def)
  return instance
}

function castValue(value: unknown, type: string): unknown {
  switch (type) {
    case "date":
      return value ? new Date(value as string) : value
    case "json":
      return typeof value === "string" ? JSON.parse(value) : value
    case "boolean":
      return value === true || value === 1 || value === "1" || value === "true"
    case "float":
      return value != null ? Number(value) : value
    case "integer":
      return value != null ? Math.round(Number(value)) : value
    default:
      return value
  }
}
