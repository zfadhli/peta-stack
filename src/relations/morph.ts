import type { ModelQueryBuilder } from "../builder"
import type { Model, ModelClass } from "../model/model"
import { Model as BaseModel } from "../model/model"
import { BelongsTo, HasMany, HasOne } from "./relation"

export interface MorphToOptions {
  morphType?: string
  morphId?: string
}

export interface MorphManyOptions {
  morphType?: string
  morphId?: string
  morphTypeValue?: string
}

export interface MorphOneOptions {
  morphType?: string
  morphId?: string
}

export class MorphTo extends BelongsTo {
  readonly morphType: string
  readonly morphId: string

  constructor(options: MorphToOptions = {}) {
    const morphType = options.morphType ?? "commentableType"
    const morphId = options.morphId ?? "commentableId"
    const dummyModel = class extends BaseModel {
      static override table = ""
      static override columns = {}
    }
    super(() => dummyModel, { foreignKey: morphId, localKey: "id" })
    this.morphType = morphType
    this.morphId = morphId
  }

  override query(parent: Model): ModelQueryBuilder<any> {
    const type = parent.get(this.morphType) as string
    const modelClass = this.#resolveType(type)
    if (!modelClass) return super.query(parent)
    return modelClass.query().where("id", "=", parent.get(this.morphId))
  }

  override addEagerConstraints(_query: ModelQueryBuilder<any>, _models: Model[]): void {}

  override match(_models: Model[], _results: Model[], _relationName: string): void {}

  override async loadEager(models: Model[], relationName: string, _constraints?: ((qb: ModelQueryBuilder<any>) => void) | null): Promise<void> {
    const groups = new Map<string, Model[]>()
    for (const m of models) {
      const type = m.get(this.morphType) as string | undefined
      if (!type) continue
      if (!groups.has(type)) groups.set(type, [])
      groups.get(type)!.push(m)
    }
    for (const [typeName, group] of groups) {
      const targetClass = this.#resolveType(typeName)
      if (!targetClass) continue
      const ids = group.map((m) => m.get(this.morphId)).filter((id) => id != null)
      if (ids.length === 0) continue
      const results = await targetClass.query().whereIn("id", ids).execute()
      for (const m of group) {
        const id = m.get(this.morphId)
        m.$setRelation(relationName, results.find((r) => r.get("id") === id) ?? null)
      }
    }
  }

  override async getResults(parent: Model): Promise<Model | null> {
    const type = parent.get(this.morphType) as string
    const modelClass = this.#resolveType(type)
    if (!modelClass) return null
    const id = parent.get(this.morphId)
    return (await modelClass.query().where("id", "=", id).executeTakeFirst()) ?? null
  }

  #resolveType(type: string): ModelClass | null {
    const peta = this.relatedModelClass.peta
    if (!peta?.models) return null
    for (const [, cls] of peta.models) {
      if (cls.name === type) return cls
    }
    return null
  }
}

export class MorphMany<TRelated extends Model = Model> extends HasMany<TRelated> {
  readonly morphType: string
  readonly morphId: string
  readonly morphTypeValue?: string

  constructor(relatedThunk: () => ModelClass<TRelated>, options: MorphManyOptions = {}) {
    const morphId = options.morphId ?? "commentableId"
    const morphType = options.morphType ?? "commentableType"
    super(relatedThunk, { foreignKey: morphId, localKey: "id" })
    this.morphType = morphType
    this.morphId = morphId
    this.morphTypeValue = options.morphTypeValue
  }

  override query(parent: Model): ModelQueryBuilder<TRelated> {
    const qb = super.query(parent)
    const typeValue = this.morphTypeValue ?? parent.constructor.name
    return qb.where(this.morphType, "=", typeValue)
  }

  override addEagerConstraints(query: ModelQueryBuilder<TRelated>, models: Model[]): void {
    super.addEagerConstraints(query, models)
    const typeValue = this.morphTypeValue
    if (typeValue) {
      query.where(this.morphType, "=", typeValue)
    }
  }

  override match(models: Model[], results: Model[], relationName: string): void {
    super.match(models, results, relationName)
  }
}

export class MorphOne<TRelated extends Model = Model> extends HasOne<TRelated> {
  readonly morphType: string
  readonly morphId: string

  constructor(relatedThunk: () => ModelClass<TRelated>, options: MorphOneOptions = {}) {
    const morphId = options.morphId ?? "commentableId"
    const morphType = options.morphType ?? "commentableType"
    super(relatedThunk, { foreignKey: morphId, localKey: "id" })
    this.morphType = morphType
    this.morphId = morphId
  }

  override query(parent: Model): ModelQueryBuilder<TRelated> {
    const qb = super.query(parent)
    return qb.where(this.morphType, "=", parent.constructor.name)
  }

  override addEagerConstraints(query: ModelQueryBuilder<TRelated>, models: Model[]): void {
    super.addEagerConstraints(query, models)
    query.where(this.morphType, "=", models[0]?.constructor?.name ?? "")
  }
}
