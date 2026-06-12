import type { ModelDefinition, ModelInstance } from "../model/types.js"
import type { QueryBuilder } from "../query/index.js"

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
