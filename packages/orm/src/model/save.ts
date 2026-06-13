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

    await hm.trigger("beforeUpdate", model)
    await hm.trigger("beforeSave", model)

    const pkValue = model.get(pk)
    try {
      await db.updateTable(getTable(def)).set(changed).where(pk, "=", pkValue).execute()
    } catch (e: any) {
      throw normalizeError(e, getTable(def))
    }

    syncOriginal(model)
    await hm.trigger("afterUpdate", model)
    await hm.trigger("afterSave", model)
  } else {
    // INSERT
    await hm.trigger("beforeCreate", model)
    await hm.trigger("beforeSave", model)

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
    await hm.trigger("afterCreate", model)
    await hm.trigger("afterSave", model)
  }

  return model
}

// ─── INSERT MODEL (with nested relation support) ─────────────
export async function insertModel(def: ModelDefinition, data: Record<string, unknown>): Promise<ModelInstance> {
  const config = getConfig(def) ?? { columns: def.columns }

  // Check if data has relation operations
  const hasRelationOps = Object.keys(data).some((key) => key in def.relations)

  if (!hasRelationOps) {
    // Simple case — no relations
    const model = createInstance(def, config, data, false)
    await saveModel(def, model)
    return model
  }

  // Complex case — extract and process relations
  const { extractRelationData, processCreateRelations } = await import("../relations/crud.js")
  const { columnData, relationOps } = extractRelationData(def, data)

  // Step 1: Process belongsTo relations (create/connect related FIRST, then set FK)
  for (const [relName, op] of Object.entries(relationOps)) {
    const relation = def.relations[relName]
    if (relation?.type === "belongsTo") {
      const bop = op as any
      const relatedDef = relation.relatedModelClass

      if (bop.create) {
        const related = await relatedDef.insert(bop.create)
        columnData[relation.foreignKey] = related.get(relation.localKey)
      } else if (bop.connect) {
        const cond = bop.connect as Record<string, unknown>
        const condKey = Object.keys(cond)[0]!
        const found = await relatedDef
          .query()
          .where(condKey, "=", cond[condKey])
          .executeTakeFirst()
        if (found) {
          columnData[relation.foreignKey] = found.get(relation.localKey)
        }
      } else if (bop.connectOrCreate) {
        const { where, create } = bop.connectOrCreate as {
          where: Record<string, unknown>
          create: Record<string, unknown>
        }
        const whereKey = Object.keys(where)[0]!
        const found = await relatedDef
          .query()
          .where(whereKey, "=", where[whereKey])
          .executeTakeFirst()
        if (found) {
          columnData[relation.foreignKey] = found.get(relation.localKey)
        } else {
          const created = await relatedDef.insert(create)
          columnData[relation.foreignKey] = created.get(relation.localKey)
        }
      }
    }
  }

  // Step 2: Create the model with column data
  const model = createInstance(def, config, columnData, false)
  await saveModel(def, model)

  // Step 3: Process post-insert relations (hasMany, manyToMany)
  const postOps: Record<string, any> = {}
  for (const [relName, op] of Object.entries(relationOps)) {
    const relation = def.relations[relName]
    if (relation && relation.type !== "belongsTo") {
      postOps[relName] = op
    }
  }
  if (Object.keys(postOps).length > 0) {
    await processCreateRelations(def, model, postOps)
  }

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
  const hm = getHooksFor(def)

  // Create instances and run beforeCreate hooks (e.g. ulid() plugin)
  const instances: ModelInstance[] = []
  for (const data of dataArray) {
    // Exclude PK from the data passed to fill() so RETURNING can provide it
    const instance = createInstance(def, config ?? { columns: def.columns }, {}, false)
    const fillData: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(data)) {
      if (key !== pk) fillData[key] = value
    }
    instance.fill(fillData)
    await hm.trigger("beforeCreate", instance)
    instances.push(instance)
  }

  // Extract prepared data from instances (with ULIDs / defaults populated)
  const prepared = instances.map((inst) => {
    const attrs = (inst as any).attributes ?? {}
    const row: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(attrs)) {
      row[key] = config?.casts?.[key] ? prepareForDb(value, config.casts[key]) : value
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

  const models = results.map((row) => {
    const applied = config?.casts ? applyCastsToData(config as any, row as any, "get") : row
    return createInstance(def, config ?? { columns: def.columns }, applied, true)
  })

  // Run afterCreate hooks
  for (const model of models) {
    await hm.trigger("afterCreate", model)
  }

  return models
}

// ─── UPDATE MODEL (with nested relation support) ──────────────
export async function updateModel(
  def: ModelDefinition,
  id: number | string,
  data: Record<string, unknown>,
): Promise<ModelInstance> {
  const model = await def.findOrFail(id)

  // Check if data has relation operations
  const hasRelationOps = Object.keys(data).some((key) => key in def.relations)

  if (!hasRelationOps) {
    model.fill(data)
    await saveModel(def, model)
    return model
  }

  // Extract relation operations
  const { extractRelationData } = await import("../relations/crud.js")
  const { columnData, relationOps } = extractRelationData(def, data)

  // Apply column data to the model
  model.fill(columnData)
  await saveModel(def, model)

  // Process relation operations on the existing model
  const pkValue = model.get("id")
  if (pkValue == null) return model

  for (const [relName, op] of Object.entries(relationOps)) {
    const relation = def.relations[relName]
    if (!relation) continue

    const relatedDef = relation.relatedModelClass
    const db = (relatedDef._orm as any)?.kysely
    if (!db) continue

    if (relation.type === "belongsTo") {
      const bop = op as any

      if (bop.update) {
        // Update the related model
        const fkValue = model.get(relation.foreignKey)
        if (fkValue != null) {
          const related = await relatedDef.find(fkValue as any)
          if (related) {
            related.fill(bop.update)
            const { saveModel: saveRel } = await import("./save.js")
            await saveRel(relatedDef, related)
          }
        }
      } else if (bop.upsert) {
        const { update, create } = bop.upsert
        const fkValue = model.get(relation.foreignKey)
        if (fkValue != null) {
          const related = await relatedDef.find(fkValue as any)
          if (related) {
            related.fill(update)
            const { saveModel: saveRel } = await import("./save.js")
            await saveRel(relatedDef, related)
          }
        } else {
          const created = await relatedDef.insert(create)
          await db
            .updateTable(def.table)
            .set({ [relation.foreignKey]: created.get(relation.localKey) })
            .where("id", "=", pkValue)
            .execute()
          model.set(relation.foreignKey, created.get(relation.localKey))
        }
      } else if (bop.disconnect) {
        await db
          .updateTable(def.table)
          .set({ [relation.foreignKey]: null })
          .where("id", "=", pkValue)
          .execute()
        model.set(relation.foreignKey, null)
      } else if (bop.delete) {
        const fkValue = model.get(relation.foreignKey)
        if (fkValue != null) {
          const related = await relatedDef.find(fkValue as any)
          if (related) {
            const { deleteModel: delRel } = await import("./delete.js")
            await delRel(relatedDef, related)
          }
        }
      }
    } else if (relation.type === "hasMany" || relation.type === "hasOne") {
      const hop = op as any

      if (hop.create) {
        for (const childData of hop.create) {
          await relatedDef.insert({ ...childData, [relation.foreignKey]: pkValue })
        }
      }

      if (hop.update) {
        const queries = Array.isArray(hop.update?.where) ? hop.update.where : [hop.update?.where]
        for (const where of queries) {
          const whereKey = Object.keys(where)[0]!
          await relatedDef
            .query()
            .where(whereKey, "=", where[whereKey])
            .all()
            .updateMany(hop.update.data)
        }
      }

      if (hop.delete) {
        const queries = Array.isArray(hop.delete) ? hop.delete : [hop.delete]
        for (const where of queries) {
          const whereKey = Object.keys(where)[0]!
          await relatedDef.query().where(whereKey, "=", where[whereKey]).all().deleteMany()
        }
      }
    } else if (relation.type === "manyToMany") {
      const mop = op as any

      if (mop.create) {
        const throughTable = relation.throughTable!
        const fpk = relation.foreignPivotKey!
        const rpk = relation.relatedPivotKey!

        for (const childData of mop.create) {
          const child = await relatedDef.insert(childData)
          try {
            await db
              .insertInto(throughTable)
              .values({ [fpk]: pkValue, [rpk]: child.get(relation.localKey ?? "id") })
              .execute()
          } catch {
            /* skip duplicate */
          }
        }
      }

      if (mop.connect) {
        const throughTable = relation.throughTable!
        const fpk = relation.foreignPivotKey!
        const rpk = relation.relatedPivotKey!

        for (const target of mop.connect) {
          let targetId: unknown = target
          if (typeof target !== "number" && typeof target !== "string") {
            const t = target as Record<string, unknown>
            const key = Object.keys(t)[0]!
            const found = await relatedDef.query().where(key, "=", t[key]).executeTakeFirst()
            targetId = found?.get("id")
          }
          if (targetId != null) {
            try {
              await db
                .insertInto(throughTable)
                .values({ [fpk]: pkValue, [rpk]: targetId })
                .execute()
            } catch {
              /* skip duplicate */
            }
          }
        }
      }

      if (mop.disconnect) {
        const throughTable = relation.throughTable!
        const fpk = relation.foreignPivotKey!
        const rpk = relation.relatedPivotKey!

        const queries = Array.isArray(mop.disconnect) ? mop.disconnect : [mop.disconnect]
        for (const where of queries) {
          if (typeof where === "object" && Object.keys(where).length > 0) {
            const key = Object.keys(where)[0]
            const val = Object.values(where)[0]
            if (key === "id") {
              await db.deleteFrom(throughTable).where(fpk, "=", pkValue).where(rpk, "=", val).execute()
            }
          }
        }
      }

      if (mop.set) {
        const throughTable = relation.throughTable!
        const fpk = relation.foreignPivotKey!
        const rpk = relation.relatedPivotKey!

        // Get current IDs
        const current = await db.selectFrom(throughTable).select(rpk).where(fpk, "=", pkValue).execute()
        const currentIds = new Set(current.map((r: any) => r[rpk]))
        const desiredIds = new Set<unknown>()

        for (const target of mop.set) {
          let targetId: unknown = target
          if (typeof target !== "number" && typeof target !== "string") {
            const t = target as Record<string, unknown>
            const key = Object.keys(t)[0]!
            const found = await relatedDef.query().where(key, "=", t[key]).executeTakeFirst()
            targetId = found?.get("id")
          }
          if (targetId != null) {
            desiredIds.add(targetId)
            if (!currentIds.has(targetId)) {
              try {
                await db
                  .insertInto(throughTable)
                  .values({ [fpk]: pkValue, [rpk]: targetId })
                  .execute()
              } catch {}
            }
          }
        }

        // Remove IDs that are in current but not desired
        for (const id of currentIds) {
          if (!desiredIds.has(id)) {
            await db.deleteFrom(throughTable).where(fpk, "=", pkValue).where(rpk, "=", id).execute()
          }
        }
      }
    }
  }

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
