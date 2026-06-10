import { DatabaseError, ModelNotRegisteredError } from "../errors.js"
import { getHooksFor, getSoftDeleteConfig, hasSoftDelete } from "./hooks.js"
import type { ModelDefinition, ModelInstance } from "./index.js"
import { getState, setExists, syncOriginal } from "./state.js"

export async function deleteModel(def: ModelDefinition, model: ModelInstance): Promise<void> {
  const hooks = getHooksFor(def)
  await hooks.trigger("beforeDelete", model as never)
  const state = getState(model)
  const id = state.attributes.id
  if (id == null) throw new DatabaseError("MISSING_ID", "Cannot delete a model without an id")
  const peta = def._peta
  if (!peta) throw new ModelNotRegisteredError(def.name)
  if (hasSoftDelete(def)) {
    const sd = getSoftDeleteConfig(def)
    const column = sd?.column ?? "deletedAt"
    await peta.kysely
      .updateTable(def.table)
      .set({ [column]: new Date().toISOString() })
      .where("id", "=", id as never)
      .execute()
    state.attributes[column] = new Date().toISOString()
  } else {
    await peta.kysely
      .deleteFrom(def.table)
      .where("id", "=", id as never)
      .execute()
  }
  setExists(model, false)
  syncOriginal(model)
  await hooks.trigger("afterDelete", model as never)
}

export async function forceDeleteModel(def: ModelDefinition, model: ModelInstance): Promise<void> {
  const hooks = getHooksFor(def)
  await hooks.trigger("beforeForceDelete", model as never)
  const state = getState(model)
  const id = state.attributes.id
  if (id == null) throw new DatabaseError("MISSING_ID", "Cannot force delete a model without an id")
  const peta = def._peta
  if (!peta) throw new ModelNotRegisteredError(def.name)
  await peta.kysely
    .deleteFrom(def.table)
    .where("id", "=", id as never)
    .execute()
  setExists(model, false)
  syncOriginal(model)
  await hooks.trigger("afterForceDelete", model as never)
}

export async function restoreModel(def: ModelDefinition, model: ModelInstance): Promise<void> {
  const hooks = getHooksFor(def)
  await hooks.trigger("beforeRestore", model as never)
  const state = getState(model)
  const id = state.attributes.id
  if (id == null) throw new DatabaseError("MISSING_ID", "Cannot restore a model without an id")
  const peta = def._peta
  if (!peta) throw new ModelNotRegisteredError(def.name)
  if (!hasSoftDelete(def)) return
  const sd = getSoftDeleteConfig(def)
  const column = sd?.column ?? "deletedAt"
  await peta.kysely
    .updateTable(def.table)
    .set({ [column]: null })
    .where("id", "=", id as never)
    .execute()
  state.attributes[column] = null
  setExists(model, true)
  syncOriginal(model)
  await hooks.trigger("afterRestore", model as never)
}

export function trashedModel(def: ModelDefinition, model: ModelInstance): boolean {
  if (!hasSoftDelete(def)) return false
  const sd = getSoftDeleteConfig(def)
  const column = sd?.column ?? "deletedAt"
  return getState(model).attributes[column] != null
}
