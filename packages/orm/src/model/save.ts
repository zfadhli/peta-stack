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

/** Find the primary key column definition from model columns. */
function getPrimaryKeyColumn(def: ModelDefinition): { name: string; isAutoIncrement: boolean } {
  for (const [name, col] of Object.entries(def.columns)) {
    if (col.isPrimaryKey) {
      return {
        name,
        isAutoIncrement: ["integer", "smallint", "bigint"].includes(col.dataType),
      }
    }
  }
  return { name: "id", isAutoIncrement: true }
}

export async function saveModel(def: ModelDefinition, model: ModelInstance): Promise<void> {
  const hooks = getHooksFor(def)
  const state = getState(model)
  const isNew = !getExists(model)
  const peta = def._peta
  if (!peta) throw new Error(`${def.table} has not been registered with Peta`)
  const pk = getPrimaryKeyColumn(def)
  if (isNew) {
    await hooks.trigger("beforeCreate", model as never)
    await hooks.trigger("beforeSave", model as never)
    state.attributes = { ...state.attributes }

    const data = prepareForDb(def, { ...state.attributes })
    // For auto-increment PKs, let the DB generate the value
    if (pk.isAutoIncrement) delete data[pk.name]

    try {
      // Primary path: RETURNING * returns all DB-generated values
      // (auto-increment IDs, column defaults, trigger values).
      const row = (await peta.kysely.insertInto(def.table).values(data).returningAll().executeTakeFirst()) as
        | Record<string, unknown>
        | undefined

      if (row && Object.keys(row).length > 0) {
        // Merge DB-returned values into attributes (overwrites with real DB values)
        state.attributes = { ...state.attributes, ...row }
      }
      setExists(model, true)
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e)
      if (errMsg.includes("syntax error") || errMsg.includes("near") || errMsg.includes("does not support RETURNING")) {
        // Fallback for dialects without RETURNING (MySQL, older SQLite)
        try {
          const result = await peta.kysely.insertInto(def.table).values(data).executeTakeFirst()
          if (result?.insertId != null) {
            state.attributes[pk.name] = Number(result.insertId)
          }
          setExists(model, true)
        } catch (e2: unknown) {
          throw normalizeError(e2, def.table) ?? e2
        }
      } else {
        throw normalizeError(e, def.table) ?? e
      }
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
    const id = state.attributes[pk.name]
    if (id == null) throw new DatabaseError("MISSING_ID", "Cannot update a model without an id")
    try {
      await peta.kysely
        .updateTable(def.table)
        .set(dirty)
        .where(pk.name, "=", id as never)
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
  if (dataArray.length === 0) return []

  const db: any = kyselyOverride ?? peta.kysely
  const prepared = dataArray.map((row) => prepareForDb(def, row))

  try {
    // RETURNING * lets us read back DB-generated values (auto-increment IDs,
    // column defaults, trigger values). Works on SQLite 3.35+ (Kysely's
    // SqliteAdapter.supportsReturning is true) and all PostgreSQL versions.
    const rows: Record<string, unknown>[] = await db.insertInto(def.table).values(prepared).returningAll().execute()
    return rows.map((row) => def._hydrate(row))
  } catch (e: unknown) {
    // Fallback for dialects that don't support RETURNING (MySQL, older SQLite).
    // The RETURNING syntax error is detected and we retry without it.
    // Real errors (constraint violations, etc.) are re-thrown via normalizeError.
    const errMsg = e instanceof Error ? e.message : String(e)
    if (errMsg.includes("syntax error") || errMsg.includes("near") || errMsg.includes("does not support RETURNING")) {
      try {
        await db.insertInto(def.table).values(prepared).execute()
        return dataArray.map((row) => def._hydrate(row))
      } catch (e2: unknown) {
        throw normalizeError(e2, def.table) ?? e2
      }
    }
    throw normalizeError(e, def.table) ?? e
  }
}

export async function reloadModel(def: ModelDefinition, model: ModelInstance): Promise<void> {
  const peta = def._peta
  if (!peta) throw new Error(`${def.table} has not been registered with Peta`)
  const state = getState(model)
  const pk = getPrimaryKeyColumn(def)
  const id = state.attributes[pk.name]
  if (id == null) throw new DatabaseError("MISSING_ID", "Cannot reload a model without an id")
  const row = await peta.kysely
    .selectFrom(def.table)
    .selectAll()
    .where(pk.name, "=", id as never)
    .executeTakeFirst()
  if (row) {
    state.attributes = { ...(row as Record<string, unknown>) }
    state.original = { ...(row as Record<string, unknown>) }
    setExists(model, true)
  }
}
