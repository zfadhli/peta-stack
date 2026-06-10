import type { ModelDefinition, ModelInstance } from "../model/index.js"
import { getModelDef } from "../model/relation.js"
import type { QueryBuilder } from "./query.js"
import { createQueryBuilder } from "./query.js"

export interface EagerLoad {
  name: string
  constraints: ((qb: QueryBuilder) => void) | null
}

export function createEagerLoader(): EagerLoaderInstance {
  return new EagerLoader()
}

export interface EagerLoaderInstance {
  loadRelated(models: ModelInstance[], eagerLoad: EagerLoad, def: ModelDefinition): Promise<void>
  loadRelatedForModel(model: ModelInstance, names: string[]): Promise<void>
}

export class EagerLoader {
  async loadRelated(models: ModelInstance[], eagerLoad: EagerLoad, def: ModelDefinition): Promise<void> {
    const parts = eagerLoad.name.split(".")
    const current = parts[0]!
    const nested = parts.slice(1)
    const relation = def.relations[current]
    if (!relation) return
    const relatedDef = relation.relatedModelClass
    const qb = createQueryBuilder(relatedDef, def._peta!)
    relation.addEagerConstraints(qb as never, models as never)
    if (eagerLoad.constraints) eagerLoad.constraints(qb)
    const results = await qb.execute()
    relation.match(models as never, results as never, current)
    if (nested.length > 0) {
      for (const nestedModel of results) {
        const nestedDef = getModelDef(nestedModel)
        if (nestedDef) {
          await this.loadRelated([nestedModel], { name: nested.join("."), constraints: null }, nestedDef)
        }
      }
    }
  }
  async loadRelatedForModel(model: ModelInstance, names: string[]): Promise<void> {
    const def = getModelDef(model)
    if (!def) return
    for (const name of names) {
      await this.loadRelated([model], { name, constraints: null }, def)
    }
  }
}
