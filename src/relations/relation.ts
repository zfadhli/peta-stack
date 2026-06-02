import type { ModelQueryBuilder } from "../builder"
import type { Model, ModelClass } from "../model/model"
import type { PetaLike } from "../types"

export type RelationType = "hasMany" | "belongsTo" | "hasOne" | "manyToMany" | "hasManyThrough"

export interface RelationOptions {
  foreignKey?: string
  localKey?: string
  through?: string
  foreignPivotKey?: string
  relatedPivotKey?: string
  throughForeignKey?: string
  throughLocalKey?: string
  pivotExtras?: string[]
}

const thunkCache = new WeakMap<object, ModelClass>()

function resolve(thunk: () => ModelClass): ModelClass {
  let cls = thunkCache.get(thunk)
  if (!cls) {
    cls = thunk()
    thunkCache.set(thunk, cls)
  }
  return cls
}

function guessForeignKey(modelClass: ModelClass): string {
  const table = modelClass.table
  const singular = table.endsWith("s") ? table.slice(0, -1) : table
  return `${singular}Id`
}

function groupByArray(items: Model[], key: string): Record<string, Model[]> {
  const result: Record<string, Model[]> = {}
  for (const item of items) {
    const v = item.get(key)
    if (v == null) continue
    const k = String(v)
    if (!result[k]) result[k] = []
    result[k].push(item)
  }
  return result
}

export abstract class Relation<TRelated extends Model = Model> {
  readonly type: RelationType
  readonly #relatedThunk: () => ModelClass<TRelated>

  constructor(type: RelationType, relatedThunk: () => ModelClass<TRelated>) {
    this.type = type
    this.#relatedThunk = relatedThunk
  }

  get relatedModelClass(): ModelClass<TRelated> {
    return resolve(this.#relatedThunk) as ModelClass<TRelated>
  }

  abstract get foreignKey(): string
  abstract get localKey(): string
  abstract query(parent: Model): ModelQueryBuilder<TRelated>
  abstract addEagerConstraints(query: ModelQueryBuilder<TRelated>, models: Model[]): void
  abstract match(models: Model[], results: Model[], relationName: string): void
  abstract getResults(parent: Model): Promise<Model | Model[] | null>

  async loadEager(models: Model[], relationName: string, constraints?: ((qb: ModelQueryBuilder<any>) => void) | null): Promise<void> {
    const qb = this.relatedModelClass.query()
    this.addEagerConstraints(qb, models)
    if (constraints) constraints(qb)
    const results = await qb.execute()
    this.match(models, results, relationName)
  }
}

export class HasMany<TRelated extends Model = Model> extends Relation<TRelated> {
  readonly #options: RelationOptions

  constructor(relatedThunk: () => ModelClass<TRelated>, options: RelationOptions = {}) {
    super("hasMany", relatedThunk)
    this.#options = options
  }

  get foreignKey(): string {
    return this.#options.foreignKey ?? guessForeignKey(this.relatedModelClass)
  }

  get localKey(): string {
    return this.#options.localKey ?? "id"
  }

  query(parent: Model): ModelQueryBuilder<TRelated> {
    return this.relatedModelClass.query().where(this.foreignKey, "=", parent.get(this.localKey))
  }

  addEagerConstraints(query: ModelQueryBuilder<TRelated>, models: Model[]): void {
    const keys = models.map((m) => m.get(this.localKey)).filter((k) => k != null)
    if (keys.length > 0) {
      query.whereIn(this.foreignKey, keys)
    }
  }

  match(models: Model[], results: Model[], relationName: string): void {
    const grouped = groupByArray(results, this.foreignKey)
    for (const model of models) {
      const key = String(model.get(this.localKey))
      model.$setRelation(relationName, grouped[key] ?? [])
    }
  }

  async getResults(parent: Model): Promise<TRelated[]> {
    return await this.query(parent).execute()
  }
}

export class BelongsTo<TRelated extends Model = Model> extends Relation<TRelated> {
  readonly #options: RelationOptions

  constructor(relatedThunk: () => ModelClass<TRelated>, options: RelationOptions = {}) {
    super("belongsTo", relatedThunk)
    this.#options = options
  }

  get foreignKey(): string {
    return this.#options.foreignKey ?? guessForeignKey(this.relatedModelClass)
  }

  get localKey(): string {
    return this.#options.localKey ?? "id"
  }

  query(parent: Model): ModelQueryBuilder<TRelated> {
    return this.relatedModelClass.query().where(this.localKey, "=", parent.get(this.foreignKey))
  }

  addEagerConstraints(query: ModelQueryBuilder<TRelated>, models: Model[]): void {
    const keys = models.map((m) => m.get(this.foreignKey)).filter((k) => k != null)
    if (keys.length > 0) {
      query.whereIn(this.localKey, keys)
    }
  }

  match(models: Model[], results: Model[], relationName: string): void {
    const grouped = groupByArray(results, this.localKey)
    for (const model of models) {
      const key = String(model.get(this.foreignKey))
      model.$setRelation(relationName, grouped[key]?.[0] ?? null)
    }
  }

  async getResults(parent: Model): Promise<TRelated | null> {
    return (await this.query(parent).executeTakeFirst()) ?? null
  }
}

export class HasOne<TRelated extends Model = Model> extends Relation<TRelated> {
  readonly #options: RelationOptions

  constructor(relatedThunk: () => ModelClass<TRelated>, options: RelationOptions = {}) {
    super("hasOne", relatedThunk)
    this.#options = options
  }

  get foreignKey(): string {
    return this.#options.foreignKey ?? guessForeignKey(this.relatedModelClass)
  }

  get localKey(): string {
    return this.#options.localKey ?? "id"
  }

  query(parent: Model): ModelQueryBuilder<TRelated> {
    return this.relatedModelClass.query().where(this.foreignKey, "=", parent.get(this.localKey))
  }

  addEagerConstraints(query: ModelQueryBuilder<TRelated>, models: Model[]): void {
    const keys = models.map((m) => m.get(this.localKey)).filter((k) => k != null)
    if (keys.length > 0) {
      query.whereIn(this.foreignKey, keys)
    }
  }

  match(models: Model[], results: Model[], relationName: string): void {
    const grouped = groupByArray(results, this.foreignKey)
    for (const model of models) {
      const key = String(model.get(this.localKey))
      model.$setRelation(relationName, grouped[key]?.[0] ?? null)
    }
  }

  async getResults(parent: Model): Promise<TRelated | null> {
    return (await this.query(parent).executeTakeFirst()) ?? null
  }
}

export class ManyToMany<TRelated extends Model = Model> extends Relation<TRelated> {
  readonly #options: RelationOptions & { through: string }
  readonly #pivotExtras: string[]

  constructor(relatedThunk: () => ModelClass<TRelated>, options: RelationOptions & { through: string }) {
    super("manyToMany", relatedThunk)
    this.#options = options
    this.#pivotExtras = options.pivotExtras ?? []
  }

  get foreignKey(): string {
    return this.#options.foreignKey ?? guessForeignKey(this.relatedModelClass)
  }

  get localKey(): string {
    return this.#options.localKey ?? "id"
  }

  get throughTable(): string {
    return this.#options.through
  }

  get foreignPivotKey(): string {
    return this.#options.foreignPivotKey ?? snakeCase(this.foreignKey)
  }

  get relatedPivotKey(): string {
    return this.#options.relatedPivotKey ?? snakeCase(guessForeignKey(this.relatedModelClass))
  }

  #hasExtras(): boolean {
    return this.#pivotExtras.length > 0
  }

  query(parent: Model): ModelQueryBuilder<TRelated> {
    const parentKey = parent.get(this.localKey)
    const peta = this.relatedModelClass.peta
    if (!peta) return this.relatedModelClass.query()

    if (this.#hasExtras()) {
      const _relatedTable = this.relatedModelClass.table
      const peta = this.relatedModelClass.peta
      if (!peta) return this.relatedModelClass.query()
      const subQb = peta.kysely
        .selectFrom(this.throughTable)
        .select(this.relatedPivotKey)
        .where(this.foreignPivotKey, "=", parentKey)

      return this.relatedModelClass.query().whereIn("id", subQb as any)
    }

    const subquery = peta.kysely
      .selectFrom(this.throughTable)
      .select(this.relatedPivotKey)
      .where(this.foreignPivotKey, "=", parentKey)

    return this.relatedModelClass.query().whereIn("id", subquery as any)
  }

  addEagerConstraints(query: ModelQueryBuilder<TRelated>, models: Model[]): void {
    const keys = models.map((m) => m.get(this.localKey)).filter((k) => k != null)
    if (keys.length === 0) {
      query.whereIn("id", [])
      return
    }
    const relatedTable = this.relatedModelClass.table
    query.innerJoin(
      this.throughTable,
      `${this.throughTable}.${this.relatedPivotKey}`,
      `${relatedTable}.${this.localKey}`,
    )
    query.whereIn(`${this.throughTable}.${this.foreignPivotKey}`, keys)
  }

  match(models: Model[], results: Model[], relationName: string): void {
    const grouped = groupByArray(results, `_pivot_${this.foreignPivotKey}`)
    for (const model of models) {
      const key = String(model.get(this.localKey))
      const items = grouped[key] ?? []
      for (const item of items) {
        const pivotData: Record<string, unknown> = {}
        for (const ek of Object.keys((item as any).attributes ?? {})) {
          if (ek.startsWith("_pivot_")) {
            pivotData[ek.slice(7)] = item.get(ek)
          }
        }
        if (Object.keys(pivotData).length > 0) {
          item.$setRelation("_pivot", pivotData)
        }
      }
      model.$setRelation(relationName, items)
    }
  }

  async getResults(parent: Model): Promise<Model[]> {
    return await this.query(parent).execute()
  }
}

export class HasManyThrough<TRelated extends Model = Model> extends Relation<TRelated> {
  readonly #options: RelationOptions
  readonly #throughThunk: () => ModelClass

  constructor(relatedThunk: () => ModelClass<TRelated>, throughThunk: () => ModelClass, options: RelationOptions = {}) {
    super("hasManyThrough", relatedThunk)
    this.#throughThunk = throughThunk
    this.#options = options
  }

  get foreignKey(): string {
    return this.#options.foreignKey ?? guessForeignKey(resolve(this.#throughThunk))
  }

  get localKey(): string {
    return this.#options.localKey ?? "id"
  }

  get throughModelClass(): ModelClass {
    return resolve(this.#throughThunk)
  }

  get throughForeignKey(): string {
    return this.#options.throughForeignKey ?? guessForeignKey(this.relatedModelClass)
  }

  get throughLocalKey(): string {
    return this.#options.throughLocalKey ?? guessForeignKey(this.throughModelClass)
  }

  query(parent: Model): ModelQueryBuilder<TRelated> {
    const parentKey = parent.get(this.localKey)
    const peta = this.relatedModelClass.peta
    if (!peta) return this.relatedModelClass.query()

    const throughTable = this.throughModelClass.table
    const _relatedTable = this.relatedModelClass.table

    const subquery = peta.kysely
      .selectFrom(throughTable)
      .select(this.throughForeignKey)
      .where(this.foreignKey, "=", parentKey)

    return this.relatedModelClass.query().whereIn("id", subquery as any)
  }

  addEagerConstraints(query: ModelQueryBuilder<TRelated>, models: Model[]): void {
    const keys = models.map((m) => m.get(this.localKey)).filter((k) => k != null)
    if (keys.length === 0) {
      query.whereIn("id", [])
      return
    }
    const throughTable = this.throughModelClass.table
    const relatedTable = this.relatedModelClass.table
    query.innerJoin(throughTable, `${throughTable}.${this.throughForeignKey}`, `${relatedTable}.${this.localKey}`)
    query.whereIn(`${throughTable}.${this.foreignKey}`, keys)
  }

  match(models: Model[], results: Model[], relationName: string): void {
    const _throughTable = this.throughModelClass.table
    const grouped = groupByArray(results, `_through_${this.foreignKey}`)
    for (const model of models) {
      const key = String(model.get(this.localKey))
      model.$setRelation(relationName, grouped[key] ?? [])
    }
  }

  async getResults(parent: Model): Promise<Model[]> {
    const parentKey = parent.get(this.localKey)
    const peta = this.relatedModelClass.peta
    if (!peta) return []

    const throughTable = this.throughModelClass.table
    const rows = await peta.kysely
      .selectFrom(throughTable)
      .select(this.throughForeignKey)
      .where(this.foreignKey, "=", parentKey)
      .execute()

    const ids = rows.map((r: any) => r[this.throughForeignKey]).filter(Boolean)
    if (ids.length === 0) return []

    return await this.relatedModelClass.query().whereIn("id", ids).execute()
  }
}

function snakeCase(str: string): string {
  return str.charAt(0).toLowerCase() + str.slice(1).replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)
}
