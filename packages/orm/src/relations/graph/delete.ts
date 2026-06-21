import { getDb, getPrimaryKeyColumn } from "../../lib/model-helpers.js"
import type { ModelDefinition, ModelInstance } from "../../model/types.js"

export interface DeleteGraphOptions {
  allowedRelations?: string[]
}

export async function deleteGraph(
  def: ModelDefinition,
  model: ModelInstance,
  options: DeleteGraphOptions = {},
): Promise<void> {
  const db = getDb(def)
  const pk = getPrimaryKeyColumn(def)
  const pkValue = model.get(pk)

  if (pkValue == null) throw new Error("Cannot deleteGraph: model has no primary key")

  for (const [relationName, relation] of Object.entries(def.relations)) {
    if (options.allowedRelations && !options.allowedRelations.includes(relationName)) continue
    const relatedDef = relation.relatedModelClass

    if (relation.type === "hasMany") {
      const children = await relatedDef.query().where(relation.foreignKey, "=", pkValue).execute()
      for (const child of children) await child.$delete()
    } else if (relation.type === "manyToMany") {
      const throughTable = relation.throughTable!
      const fpk = relation.foreignPivotKey!
      await db.deleteFrom(throughTable).where(fpk, "=", pkValue).execute()
    } else if (relation.type === "hasOne") {
      const child = await relatedDef.query().where(relation.foreignKey, "=", pkValue).first()
      if (child) await child.$delete()
    }
  }

  await model.$delete()
}
