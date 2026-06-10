import { DatabaseError, normalizeError } from "../errors.js"
import type { Database } from "../lib/kysely.js"
import { getHooksFor } from "./hooks.js"
import type { ModelDefinition, ModelInstance } from "./index.js"
import { getExists, getState, setExists, syncOriginal } from "./state.js"

function prepareForDb(def: ModelDefinition, data: Record<string, unknown>): Record<string, unknown> {
  const casts = def._config.casts ?? {}
  const out: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(data)) {
    if (casts[key] === "json" && val !== null && typeof val === "object") {
      out[key] = JSON.stringify(val)
    } else {
      out[key] = val
    }
  }
  return out
}

export async function saveModel(def: ModelDefinition, model: ModelInstance): Promise<void> {
  const hooks = getHooksFor(def)
  const state = getState(model)
  const isNew = !getExists(model)
  const peta = def._peta
  if (!peta) throw new Error(`${def.table} has not been registered with Peta`)
  if (isNew) {
    await hooks.trigger("beforeCreate", model as never)
    await hooks.trigger("beforeSave", model as never)
    state.attributes = { ...state.attributes }
    const data = prepareForDb(def, { ...state.attributes })
    delete data.id
    try {
      const result = await peta.kysely.insertInto(def.table).values(data).executeTakeFirst()
      state.attributes.id = Number(result.insertId ?? result.numInsertedOrUpdatedRows ?? 0)
      setExists(model, true)
    } catch (e: unknown) {
      throw normalizeError(e, def.table) ?? e
    }
    syncOriginal(model)
    await hooks.trigger("afterCreate", model as never)
    await hooks.trigger("afterSave", model as never)
  } else {
    await hooks.trigger("beforeUpdate", model as never)
    await hooks.trigger("beforeSave", model as never)
    const dirty = prepareForDb(def, { ...state.attributes })
    for (const key of Object.keys(dirty)) {
      if (dirty[key] === state.original[key]) delete dirty[key]
    }
    const id = state.attributes.id
    if (id == null) throw new DatabaseError("MISSING_ID", "Cannot update a model without an id")
    try {
      await peta.kysely
        .updateTable(def.table)
        .set(dirty)
        .where("id", "=", id as never)
        .execute()
    } catch (e: unknown) {
      throw normalizeError(e, def.table) ?? e
    }
    syncOriginal(model)
    await hooks.trigger("afterUpdate", model as never)
    await hooks.trigger("afterSave", model as never)
  }
}

export async function insertModel(def: ModelDefinition, data: Record<string, unknown>): Promise<ModelInstance> {
  const model = def._init()
  const state = getState(model)
  state.attributes = { ...data }
  await saveModel(def, model)
  return model
}

export async function insertManyModel(
  def: ModelDefinition,
  dataArray: Record<string, unknown>[],
  kyselyOverride?: Database,
): Promise<ModelInstance[]> {
  const peta = def._peta
  if (!peta) throw new Error(`${def.table} has not been registered with Peta`)
  const db: any = kyselyOverride ?? peta.kysely
  const prepared = dataArray.map((row) => prepareForDb(def, row))
  try {
    await db.insertInto(def.table).values(prepared).execute()
  } catch (e: unknown) {
    throw normalizeError(e, def.table) ?? e
  }
  return dataArray.map((row) => def._hydrate(row))
}

export async function reloadModel(def: ModelDefinition, model: ModelInstance): Promise<void> {
  const peta = def._peta
  if (!peta) throw new Error(`${def.table} has not been registered with Peta`)
  const state = getState(model)
  const id = state.attributes.id
  if (id == null) throw new DatabaseError("MISSING_ID", "Cannot reload a model without an id")
  const row = await peta.kysely
    .selectFrom(def.table)
    .selectAll()
    .where("id", "=", id as never)
    .executeTakeFirst()
  if (row) {
    state.attributes = { ...(row as Record<string, unknown>) }
    state.original = { ...(row as Record<string, unknown>) }
    setExists(model, true)
  }
}
