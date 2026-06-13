import type { ModelDefinition, ModelInstance } from "../model/types.js"
import type { QueryBuilder } from "../query/index.js"
import { createQueryBuilder } from "../query/index.js"
import type { Relation } from "./base.js"

// ─── OPTIONS TYPES ─────────────────────────────────────────────

export interface MorphToOptions {
  /** Base name for the polymorphic relation (e.g. "commentable" → commentableType, commentableId) */
  name: string
  /** Custom type column name. Default: `${name}Type` */
  type?: string
  /** Custom id column name. Default: `${name}Id` */
  id?: string
  /**
   * Registry mapping type column values to model definition thunks.
   * Example: { posts: () => Post, videos: () => Video }
   * This is required for runtime resolution.
   */
  morphMap?: Record<string, () => ModelDefinition>
}

export interface MorphManyOptions {
  name: string
  related: () => ModelDefinition
  type?: string
  id?: string
  /**
   * The value stored in the type column for this parent model.
   * Should be unique per parent model type (e.g. the parent's table name).
   * If omitted, defaults to the child's table name (the `related` model's table).
   */
  typeValue?: string
}

export interface MorphOneOptions {
  name: string
  related: () => ModelDefinition
  type?: string
  id?: string
  typeValue?: string
}

// ─── HELPERS ───────────────────────────────────────────────────

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

export function resolveThunk(thunk: () => ModelDefinition): ModelDefinition {
  let cls = THUNK_CACHE.get(thunk)
  if (!cls) {
    cls = thunk()
    THUNK_CACHE.set(thunk, cls)
  }
  return cls
}

/**
 * Resolve the related model for a MorphTo relation given a parent instance.
 * Looks up the parent's `{name}Type` column value in the relation's morphMap
 * and returns the corresponding ModelDefinition.
 *
 * Returns `undefined` if the type column is null, the morph map entry is
 * missing, or the relation is not a morphTo.
 */
export function resolveMorphRelation(relation: Relation, parent: ModelInstance): ModelDefinition | undefined {
  const morphMap = relation._morphMap
  const morphType = relation._morphType
  if (!morphMap || !morphType) return undefined

  const typeValue = parent.get(morphType) as string | undefined
  if (!typeValue) return undefined
  const thunk = morphMap[typeValue]
  return thunk ? resolveThunk(thunk) : undefined
}

// ─── DEFINE MORPH TO (polymorphic belongsTo) ──────────────────

/**
 * Define a polymorphic belongsTo relationship.
 *
 * Requires a `morphMap` to resolve the related model class at runtime
 * based on the value of the type column.
 *
 * ### Usage
 * ```ts
 * Comment.relations.commentable = defineMorphTo({
 *   name: "commentable",
 *   morphMap: {
 *     posts: () => Post,
 *     videos: () => Video,
 *   },
 * })
 * ```
 *
 * Eager loading groups parents by type and issues one query per type:
 * ```ts
 * const comments = await Comment.query().with("commentable")
 * // → SELECT * FROM comments
 * // → SELECT * FROM posts WHERE id IN (...)
 * // → SELECT * FROM videos WHERE id IN (...)
 * ```
 */
export function defineMorphTo(options: MorphToOptions): Relation {
  const morphType = options.type ?? `${options.name}Type`
  const morphId = options.id ?? `${options.name}Id`
  const morphMap = options.morphMap ?? {}

  // Resolve a sensible default for relatedModelClass (first morph map entry, if any)
  const firstEntry = Object.entries(morphMap)[0]
  const defaultRelated = firstEntry ? resolveThunk(firstEntry[1]) : null

  const morphToRelation: Relation = {
    type: "belongsTo",
    relatedModelClass: defaultRelated ?? (null as unknown as ModelDefinition),
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

    // Store morph metadata for runtime resolution
    _morphMap: morphMap,
    _morphType: morphType,
    _morphId: morphId,

    /**
     * Build a query for the related model.
     * Throws if the type column is null/undefined or if no model is registered
     * for the type value.
     */
    query(parent: ModelInstance): ReturnType<typeof createQueryBuilder> {
      const typeValue = parent.get(morphType) as string | undefined
      if (!typeValue) {
        throw new Error(`Cannot resolve morphTo "${options.name}": "${morphType}" is null on ${defName(parent)}`)
      }

      const thunk = morphMap[typeValue]
      if (!thunk) {
        throw new Error(
          `No model registered for morph type "${typeValue}" in morphTo "${options.name}". ` +
            `Available types: ${Object.keys(morphMap).join(", ") || "(none)"}`,
        )
      }

      const relatedDef = resolveThunk(thunk)
      const id = parent.get(morphId)
      if (id == null) {
        throw new Error(`Cannot resolve morphTo "${options.name}": "${morphId}" is null on ${defName(parent)}`)
      }
      return relatedDef.query().where("id", "=", id)
    },

    addEagerConstraints(_query: QueryBuilder, _models: ModelInstance[]): void {
      // No-op: eager loading for morphTo is handled entirely in loadEager,
      // which groups by type and issues per-type queries
    },

    match(_models: ModelInstance[], _results: ModelInstance[], _relationName: string): void {
      // No-op: matching is done in loadEager
    },

    async getResults(parent: ModelInstance): Promise<ModelInstance | null> {
      const qb = this.query(parent)
      return (await qb.executeTakeFirst()) ?? null
    },

    async loadEager(
      models: ModelInstance[],
      relationName: string,
      constraints?: ((qb: QueryBuilder) => void) | null,
    ): Promise<void> {
      if (models.length === 0) return

      // Group parent models by the value of their type column
      const grouped: Record<string, ModelInstance[]> = {}
      const nullType: ModelInstance[] = []

      for (const model of models) {
        const typeValue = model.get(morphType) as string | undefined
        if (typeValue) {
          if (!grouped[typeValue]) grouped[typeValue] = []
          grouped[typeValue].push(model)
        } else {
          nullType.push(model)
        }
      }

      // Parents with null type column get null relation
      for (const model of nullType) {
        model.$setRelation(relationName, null)
      }

      // For each type group, resolve the related model and issue a single query
      for (const [typeValue, typeModels] of Object.entries(grouped)) {
        const thunk = morphMap[typeValue]
        if (!thunk) {
          for (const model of typeModels) {
            model.$setRelation(relationName, null)
          }
          continue
        }

        const relatedDef = resolveThunk(thunk)
        const ids = typeModels.map((m) => m.get(morphId)).filter((id) => id != null)

        if (ids.length === 0) {
          for (const model of typeModels) {
            model.$setRelation(relationName, null)
          }
          continue
        }

        // Build the query for this type using the related model's query builder
        const qb = relatedDef.query()
        qb.whereIn("id", ids)
        if (constraints) constraints(qb)
        const results = await qb.execute()

        // Match results by their id
        const resultMap = new Map<unknown, ModelInstance>()
        for (const r of results) {
          resultMap.set(r.get("id"), r)
        }

        for (const model of typeModels) {
          model.$setRelation(relationName, resultMap.get(model.get(morphId)) ?? null)
        }
      }
    },
  }
  return morphToRelation
}

// ─── DEFINE MORPH MANY (polymorphic hasMany) ──────────────────

/**
 * Define a polymorphic hasMany relationship.
 * The related table stores the parent's type and id.
 */
export function defineMorphMany(options: MorphManyOptions): Relation {
  const related = resolveThunk(options.related)
  const morphType = options.type ?? `${options.name}Type`
  const morphId = options.id ?? `${options.name}Id`
  const typeValue = options.typeValue ?? related.table

  const morphManyRelation: Relation = {
    type: "hasMany",
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

    // Morph metadata for graph operations and type column injection
    _morphType: morphType,
    _morphId: morphId,
    _morphTypeValue: typeValue,

    query(parent: ModelInstance): ReturnType<typeof createQueryBuilder> {
      const qb = createQueryBuilder(related)
      qb.where(morphId, "=", parent.get("id"))
      qb.where(morphType, "=", typeValue)
      return qb
    },

    addEagerConstraints(query: QueryBuilder, models: ModelInstance[]): void {
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
      constraints?: ((qb: QueryBuilder) => void) | null,
    ): Promise<void> {
      if (models.length === 0) return
      const qb = createQueryBuilder(related)
      this.addEagerConstraints(qb, models)
      if (constraints) constraints(qb)
      const results = await qb.execute()
      this.match(models, results, relationName)
    },
  }
  return morphManyRelation
}

// ─── DEFINE MORPH ONE (polymorphic hasOne) ────────────────────

/**
 * Define a polymorphic hasOne relationship.
 */
export function defineMorphOne(options: MorphOneOptions): Relation {
  const base = defineMorphMany(options as MorphManyOptions)
  const morphOneRelation: Relation = {
    ...base,
    type: "hasOne",

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
  return morphOneRelation
}

// ─── INTERNAL HELPERS ──────────────────────────────────────────

function defName(instance: ModelInstance): string {
  // ModelInstance is a plain object, not a class — use a best-effort identifier
  return (instance as { constructor?: { name?: string } }).constructor?.name ?? "model"
}
