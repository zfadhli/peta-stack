import { EagerLoader } from "../builder/eager.js"
import { createQueryBuilder } from "../builder/query.js"
import type { ModelDefinition, ModelInstance } from "./index.js"

const DEF_BY_INSTANCE = new WeakMap<ModelInstance, ModelDefinition>()

export function setModelDef(instance: ModelInstance, def: ModelDefinition): void {
  DEF_BY_INSTANCE.set(instance, def)
}

export function getModelDef(instance: ModelInstance): ModelDefinition | undefined {
  return DEF_BY_INSTANCE.get(instance)
}

export async function loadModelRelations(model: ModelInstance, ...names: string[]): Promise<void> {
  const def = getModelDef(model)
  if (!def) return
  const _loader = new EagerLoader()
  for (const name of names) {
    const parts = name.split(".")
    const current = parts[0]!
    const nested = parts.slice(1)
    const relation = def.relations[current]
    if (!relation) continue
    if (nested.length === 0) {
      const relatedDef = relation.relatedModelClass
      const peta = def._peta
      if (!peta) return
      const qb = createQueryBuilder(relatedDef, peta)
      relation.addEagerConstraints(qb as never, [model] as never)
      const results = await qb.execute()
      relation.match([model] as never, results as never, current)
    } else {
      const relValue = model.$getRelation(current)
      if (relValue) {
        const items = Array.isArray(relValue) ? relValue : [relValue]
        for (const item of items) await loadModelRelations(item, nested.join("."))
      }
    }
  }
}
