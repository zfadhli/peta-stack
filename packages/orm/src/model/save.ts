import { DatabaseError, normalizeError } from "../errors.js"
import { applyCastsToData, prepareForDb } from "./casts.js"
import { createInstance } from "./factory.js"
import { getHooksFor } from "./hooks.js"
import { getExists, getState, setExists, syncOriginal } from "./state.js"
import type { ModelConfig, ModelDefinition, ModelInstance } from "./types.js"

// ─── HELPERS ─────────────────────────────────────────────────
function getPrimaryKeyColumn(def: ModelDefinition): string {
  const cols = def.columns as Record<string, any>
  for (const [name, col] of Object.entries(cols)) {
    if (col.isPrimaryKey) return name
  }
  return "id"
}

function getTable(def: ModelDefinition): string {
  return def.table
}

function getDb(def: ModelDefinition): any {
  if (!def._orm) throw new Error("Model not registered")
  return (def._orm as any).kysely
}

// ─── SAVE MODEL ──────────────────────────────────────────────
export async function saveModel(def: ModelDefinition, model: ModelInstance): Promise<ModelInstance> {
  const hm = getHooksFor(def)
  const exists = getExists(model)
  const pk = getPrimaryKeyColumn(def)
  const db = getDb(def)
  const config = getConfig(def)

  if (exists) {
    // UPDATE
    const dirty = getState(model).attributes
    const original = getState(model).original
    const changed: Record<string, unknown> = {}

    for (const key of Object.keys(dirty)) {
      if (dirty[key] !== original[key]) {
        changed[key] = config?.casts?.[key] ? prepareForDb(dirty[key], config.casts[key]) : dirty[key]
      }
    }

    if (Object.keys(changed).length === 0) return model

    await hm.trigger("beforeUpdate", model as any)
    await hm.trigger("beforeSave", model as any)

    const pkValue = model.get(pk)
    try {
      await db.updateTable(getTable(def)).set(changed).where(pk, "=", pkValue).execute()
    } catch (e: any) {
      throw normalizeError(e, getTable(def))
    }

    syncOriginal(model)
    await hm.trigger("afterUpdate", model as any)
    await hm.trigger("afterSave", model as any)
  } else {
    // INSERT
    await hm.trigger("beforeCreate", model as any)
    await hm.trigger("beforeSave", model as any)

    const data: Record<string, unknown> = {}
    const attrs = getState(model).attributes
    for (const [key, value] of Object.entries(attrs)) {
      if (key !== pk || value !== undefined) {
        data[key] = config?.casts?.[key] ? prepareForDb(value, config.casts[key]) : value
      }
    }

    try {
      const result = await db.insertInto(getTable(def)).values(data).returningAll().executeTakeFirst()

      if (result) {
        const applied = config?.casts ? applyCastsToData(config as any, result as any, "get") : result
        for (const [key, value] of Object.entries(applied as Record<string, unknown>)) {
          getState(model).attributes[key] = value
        }
      }
    } catch (e: any) {
      throw normalizeError(e, getTable(def))
    }

    setExists(model, true)
    syncOriginal(model)
    await hm.trigger("afterCreate", model as any)
    await hm.trigger("afterSave", model as any)
  }

  return model
}

// ─── INSERT MODEL ────────────────────────────────────────────
export async function insertModel(def: ModelDefinition, data: Record<string, unknown>): Promise<ModelInstance> {
  const config = getConfig(def) ?? { columns: def.columns }
  const model = createInstance(def, config, data, false)
  await saveModel(def, model)
  return model
}

// ─── INSERT MANY ─────────────────────────────────────────────
export async function insertManyModel(
  def: ModelDefinition,
  dataArray: Record<string, unknown>[],
): Promise<ModelInstance[]> {
  const db = getDb(def)
  const pk = getPrimaryKeyColumn(def)
  const config = getConfig(def)

  const prepared = dataArray.map((data) => {
    const row: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(data)) {
      if (key !== pk) {
        row[key] = config?.casts?.[key] ? prepareForDb(value, config.casts[key]) : value
      }
    }
    return row
  })

  let results: Record<string, unknown>[]
  try {
    results = (await db.insertInto(getTable(def)).values(prepared).returningAll().execute()) as Record<
      string,
      unknown
    >[]
  } catch (e: any) {
    throw normalizeError(e, getTable(def))
  }

  return results.map((row) => {
    const applied = config?.casts ? applyCastsToData(config as any, row as any, "get") : row
    return createInstance(def, config ?? { columns: def.columns }, applied, true)
  })
}

// ─── UPDATE MODEL ────────────────────────────────────────────
export async function updateModel(
  def: ModelDefinition,
  id: number | string,
  data: Record<string, unknown>,
): Promise<ModelInstance> {
  const model = await def.findOrFail(id)
  model.fill(data)
  await saveModel(def, model)
  return model
}

// ─── RELOAD MODEL ────────────────────────────────────────────
export async function reloadModel(def: ModelDefinition, model: ModelInstance): Promise<void> {
  const pk = getPrimaryKeyColumn(def)
  const pkValue = model.get(pk)
  if (pkValue == null) throw new DatabaseError("Cannot reload model without primary key", "MISSING_ID")

  const db = getDb(def)
  try {
    const row = await db.selectFrom(getTable(def)).selectAll().where(pk, "=", pkValue).executeTakeFirst()

    if (row) {
      const config = getConfig(def)
      const applied = config?.casts ? applyCastsToData(config as any, row as any, "get") : row
      const state = getState(model)
      state.attributes = { ...(applied as Record<string, unknown>) }
      state.original = { ...(applied as Record<string, unknown>) }
    }
  } catch (e: any) {
    throw normalizeError(e, getTable(def))
  }
}

// ─── GET CONFIG ──────────────────────────────────────────────
const configMap = new WeakMap<ModelDefinition, ModelConfig>()

export function setConfig(def: ModelDefinition, config: ModelConfig): void {
  configMap.set(def, config)
}

export function getConfig(def: ModelDefinition): ModelConfig | undefined {
  return configMap.get(def)
}
