import type { ModelDefinition, ModelInstance } from "../model/types.js"
import { createQueryBuilder } from "../query/index.js"
import type { Relation, RelationOptions, RelationType } from "./base.js"

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

export function hasMany(relatedThunk: () => ModelDefinition, options: RelationOptions = {}): Relation {
  // Lazily resolve the thunk at first access to support forward references.
  // Don't attempt to resolve at definition time — the related model may not be
  // defined yet (forward reference / circular dependency).
  let _related: ModelDefinition | undefined
  function getRelated(): ModelDefinition {
    if (!_related) _related = resolveThunk(relatedThunk) ?? undefined
    if (!_related) throw new Error(`Cannot resolve hasMany relation — related model not found`)
    return _related!
  }

  const foreignKey = options.foreignKey ?? ""
  const localKey = options.localKey ?? "id"

  return {
    type: "hasMany" as RelationType,
    get relatedModelClass() {
      return getRelated()
    },
    foreignKey,
    localKey,
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
      const rel = getRelated()
      const qb = createQueryBuilder(rel)
      const fkValue = parent.get(localKey)
      if (fkValue != null) {
        qb.where(foreignKey, "=", fkValue)
      } else {
        qb.where(foreignKey, "=", -1)
      }
      return qb
    },

    addEagerConstraints(qb: any, models: ModelInstance[]): void {
      const ids = models.map((m) => m.get(localKey)).filter((id) => id != null)
      if (ids.length > 0) {
        qb.whereIn(foreignKey, ids)
      } else {
        qb.where(foreignKey, "=", -1)
      }
    },

    match(models: ModelInstance[], results: ModelInstance[], relationName: string): void {
      const grouped = groupByArray(results, foreignKey)
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

      const qb = createQueryBuilder(rel)
      this.addEagerConstraints(qb, models)

      if (constraints) constraints(qb)

      const results = await qb.execute()
      this.match(models, results, relationName)
    },
  }
}

export function hasOne(relatedThunk: () => ModelDefinition, options: RelationOptions = {}): Relation {
  // Copy property descriptors from the base hasMany relation instead of using
  // the spread operator. Spread triggers getters (e.g. relatedModelClass) which
  // can crash if the thunk isn't resolvable yet (forward references).
  const base = hasMany(relatedThunk, options)
  const result: Record<string, any> = {}

  for (const key of Object.keys(base)) {
    const desc = Object.getOwnPropertyDescriptor(base, key)!
    Object.defineProperty(result, key, desc)
  }

  // Override with hasOne-specific implementations
  result.match = function match(
    models: ModelInstance[],
    results: ModelInstance[],
    relationName: string,
  ): void {
    const grouped = groupByArray(results, base.foreignKey)
    for (const model of models) {
      const key = String(model.get(base.localKey))
      model.$setRelation(relationName, (grouped[key] ?? [])[0] ?? null)
    }
  }

  result.getResults = async function getResults(
    parent: ModelInstance,
  ): Promise<ModelInstance | null> {
    const results = await base.getResults(parent)
    return (results as ModelInstance[])[0] ?? null
  }

  return result as Relation
}

export function belongsTo(relatedThunk: () => ModelDefinition, options: RelationOptions = {}): Relation {
  const related = resolveThunk(relatedThunk)
  const foreignKey = options.foreignKey ?? guessForeignKey(related)
  const localKey = options.localKey ?? "id"

  return {
    type: "belongsTo" as RelationType,
    relatedModelClass: related,
    foreignKey,
    localKey,
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
      const qb = createQueryBuilder(related)
      const fkValue = parent.get(foreignKey)
      if (fkValue != null) {
        qb.where(localKey, "=", fkValue)
      } else {
        qb.where(localKey, "=", -1)
      }
      return qb
    },

    addEagerConstraints(qb: any, models: ModelInstance[]): void {
      const ids = models.map((m) => m.get(foreignKey)).filter((id) => id != null)
      if (ids.length > 0) {
        qb.whereIn(localKey, ids)
      } else {
        qb.where(localKey, "=", -1)
      }
    },

    match(models: ModelInstance[], results: ModelInstance[], relationName: string): void {
      const keyed = Object.fromEntries(results.map((r) => [String(r.get(localKey)), r]))
      for (const model of models) {
        const fkValue = model.get(foreignKey)
        model.$setRelation(relationName, fkValue != null ? (keyed[String(fkValue)] ?? null) : null)
      }
    },

    async getResults(parent: ModelInstance): Promise<ModelInstance | null> {
      const results = await this.query(parent).execute()
      return results[0] ?? null
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
