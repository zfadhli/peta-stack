import { DatabaseError, normalizeError } from "../errors.js"
import { getDb, getPrimaryKeyColumn } from "../lib/model-helpers.js"
import { getHooksFor, getSoftDeleteConfig, hasSoftDelete } from "./hooks.js"
import { setExists } from "./state.js"
import type { ModelDefinition, ModelInstance } from "./types.js"

// ─── DELETE MODEL ────────────────────────────────────────────
export async function deleteModel(def: ModelDefinition, model: ModelInstance): Promise<void> {
  const pk = getPrimaryKeyColumn(def)
  const pkValue = model.get(pk)

  if (pkValue == null) {
    throw new DatabaseError("Cannot delete model without primary key", "MISSING_ID")
  }

  const hm = getHooksFor(def)

  if (hasSoftDelete(def)) {
    // Soft delete
    await hm.trigger("beforeDelete", model)
    const config = getSoftDeleteConfig(def)!
    const db = getDb(def)

    try {
      await db
        .updateTable(def.table)
        .set({ [config.column]: new Date().toISOString() })
        .where(pk, "=", pkValue)
        .execute()
    } catch (e: any) {
      throw normalizeError(e, def.table)
    }

    model.set(config.column, new Date().toISOString())
    await hm.trigger("afterDelete", model)
  } else {
    // Hard delete
    await hm.trigger("beforeDelete", model)
    const db = getDb(def)

    try {
      await db.deleteFrom(def.table).where(pk, "=", pkValue).execute()
    } catch (e: any) {
      throw normalizeError(e, def.table)
    }

    setExists(model, false)
    await hm.trigger("afterDelete", model)
  }
}

// ─── FORCE DELETE ────────────────────────────────────────────
export async function forceDeleteModel(def: ModelDefinition, model: ModelInstance): Promise<void> {
  const pk = getPrimaryKeyColumn(def)
  const pkValue = model.get(pk)

  if (pkValue == null) {
    throw new DatabaseError("Cannot delete model without primary key", "MISSING_ID")
  }

  const hm = getHooksFor(def)
  await hm.trigger("beforeForceDelete", model)

  const db = getDb(def)
  try {
    await db.deleteFrom(def.table).where(pk, "=", pkValue).execute()
  } catch (e: any) {
    throw normalizeError(e, def.table)
  }

  setExists(model, false)
  await hm.trigger("afterForceDelete", model)
}

// ─── RESTORE ─────────────────────────────────────────────────
export async function restoreModel(def: ModelDefinition, model: ModelInstance): Promise<void> {
  const pk = getPrimaryKeyColumn(def)
  const pkValue = model.get(pk)
  if (pkValue == null) return

  if (!hasSoftDelete(def)) return

  const hm = getHooksFor(def)
  await hm.trigger("beforeRestore", model)

  const config = getSoftDeleteConfig(def)!
  const db = getDb(def)
  try {
    await db
      .updateTable(def.table)
      .set({ [config.column]: null })
      .where(pk, "=", pkValue)
      .execute()
  } catch (e: any) {
    throw normalizeError(e, def.table)
  }

  model.set(config.column, null)
  setExists(model, true)
  await hm.trigger("afterRestore", model)
}

// ─── TRASHED CHECK ───────────────────────────────────────────
export function trashedModel(def: ModelDefinition, model: ModelInstance): boolean {
  if (!hasSoftDelete(def)) return false
  const config = getSoftDeleteConfig(def)!
  return model.get(config.column) != null
}
