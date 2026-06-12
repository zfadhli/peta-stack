import type { QueryBuilder } from "../builder/query.js"
import { createQueryBuilder } from "../builder/query.js"
import type { ModelDefinition, ModelInstance } from "../model/index.js"
import type { Relation, RelationOptions } from "./relation.js"

export interface MorphToOptions {
  name: string
  type?: string
  id?: string
}
export interface MorphManyOptions extends RelationOptions {
  name: string
  /** The target model definition (e.g. Comment for a Post's comments). */
  related: ModelDefinition
  type?: string
  id?: string
}
export interface MorphOneOptions extends RelationOptions {
  name: string
  /** The target model definition (e.g. Image for a User's avatar). */
  related: ModelDefinition
  type?: string
  id?: string
}

export function defineMorphTo(options: MorphToOptions): Relation {
  const idColumn = options.id ?? `${options.name}Id`
  return {
    type: "belongsTo" as const,
    get relatedModelClass(): ModelDefinition {
      throw new Error("MorphTo.relatedModelClass is resolved at runtime")
    },
    get foreignKey(): string {
      return idColumn
    },
    get localKey(): string {
      return "id"
    },
    query(_parent: ModelInstance): QueryBuilder {
      return createQueryBuilder(null as never, null as never)
    },
    addEagerConstraints(): void {},
    match(): void {},
    async getResults(parent: ModelInstance): Promise<ModelInstance | null> {
      return (await this.query(parent).executeTakeFirst()) ?? null
    },
    async loadEager(): Promise<void> {},
  }
}

export function defineMorphMany(options: MorphManyOptions): Relation {
  const idColumn = options.id ?? `${options.name}Id`
  return {
    type: "hasMany" as const,
    relatedModelClass: options.related,
    get foreignKey(): string {
      return idColumn
    },
    get localKey(): string {
      return "id"
    },
    query(parent: ModelInstance): QueryBuilder {
      const relatedDef = this.relatedModelClass
      const peta = relatedDef._peta
      if (!peta) return createQueryBuilder(relatedDef, null as never)
      return createQueryBuilder(relatedDef, peta)
        .where(this.foreignKey, "=", parent.get(this.localKey) as never)
        .where(options.type ?? (`${options.name}Type` as never), "=", options.name)
    },
    addEagerConstraints(query: QueryBuilder, models: ModelInstance[]): void {
      const keys = models.map((m) => m.get(this.localKey)).filter((k) => k != null)
      if (keys.length > 0) query.whereIn(this.foreignKey, keys)
    },
    match(models: ModelInstance[], results: ModelInstance[], relationName: string): void {
      const grouped = groupByArray(results, this.foreignKey)
      for (const model of models) model.$setRelation(relationName, grouped[String(model.get(this.localKey))] ?? [])
    },
    async getResults(parent: ModelInstance): Promise<ModelInstance[]> {
      return this.query(parent).execute()
    },
    async loadEager(
      models: ModelInstance[],
      relationName: string,
      constraints?: ((qb: QueryBuilder) => void) | null,
    ): Promise<void> {
      const relatedDef = this.relatedModelClass
      const peta = relatedDef._peta
      if (!peta) return
      const qb = createQueryBuilder(relatedDef, peta)
      this.addEagerConstraints(qb, models)
      if (constraints) constraints(qb)
      const results = await qb.execute()
      this.match(models, results, relationName)
    },
  }
}

export function defineMorphOne(options: MorphOneOptions): Relation {
  const idColumn = options.id ?? `${options.name}Id`
  return {
    type: "hasOne" as const,
    relatedModelClass: options.related,
    get foreignKey(): string {
      return idColumn
    },
    get localKey(): string {
      return "id"
    },
    query(parent: ModelInstance): QueryBuilder {
      const relatedDef = this.relatedModelClass
      const peta = relatedDef._peta
      if (!peta) return createQueryBuilder(relatedDef, null as never)
      return createQueryBuilder(relatedDef, peta)
        .where(this.foreignKey, "=", parent.get(this.localKey) as never)
        .where(options.type ?? (`${options.name}Type` as never), "=", options.name)
    },
    addEagerConstraints(query: QueryBuilder, models: ModelInstance[]): void {
      const keys = models.map((m) => m.get(this.localKey)).filter((k) => k != null)
      if (keys.length > 0) query.whereIn(this.foreignKey, keys)
    },
    match(models: ModelInstance[], results: ModelInstance[], relationName: string): void {
      const grouped = groupByArray(results, this.foreignKey)
      for (const model of models)
        model.$setRelation(relationName, grouped[String(model.get(this.localKey))]?.[0] ?? null)
    },
    async getResults(parent: ModelInstance): Promise<ModelInstance | null> {
      return (await this.query(parent).executeTakeFirst()) ?? null
    },
    async loadEager(
      models: ModelInstance[],
      relationName: string,
      constraints?: ((qb: QueryBuilder) => void) | null,
    ): Promise<void> {
      const relatedDef = this.relatedModelClass
      const peta = relatedDef._peta
      if (!peta) return
      const qb = createQueryBuilder(relatedDef, peta)
      this.addEagerConstraints(qb, models)
      if (constraints) constraints(qb)
      const results = await qb.execute()
      this.match(models, results, relationName)
    },
  }
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
