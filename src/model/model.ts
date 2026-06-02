import type { Kysely } from "kysely"
import { DeleteBuilder, ModelQueryBuilder, UpdateBuilder } from "../builder"
import { ModelNotRegisteredError } from "../errors/errors"
import { HookManager, type LifecycleEvent } from "../hooks/lifecycle"
import type { Relation } from "../relations/relation"
import type { PetaLike } from "../types"
import type { ColumnShape } from "../columns/column"
import { initState, getAttr, setAttr, fillAttrs, resetAttrs, isDirty, getDirtyAttributes, getExists, setExists, getState, getRawRelations } from "./model-state"
import { getHooksFor, registerTimestampsFor, registerSoftDeletesFor } from "./model-hooks"
import { addScope, removeScope, getScopes } from "./model-scope"
import { saveModel, insertModel, insertManyModel } from "./model-save"
import { deleteModel, forceDeleteModel, restoreModel, trashedModel, reloadModel } from "./model-delete"
import { modelToJSON } from "./model-serialize"
import { loadModelRelations } from "./model-relation"

export type RelationMap = Record<string, Relation>

export type ModelClass<T extends Model = Model> = {
  new (): T
  table: string
  columns: ColumnShape
  relations: RelationMap
  peta: PetaLike | null
  readonly name: string
  $casts: Record<string, string>
  $hidden: string[]
  $visible: string[]
  $appends: string[]
  hydrate(row: Record<string, unknown>): T
  query(): ModelQueryBuilder<T>
  find(id: number | string): Promise<T | undefined>
  findOrFail(id: number | string): Promise<T>
  on(event: LifecycleEvent, callback: (model: any) => void | Promise<void>): void
  readonly hooks: HookManager
  getGlobalScopes(): Map<string, (qb: any) => void>
  addGlobalScope(name: string, callback: (qb: any) => void): void
  removeGlobalScope(name: string): void
  transaction<TResult>(fn: (kysely: Kysely<any>) => Promise<TResult>): Promise<TResult>
  insert(data: Record<string, unknown>): Promise<T>
  insertMany(dataArray: Record<string, unknown>[], kysely?: Kysely<any>): Promise<T[]>
  update(id: number | string, data: Record<string, unknown>, kysely?: Kysely<any>): Promise<T>
  delete(id: number | string, kysely?: Kysely<any>): Promise<void>
  registerTimestamps(createdAtColumn?: string, updatedAtColumn?: string): void
  registerSoftDeletes(deletedAtColumn?: string): void
}

export type ColumnData = Record<string, unknown>

let MODEL_ID = 0

export class Model {
  static table = ""
  static columns: ColumnShape = {}
  static relations: RelationMap = {}
  static peta: PetaLike | null = null
  static $casts: Record<string, string> = {}
  static $hidden: string[] = []
  static $visible: string[] = []
  static $appends: string[] = []

  readonly #id: number

  constructor() {
    this.#id = ++MODEL_ID
    initState(this)
  }

  // Hooks — static
  static get hooks(): HookManager {
    return getHooksFor(this)
  }

  static on(event: LifecycleEvent, callback: (model: any) => void | Promise<void>): void {
    this.hooks.on(event, callback)
  }

  // Attributes
  get exists(): boolean {
    return getExists(this)
  }

  set exists(value: boolean) {
    setExists(this, value)
  }

  get attributes(): Readonly<ColumnData> {
    return getState(this).attributes
  }

  get dirtyAttributes(): Partial<ColumnData> {
    return getDirtyAttributes(this)
  }

  get isDirty(): boolean {
    return isDirty(this)
  }

  get(key: string): unknown {
    const modelClass = this.constructor as ModelClass
    const accessor = `get${key.charAt(0).toUpperCase() + key.slice(1)}Attribute`
    const self = this as any
    if (typeof self[accessor] === "function") {
      return self[accessor]()
    }
    const val = getAttr(this, key)
    const casts = modelClass.$casts
    if (casts?.[key]) {
      return this.#castGet(val, casts[key])
    }
    return val
  }

  set(key: string, value: unknown): void {
    if (Model.#FORBIDDEN.has(key)) return
    const mutator = `set${key.charAt(0).toUpperCase() + key.slice(1)}Attribute`
    if (typeof (this as any)[mutator] === "function") {
      ;(this as any)[mutator](value)
      return
    }
    setAttr(this, key, value)
  }

  fill(data: Partial<ColumnData>): void {
    fillAttrs(this, data as Record<string, unknown>)
  }

  reset(): void {
    resetAttrs(this)
  }

  static #FORBIDDEN = new Set<string>(["__proto__", "constructor", "prototype"])

  #castGet(value: unknown, type: string): unknown {
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

  // Relations
  $getRelation(name: string): Model | Model[] | null {
    return (getRawRelations(this)[name] as Model | Model[] | null) ?? null
  }

  $setRelation(name: string, value: Model | Model[] | Record<string, unknown> | null): void {
    (getRawRelations(this) as Record<string, unknown>)[name] = value
  }

  $hasRelation(name: string): boolean {
    return name in getRawRelations(this)
  }

  $relationData(): Record<string, Model | Model[] | null> {
    const raw = getRawRelations(this)
    const result: Record<string, Model | Model[] | null> = {}
    for (const key of Object.keys(raw)) {
      result[key] = raw[key] as Model | Model[] | null
    }
    return result
  }

  async $load(...names: string[]): Promise<void> {
    await loadModelRelations(this, ...names)
  }

  $relatedQuery(name: string): ModelQueryBuilder<any> {
    const mc = this.constructor as ModelClass
    const rel = mc.relations[name]
    if (!rel) throw new Error(`Relation ${name} not found on ${mc.table}`)
    return rel.query(this)
  }

  // Serialization
  toJSON(): ColumnData {
    return this.$toJSON()
  }

  $toJSON(visited?: WeakSet<Model>): ColumnData {
    return modelToJSON(this, visited)
  }

  // Persistence
  async $save(): Promise<this> {
    await saveModel(this)
    return this
  }

  async $delete(): Promise<void> {
    await deleteModel(this)
  }

  async $forceDelete(): Promise<void> {
    await forceDeleteModel(this)
  }

  async $restore(): Promise<void> {
    await restoreModel(this)
  }

  $trashed(): boolean {
    return trashedModel(this)
  }

  async $reload(): Promise<this> {
    await reloadModel(this)
    return this
  }

  // Static methods
  static query<T extends Model>(this: ModelClass<T>, kysely?: Kysely<any>): ModelQueryBuilder<T> {
    const peta = this.peta
    if (!peta) throw new ModelNotRegisteredError(this.name)
    return new ModelQueryBuilder<T>(this, peta, kysely)
  }

  static async transaction<T>(this: ModelClass, fn: (kysely: Kysely<any>) => Promise<T>): Promise<T> {
    const peta = this.peta
    if (!peta) throw new ModelNotRegisteredError(this.name)
    return await peta.transaction(fn)
  }

  static find<T extends Model>(this: ModelClass<T>, id: number | string): Promise<T | undefined> {
    return this.query().find(id)
  }

  static findOrFail<T extends Model>(this: ModelClass<T>, id: number | string): Promise<T> {
    return this.query().findOrFail(id)
  }

  static update<T extends Model>(
    this: ModelClass<T>,
    id: number | string,
    data: Record<string, unknown>,
    kysely?: Kysely<any>,
  ): Promise<T> {
    const peta = this.peta
    if (!peta) throw new ModelNotRegisteredError(this.name)
    return new UpdateBuilder(this, peta, kysely).execute(id, data)
  }

  static delete<T extends Model>(this: ModelClass<T>, id: number | string, kysely?: Kysely<any>): Promise<void> {
    const peta = this.peta
    if (!peta) throw new ModelNotRegisteredError(this.name)
    return new DeleteBuilder(this, peta, kysely).execute(id)
  }

  static hydrate<T extends Model>(this: ModelClass<T>, row: Record<string, unknown>): T {
    const instance = new this()
    const state = getState(instance)
    state.attributes = { ...row }
    state.original = { ...row }
    state.exists = true
    return instance
  }

  static async insert<T extends Model>(this: ModelClass<T>, data: Record<string, unknown>): Promise<T> {
    return await insertModel.call(this, data) as T
  }

  static async insertMany<T extends Model>(
    this: ModelClass<T>,
    dataArray: Record<string, unknown>[],
    kysely?: Kysely<any>,
  ): Promise<T[]> {
    return await insertManyModel.call(this, dataArray, kysely) as T[]
  }

  // Global scopes
  static addGlobalScope(name: string, callback: (qb: any) => void): void {
    addScope(this, name, callback)
  }

  static removeGlobalScope(name: string): void {
    removeScope(this, name)
  }

  static getGlobalScopes(): Map<string, (qb: any) => void> {
    return getScopes(this)
  }

  // Timestamps & Soft deletes
  static registerTimestamps(createdAtColumn: string = "createdAt", updatedAtColumn: string = "updatedAt"): void {
    registerTimestampsFor(this, createdAtColumn, updatedAtColumn)
  }

  static registerSoftDeletes(deletedAtColumn: string = "deletedAt"): void {
    registerSoftDeletesFor(this, deletedAtColumn)
  }
}
