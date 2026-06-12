import type { ModelDefinition, ModelInstance } from "../model/types.js"
import type { QueryBuilder } from "../query/index.js"

export interface EagerLoad {
  name: string
  constraints?: ((qb: QueryBuilder) => void) | null
}

export class EagerLoader {
  async loadRelated(models: ModelInstance[], eagerLoad: EagerLoad, def: ModelDefinition): Promise<void> {
    const { name, constraints } = eagerLoad
    const dotIdx = name.indexOf(".")

    if (dotIdx === -1) {
      // Simple relation
      const relation = def.relations[name]
      if (!relation) throw new Error(`Relation "${name}" not found on ${def.name}`)
      await relation.loadEager(models, name, constraints)
    } else {
      // Nested relation: "posts.comments"
      const baseName = name.slice(0, dotIdx)
      const nestedName = name.slice(dotIdx + 1)
      const relation = def.relations[baseName]
      if (!relation) throw new Error(`Relation "${baseName}" not found on ${def.name}`)

      // First load the base relation
      await relation.loadEager(models, baseName, null)

      // Collect all related models
      const relatedModels: ModelInstance[] = []
      for (const model of models) {
        const related = model.$getRelation(baseName)
        if (Array.isArray(related)) {
          relatedModels.push(...related)
        } else if (related) {
          relatedModels.push(related as ModelInstance)
        }
      }

      if (relatedModels.length > 0) {
        const nestedDef = relation.relatedModelClass
        const nestedRelation = nestedDef.relations[nestedName]
        if (!nestedRelation) {
          throw new Error(`Relation "${nestedName}" not found on ${nestedDef.name}`)
        }
        await nestedRelation.loadEager(relatedModels, nestedName, constraints)
      }
    }
  }

  async loadRelatedForModel(model: ModelInstance, name: string, def: ModelDefinition): Promise<void> {
    await this.loadRelated([model], { name }, def)
  }
}
