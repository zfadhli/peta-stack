import type { ModelDefinition, ModelInstance } from "../model/types.js"
import { createQueryBuilder } from "../query/index.js"
import type { Relation, RelationOptions, RelationType } from "./base.js"
import { resolveThunk } from "./helpers.js"

/** Stores pivot data for many-to-many relation results (instead of attaching to the model). */
const pivotData = new WeakMap<ModelInstance, Record<string, unknown>>()

function snakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`).replace(/^_/, "")
}

export function manyToMany(
  relatedThunk: () => ModelDefinition,
  options: RelationOptions & { through: string } & { pivotExtras?: string[] },
): Relation {
  // Lazily resolve the thunk at first access to support forward references
  // (models that reference other models defined later in the module).
  let _related: ModelDefinition | undefined
  function getRelated(): ModelDefinition {
    if (!_related) _related = resolveThunk(relatedThunk) ?? undefined
    if (!_related) throw new Error(`Cannot resolve manyToMany relation — related model not found`)
    return _related!
  }

  // Resolve defaults — all keys that require the thunk are guarded so they
  // don't crash when the thunk hasn't resolved yet (forward reference case).
  const localKey = options.localKey ?? "id"
  const throughTable = options.through ?? ""

  // Only attempt thunk-based defaults if the thunk resolves immediately
  let _table: string | undefined
  try {
    _table = getRelated().table
  } catch {
    // thunk not yet resolvable — defaults will be empty strings
  }

  const foreignKey = options.foreignKey ?? (_table ? `${snakeCase(_table)}Id` : "")
  const foreignPivotKey = options.foreignPivotKey ?? (_table ? `${snakeCase(_table)}Id` : "")
  const relatedPivotKey = options.relatedPivotKey ?? (_table ? `${snakeCase(_table)}Id` : "")
  const pivotExtras = options.pivotExtras ?? []

  return {
    type: "manyToMany" as RelationType,
    get relatedModelClass() {
      return getRelated()
    },
    foreignKey,
    localKey,
    throughTable,
    foreignPivotKey,
    relatedPivotKey,
    get throughForeignKey() {
      return undefined
    },
    get throughLocalKey() {
      return undefined
    },

    query(parent: ModelInstance): ReturnType<typeof createQueryBuilder> {
      const rel = getRelated()
      const pkValue = parent.get(localKey)
      const qb = createQueryBuilder(rel)
      if (pkValue == null) {
        qb.where(localKey, "=", -1)
        return qb
      }
      qb.innerJoin(throughTable, `${rel.table}.${localKey}`, `${throughTable}.${relatedPivotKey}`)
      qb.where(`${throughTable}.${foreignPivotKey}`, "=", pkValue)
      return qb
    },

    addEagerConstraints(
      _query: import("../query/index.js").QueryBuilder,
      _models: ModelInstance[],
    ): void {
      // The query builder's join approach handles this differently
      // We use WHERE IN on the pivot table
    },

    match(models: ModelInstance[], results: ModelInstance[], relationName: string): void {
      // For many-to-many, we group by the pivot's foreignPivotKey
      // But the results don't carry the pivot info — we need a different approach
      // This will be implemented with the EagerLoader doing the join
      const grouped: Record<string, ModelInstance[]> = {}
      for (const model of models) {
        const key = String(model.get(localKey))
        grouped[key] = []
      }

      // Group results by looking at the pivot info attached during query
      for (const result of results) {
        const pivot = pivotData.get(result)
        if (pivot) {
          const key = String(pivot[foreignPivotKey])
          if (grouped[key]) grouped[key].push(result)
        }
      }

      for (const model of models) {
        const key = String(model.get(localKey))
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
      const rel = getRelated()
      if (models.length === 0) return

      const ids = models.map((m) => m.get(localKey)).filter((id) => id != null)
      if (ids.length === 0) return

      const qb = createQueryBuilder(rel)
      qb.innerJoin(throughTable, `${rel.table}.${localKey}`, `${throughTable}.${relatedPivotKey}`)
      qb.where(`${throughTable}.${foreignPivotKey}`, "in", ids)

      // Select pivot columns if extras specified
      const selectCols = [`${rel.table}.*`]
      if (pivotExtras.length > 0) {
        for (const extra of pivotExtras) {
          selectCols.push(`${throughTable}.${extra}`)
        }
      }
      selectCols.push(`${throughTable}.${foreignPivotKey}`)
      qb.select(...selectCols)

      if (constraints) constraints(qb)

      const results = await qb.execute()

      // Attach pivot data from joined columns
      for (const result of results) {
        const pivot: Record<string, unknown> = {}
        const col = `${foreignPivotKey}`
        pivot[foreignPivotKey] = result.get(col)

        for (const extra of pivotExtras) {
          pivot[extra] = result.get(extra)
        }
        // Store pivot data in WeakMap (not directly on model)
        pivotData.set(result, pivot)
      }

      this.match(models, results, relationName)
    },
  }
}

export function hasManyThrough(
  relatedThunk: () => ModelDefinition,
  throughThunk: () => ModelDefinition,
  options: RelationOptions = {},
): Relation {
  const related = resolveThunk(relatedThunk)
  const through = resolveThunk(throughThunk)
  const foreignKey = options.foreignKey ?? `${snakeCase(through.table)}Id`
  const localKey = options.localKey ?? "id"
  const throughForeignKey =
    options.throughForeignKey ?? `${snakeCase(resolveThunk(relatedThunk).table)}Id`
  const throughLocalKey = options.throughLocalKey ?? "id"

  return {
    type: "hasManyThrough" as RelationType,
    relatedModelClass: related,
    foreignKey,
    localKey,
    throughTable: through.table,
    throughForeignKey,
    throughLocalKey,
    get foreignPivotKey() {
      return undefined
    },
    get relatedPivotKey() {
      return undefined
    },

    query(parent: ModelInstance): ReturnType<typeof createQueryBuilder> {
      const pkValue = parent.get(localKey)
      const qb = createQueryBuilder(related)
      if (pkValue == null) {
        qb.where(localKey, "=", -1)
        return qb
      }
      qb.innerJoin(
        through.table,
        `${through.table}.${throughLocalKey}`,
        `${related.table}.${throughForeignKey}`,
      )
      qb.where(`${through.table}.${foreignKey}`, "=", pkValue)
      return qb
    },

    addEagerConstraints(
      query: import("../query/index.js").QueryBuilder,
      models: ModelInstance[],
    ): void {
      const ids = models.map((m) => m.get(localKey)).filter((id) => id != null)
      if (ids.length > 0) {
        query.innerJoin(
          through.table,
          `${through.table}.${throughLocalKey}`,
          `${related.table}.${throughForeignKey}`,
        )
        query.where(`${through.table}.${foreignKey}`, "in", ids)
      }
    },

    match(models: ModelInstance[], results: ModelInstance[], relationName: string): void {
      const grouped: Record<string, ModelInstance[]> = {}
      for (const result of results) {
        const fkValue = result.get(throughForeignKey)
        if (fkValue == null) continue
        const key = String(fkValue)
        if (!grouped[key]) grouped[key] = []
        grouped[key].push(result)
      }

      for (const model of models) {
        const key = String(model.get(localKey))
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
