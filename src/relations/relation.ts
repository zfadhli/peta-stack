import type { QueryBuilder } from "../builder/query.js"
import { createQueryBuilder } from "../builder/query.js"
import type { ModelDefinition, ModelInstance } from "../model/index.js"

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

export interface Relation {
  readonly type: RelationType
  readonly relatedModelClass: ModelDefinition
  readonly foreignKey: string
  readonly localKey: string
  readonly throughTable?: string
  readonly foreignPivotKey?: string
  readonly relatedPivotKey?: string
  readonly throughForeignKey?: string
  readonly throughLocalKey?: string
  query(parent: ModelInstance): QueryBuilder
  addEagerConstraints(query: QueryBuilder, models: ModelInstance[]): void
  match(models: ModelInstance[], results: ModelInstance[], relationName: string): void
  getResults(parent: ModelInstance): Promise<ModelInstance | ModelInstance[] | null>
  loadEager(
    models: ModelInstance[],
    relationName: string,
    constraints?: ((qb: QueryBuilder) => void) | null,
  ): Promise<void>
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

function guessForeignKey(modelDef: ModelDefinition): string {
  const table = modelDef.table
  const singular = table.endsWith("s") ? table.slice(0, -1) : table
  return `${singular}Id`
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

/**
 * Build a `loadEager` method for a relation.
 *
 * Defined here as a factory (not spread from a base object) to avoid
 * the eager getter evaluation that happens with `...base` spread.
 */
function loadEagerFor(relatedThunk: () => ModelDefinition): Relation["loadEager"] {
  return async function loadEager(
    this: Relation,
    models: ModelInstance[],
    relationName: string,
    constraints?: ((qb: QueryBuilder) => void) | null,
  ): Promise<void> {
    const relatedDef = resolveThunk(relatedThunk)
    const peta = relatedDef._peta
    if (!peta) return
    const qb = createQueryBuilder(relatedDef, peta)
    this.addEagerConstraints(qb, models)
    if (constraints) constraints(qb)
    const results = await qb.execute()
    this.match(models, results, relationName)
  }
}

/* ─── hasMany ────────────────────────────── */

export function hasMany(relatedThunk: () => ModelDefinition, options: RelationOptions = {}): Relation {
  return {
    type: "hasMany",
    get relatedModelClass(): ModelDefinition {
      return resolveThunk(relatedThunk)
    },
    get foreignKey(): string {
      return options.foreignKey ?? guessForeignKey(resolveThunk(relatedThunk))
    },
    get localKey(): string {
      return options.localKey ?? "id"
    },

    query(parent: ModelInstance): QueryBuilder {
      const relatedDef = resolveThunk(relatedThunk)
      const peta = relatedDef._peta
      if (!peta) return createQueryBuilder(relatedDef, null as never)
      return createQueryBuilder(relatedDef, peta).where(this.foreignKey, "=", parent.get(this.localKey))
    },

    addEagerConstraints(query: QueryBuilder, models: ModelInstance[]): void {
      const keys = models.map((m) => m.get(this.localKey)).filter((k) => k != null)
      if (keys.length > 0) query.whereIn(this.foreignKey, keys)
    },

    match(models: ModelInstance[], results: ModelInstance[], relationName: string): void {
      const grouped = groupByArray(results, this.foreignKey)
      for (const model of models) {
        model.$setRelation(relationName, grouped[String(model.get(this.localKey))] ?? [])
      }
    },

    async getResults(parent: ModelInstance): Promise<ModelInstance[]> {
      return this.query(parent).execute()
    },

    loadEager: loadEagerFor(relatedThunk),
  }
}

/* ─── belongsTo ──────────────────────────── */

export function belongsTo(relatedThunk: () => ModelDefinition, options: RelationOptions = {}): Relation {
  return {
    type: "belongsTo",
    get relatedModelClass(): ModelDefinition {
      return resolveThunk(relatedThunk)
    },
    get foreignKey(): string {
      return options.foreignKey ?? guessForeignKey(resolveThunk(relatedThunk))
    },
    get localKey(): string {
      return options.localKey ?? "id"
    },

    query(parent: ModelInstance): QueryBuilder {
      const relatedDef = resolveThunk(relatedThunk)
      const peta = relatedDef._peta
      if (!peta) return createQueryBuilder(relatedDef, null as never)
      return createQueryBuilder(relatedDef, peta).where(this.localKey, "=", parent.get(this.foreignKey))
    },

    addEagerConstraints(query: QueryBuilder, models: ModelInstance[]): void {
      const keys = models.map((m) => m.get(this.foreignKey)).filter((k) => k != null)
      if (keys.length > 0) query.whereIn(this.localKey, keys)
    },

    match(models: ModelInstance[], results: ModelInstance[], relationName: string): void {
      const grouped = groupByArray(results, this.localKey)
      for (const model of models) {
        model.$setRelation(relationName, grouped[String(model.get(this.foreignKey))]?.[0] ?? null)
      }
    },

    async getResults(parent: ModelInstance): Promise<ModelInstance | null> {
      return (await this.query(parent).executeTakeFirst()) ?? null
    },

    loadEager: loadEagerFor(relatedThunk),
  }
}

/* ─── hasOne ─────────────────────────────── */

export function hasOne(relatedThunk: () => ModelDefinition, options: RelationOptions = {}): Relation {
  return {
    type: "hasOne",
    get relatedModelClass(): ModelDefinition {
      return resolveThunk(relatedThunk)
    },
    get foreignKey(): string {
      return options.foreignKey ?? guessForeignKey(resolveThunk(relatedThunk))
    },
    get localKey(): string {
      return options.localKey ?? "id"
    },

    query(parent: ModelInstance): QueryBuilder {
      const relatedDef = resolveThunk(relatedThunk)
      const peta = relatedDef._peta
      if (!peta) return createQueryBuilder(relatedDef, null as never)
      return createQueryBuilder(relatedDef, peta).where(this.foreignKey, "=", parent.get(this.localKey))
    },

    addEagerConstraints(query: QueryBuilder, models: ModelInstance[]): void {
      const keys = models.map((m) => m.get(this.localKey)).filter((k) => k != null)
      if (keys.length > 0) query.whereIn(this.foreignKey, keys)
    },

    match(models: ModelInstance[], results: ModelInstance[], relationName: string): void {
      const grouped = groupByArray(results, this.foreignKey)
      for (const model of models) {
        model.$setRelation(relationName, grouped[String(model.get(this.localKey))]?.[0] ?? null)
      }
    },

    async getResults(parent: ModelInstance): Promise<ModelInstance | null> {
      return (await this.query(parent).executeTakeFirst()) ?? null
    },

    loadEager: loadEagerFor(relatedThunk),
  }
}

/* ─── manyToMany ─────────────────────────── */

export function manyToMany(
  relatedThunk: () => ModelDefinition,
  options: RelationOptions & { through: string },
): Relation {
  const pivotExtras = options.pivotExtras ?? []
  return {
    type: "manyToMany",
    get relatedModelClass(): ModelDefinition {
      return resolveThunk(relatedThunk)
    },
    get foreignKey(): string {
      return options.foreignKey ?? guessForeignKey(resolveThunk(relatedThunk))
    },
    get localKey(): string {
      return options.localKey ?? "id"
    },
    get throughTable(): string {
      return options.through
    },
    get foreignPivotKey(): string {
      return options.foreignPivotKey ?? snakeCase(this.foreignKey)
    },
    get relatedPivotKey(): string {
      return options.relatedPivotKey ?? snakeCase(guessForeignKey(resolveThunk(relatedThunk)))
    },

    query(parent: ModelInstance): QueryBuilder {
      const relatedDef = resolveThunk(relatedThunk)
      const peta = relatedDef._peta
      if (!peta) return createQueryBuilder(relatedDef, null as never)
      const parentKey = parent.get(this.localKey)
      if (pivotExtras.length > 0) {
        const subQb = peta.kysely
          .selectFrom(options.through)
          .select(this.relatedPivotKey!)
          .where(this.foreignPivotKey!, "=", parentKey as never)
        return createQueryBuilder(relatedDef, peta).whereIn("id", subQb as never as unknown[])
      }
      const subquery = peta.kysely
        .selectFrom(options.through)
        .select(this.relatedPivotKey!)
        .where(this.foreignPivotKey!, "=", parentKey as never)
      return createQueryBuilder(relatedDef, peta).whereIn("id", subquery as never as unknown[])
    },

    addEagerConstraints(query: QueryBuilder, models: ModelInstance[]): void {
      const keys = models.map((m) => m.get(this.localKey)).filter((k) => k != null)
      if (keys.length === 0) {
        query.whereIn("id", [])
        return
      }
      const relatedDef = resolveThunk(relatedThunk)
      const relatedTable = relatedDef.table
      query.innerJoin(
        options.through,
        `${options.through}.${this.relatedPivotKey!}`,
        `${relatedTable}.${this.localKey}`,
      )
      // Select the pivot FK so match() can group results by parent
      query.select(`${options.through}.${this.foreignPivotKey!}`)
      query.whereIn(`${options.through}.${this.foreignPivotKey!}`, keys)
    },

    match(models: ModelInstance[], results: ModelInstance[], relationName: string): void {
      const grouped = groupByArray(results, this.foreignPivotKey!)
      const knownKeys = resolveThunk(relatedThunk).columns
      for (const model of models) {
        const key = String(model.get(this.localKey))
        const items = grouped[key] ?? []
        for (const item of items) {
          const pivotData: Record<string, unknown> = {}
          for (const ek of Object.keys(item.attributes ?? {})) {
            if (!(ek in knownKeys)) pivotData[ek] = item.get(ek)
          }
          if (Object.keys(pivotData).length > 0) item.$setRelation("_pivot", pivotData)
        }
        model.$setRelation(relationName, items)
      }
    },

    async getResults(parent: ModelInstance): Promise<ModelInstance[]> {
      return this.query(parent).execute()
    },

    loadEager: loadEagerFor(relatedThunk),
  }
}

/* ─── hasManyThrough ─────────────────────── */

export function hasManyThrough(
  relatedThunk: () => ModelDefinition,
  throughThunk: () => ModelDefinition,
  options: RelationOptions = {},
): Relation {
  return {
    type: "hasManyThrough",
    get relatedModelClass(): ModelDefinition {
      return resolveThunk(relatedThunk)
    },
    get foreignKey(): string {
      return options.foreignKey ?? guessForeignKey(resolveThunk(throughThunk))
    },
    get localKey(): string {
      return options.localKey ?? "id"
    },
    get throughForeignKey(): string {
      return options.throughForeignKey ?? guessForeignKey(resolveThunk(relatedThunk))
    },
    get throughLocalKey(): string {
      return options.throughLocalKey ?? guessForeignKey(resolveThunk(throughThunk))
    },

    query(parent: ModelInstance): QueryBuilder {
      const relatedDef = resolveThunk(relatedThunk)
      const throughDef = resolveThunk(throughThunk)
      const peta = relatedDef._peta
      if (!peta) return createQueryBuilder(relatedDef, null as never)
      const parentKey = parent.get(this.localKey)
      const throughTable = throughDef.table
      const subquery = peta.kysely
        .selectFrom(throughTable)
        .select(this.throughForeignKey!)
        .where(this.foreignKey, "=", parentKey as never)
      return createQueryBuilder(relatedDef, peta).whereIn("id", subquery as never as unknown[])
    },

    addEagerConstraints(query: QueryBuilder, models: ModelInstance[]): void {
      const keys = models.map((m) => m.get(this.localKey)).filter((k) => k != null)
      if (keys.length === 0) {
        query.whereIn("id", [])
        return
      }
      const relatedDef = resolveThunk(relatedThunk)
      const throughDef = resolveThunk(throughThunk)
      query.innerJoin(
        throughDef.table,
        `${throughDef.table}.${this.throughForeignKey!}`,
        `${relatedDef.table}.${this.localKey}`,
      )
      // Select the through FK so match() can group results by parent
      query.select(`${throughDef.table}.${this.foreignKey}`)
      query.whereIn(`${throughDef.table}.${this.foreignKey}`, keys)
    },

    match(models: ModelInstance[], results: ModelInstance[], relationName: string): void {
      const grouped = groupByArray(results, this.foreignKey)
      for (const model of models) {
        model.$setRelation(relationName, grouped[String(model.get(this.localKey))] ?? [])
      }
    },

    async getResults(parent: ModelInstance): Promise<ModelInstance[]> {
      const relatedDef = resolveThunk(relatedThunk)
      const throughDef = resolveThunk(throughThunk)
      const peta = relatedDef._peta
      if (!peta) return []
      const parentKey = parent.get(this.localKey)
      const rows = await peta.kysely
        .selectFrom(throughDef.table)
        .select(this.throughForeignKey!)
        .where(this.foreignKey, "=", parentKey as never)
        .execute()
      const ids = rows.map((r: Record<string, unknown>) => r[this.throughForeignKey!] as string).filter(Boolean)
      if (ids.length === 0) return []
      return createQueryBuilder(relatedDef, peta).whereIn("id", ids).execute()
    },

    loadEager: loadEagerFor(relatedThunk),
  }
}

/* ─── utility ────────────────────────────── */

function snakeCase(str: string): string {
  return str.charAt(0).toLowerCase() + str.slice(1).replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)
}
