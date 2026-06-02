import type { Kysely } from "kysely"
import { ValidationError } from "../errors/errors"
import type { Column } from "../columns/column"
import { DatabaseError, ModelNotRegisteredError, normalizeError } from "../errors/errors"
import type { HookManager } from "../hooks/lifecycle"
import type { Model, ModelClass } from "./model"
import { getDirtyAttributes, getExists, getState, getAttr, setAttr, setExists, syncOriginal } from "./model-state"

export async function saveModel(model: Model): Promise<Model> {
  const modelClass = model.constructor as ModelClass
  const peta = modelClass.peta
  if (!peta) throw new ModelNotRegisteredError(modelClass.name)
  const table = modelClass.table
  const columns = modelClass.columns
  const hooks = modelClass.hooks

  await hooks.trigger("beforeSave", model)

  if (getExists(model)) {
    await updateExisting(model, modelClass, peta, table, columns, hooks)
  } else {
    await insertNew(model, modelClass, peta, table, columns, hooks)
  }

  await hooks.trigger("afterSave", model)
  return model
}

async function updateExisting(
  model: Model,
  modelClass: ModelClass,
  peta: { kysely: Kysely<any> },
  table: string,
  columns: Record<string, Column>,
  hooks: HookManager,
): Promise<void> {
  const dirty = getDirtyAttributes(model)
  if (Object.keys(dirty).length === 0) {
    await hooks.trigger("afterSave", model)
    return
  }

  await hooks.trigger("beforeUpdate", model)

  for (const key of Object.keys(dirty)) {
    const col = columns[key]
    if (col) {
      try {
        col.assert(dirty[key])
      } catch (e) {
        if (e instanceof ValidationError) {
          throw new ValidationError(`${key}: ${e.message}`, e.errors)
        }
        throw e
      }
    }
  }

  const id = getAttr(model, "id")
  if (id === undefined || id === null) {
    throw new Error("Cannot update a model without an id")
  }

  try {
    await peta.kysely.updateTable(table).set(dirty).where("id", "=", id).execute()
  } catch (e) {
    const normalized = normalizeError(e, table)
    if (normalized) throw normalized
    throw e
  }

  syncOriginal(model)
  await hooks.trigger("afterUpdate", model)
}

async function insertNew(
  model: Model,
  modelClass: ModelClass,
  peta: { kysely: Kysely<any> },
  table: string,
  columns: Record<string, Column>,
  hooks: HookManager,
): Promise<void> {
  await hooks.trigger("beforeCreate", model)

  for (const [key, col] of Object.entries(columns)) {
    const value = getAttr(model, key) ?? col.defaultValue
    if (value !== undefined && value !== null) {
      try {
        col.assert(value)
      } catch (e) {
        if (e instanceof ValidationError) {
          throw new ValidationError(`${key}: ${e.message}`, e.errors)
        }
        throw e
      }
    }
  }

  let result: { insertId?: number | bigint } | undefined
  try {
    result = await peta.kysely.insertInto(table).values(getState(model).attributes).executeTakeFirst()
  } catch (e) {
    const normalized = normalizeError(e, table)
    if (normalized) throw normalized
    throw e
  }

  const insertId = result?.insertId
  if (insertId !== undefined) {
    setAttr(model, "id", Number(insertId))
  }

  setExists(model, true)
  syncOriginal(model)
  await hooks.trigger("afterCreate", model)
}

export async function insertModel<T extends Model>(this: ModelClass<T>, data: Record<string, unknown>): Promise<T> {
  const instance = new this()
  const state = getState(instance)
  const forbidden = new Set(["__proto__", "constructor", "prototype"])
  for (const [key, value] of Object.entries(data)) {
    if (forbidden.has(key)) continue
    state.attributes[key] = value
  }
  state.exists = false
  await saveModel(instance)
  return instance
}

export async function insertManyModel<T extends Model>(
  this: ModelClass<T>,
  dataArray: Record<string, unknown>[],
  kysely?: Kysely<any>,
): Promise<T[]> {
  const peta = this.peta
  if (!peta) throw new ModelNotRegisteredError(this.name)
  const trx = kysely ?? peta.kysely
  const results: T[] = []
  for (const data of dataArray) {
    const instance = this.hydrate(data)
    const state = getState(instance)
    let result: { insertId?: number | bigint } | undefined
    try {
      result = await trx
        .insertInto(this.table)
        .values(data as Record<string, unknown>)
        .executeTakeFirst()
    } catch (e) {
      const normalized = normalizeError(e, this.table)
      if (normalized) throw normalized
      throw e
    }
    const insertId = result?.insertId
    if (insertId !== undefined) {
      state.attributes.id = Number(insertId)
    }
    results.push(instance as T)
  }
  return results
}
