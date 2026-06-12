import type { ModelDefinition, ModelInstance } from "../model/types.js"
import { createQueryBuilder } from "../query/index.js"
import type { Relation } from "./base.js"

export interface MorphToOptions {
  name: string
  type?: string
  id?: string
}

export interface MorphManyOptions {
  name: string
  related: () => ModelDefinition
  type?: string
  id?: string
}

export interface MorphOneOptions {
  name: string
  related: () => ModelDefinition
  type?: string
  id?: string
}

function groupByArray(items: ModelInstance[], key: string): Record<string, ModelInstance[]> {
  const result: Record<string, ModelInstance[]> = {}
  for (const item of items) {
    const v = item.get(key)
    if (v == null) continue
    const k = String(v)
    if (!result[k]) result[k] = []
    result[k].push(item)
  }
  return result
}

const THUNK_CACHE = new WeakMap<object, ModelDefinition>()

function resolveThunk(thunk: () => ModelDefinition): ModelDefinition {
  let cls = THUNK_CACHE.get(thunk)
  if (!cls) {
    cls = thunk()
    THUNK_CACHE.set(thunk, cls)
  }
  return cls
}

/**
 * Define a polymorphic belongsTo relationship.
 * This is a placeholder — runtime type resolution via a morph map registry is not yet implemented.
 */
export function defineMorphTo(options: MorphToOptions): Relation {
  const _morphType = options.type ?? `${options.name}Type`
  const morphId = options.id ?? `${options.name}Id`

  return {
    type: "belongsTo" as any,
    relatedModelClass: null as any,
    foreignKey: morphId,
    localKey: "id",
    get throughTable() {
      return undefined
    },
    get foreignPivotKey() {
      return undefined
    },
    get relatedPivotKey() {
      return undefined
    },
    get throughForeignKey() {
      return undefined
    },
    get throughLocalKey() {
      return undefined
    },

    query(_parent: ModelInstance): ReturnType<typeof createQueryBuilder> {
      throw new Error(
        "MorphTo query not implemented — runtime type resolution is not yet supported. Use a morph map registry.",
      )
    },

    addEagerConstraints(_query: any, _models: ModelInstance[]): void {
      // no-op
    },

    match(_models: ModelInstance[], _results: ModelInstance[], _relationName: string): void {
      // no-op
    },

    async getResults(_parent: ModelInstance): Promise<ModelInstance | null> {
      throw new Error("MorphTo getResults not implemented")
    },

    async loadEager(
      _models: ModelInstance[],
      _relationName: string,
      _constraints?: ((qb: any) => void) | null,
    ): Promise<void> {
      // no-op
    },
  }
}

/**
 * Define a polymorphic hasMany relationship.
 */
export function defineMorphMany(options: MorphManyOptions): Relation {
  const related = resolveThunk(options.related)
  const morphType = options.type ?? `${options.name}Type`
  const morphId = options.id ?? `${options.name}Id`
  const typeValue = related.table

  return {
    type: "hasMany" as any,
    relatedModelClass: related,
    foreignKey: morphId,
    localKey: "id",
    get throughTable() {
      return undefined
    },
    get foreignPivotKey() {
      return undefined
    },
    get relatedPivotKey() {
      return undefined
    },
    get throughForeignKey() {
      return undefined
    },
    get throughLocalKey() {
      return undefined
    },

    query(parent: ModelInstance): ReturnType<typeof createQueryBuilder> {
      return createQueryBuilder(related, (qb: any) => {
        qb.where(morphId, "=", parent.get("id"))
        qb.where(morphType, "=", typeValue)
      })
    },

    addEagerConstraints(query: any, models: ModelInstance[]): void {
      const ids = models.map((m) => m.get("id")).filter((id) => id != null)
      if (ids.length > 0) {
        query.whereIn(morphId, ids)
        query.where(morphType, "=", typeValue)
      }
    },

    match(models: ModelInstance[], results: ModelInstance[], relationName: string): void {
      const grouped = groupByArray(results, morphId)
      for (const model of models) {
        const key = String(model.get("id"))
        model.$setRelation(relationName, grouped[key] ?? [])
      }
    },

    async getResults(parent: ModelInstance): Promise<ModelInstance[]> {
      return this.query(parent).execute()
    },

    async loadEager(
      models: ModelInstance[],
      relationName: string,
      constraints?: ((qb: any) => void) | null,
    ): Promise<void> {
      if (models.length === 0) return
      const qb = createQueryBuilder(related)
      this.addEagerConstraints(qb, models)
      if (constraints) constraints(qb)
      const results = await qb.execute()
      this.match(models, results, relationName)
    },
  }
}

/**
 * Define a polymorphic hasOne relationship.
 */
export function defineMorphOne(options: MorphOneOptions): Relation {
  const base = defineMorphMany(options as MorphManyOptions)
  return {
    ...base,
    type: "hasOne" as any,

    async getResults(parent: ModelInstance): Promise<ModelInstance | null> {
      const results = await base.getResults(parent)
      return (results as ModelInstance[])[0] ?? null
    },

    match(models: ModelInstance[], results: ModelInstance[], relationName: string): void {
      const grouped = groupByArray(results, base.foreignKey)
      for (const model of models) {
        const key = String(model.get("id"))
        const related = grouped[key] ?? []
        model.$setRelation(relationName, related[0] ?? null)
      }
    },
  }
}
