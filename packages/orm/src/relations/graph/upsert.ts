import { DatabaseError } from "../../errors.js"
import type { ModelDefinition, ModelInstance } from "../../model/types.js"
import type { Relation } from "../base.js"
import type { UpsertGraphOptions, GraphContext } from "./types.js"
import { isRelPathAllowed, assertRelationAllowed, joinPath, relNameFromPath, resolveAllowGraph } from "./security.js"
import { isMorphManyRelation, getMorphType, getMorphTypeValue } from "./morph.js"
import {
  getPrimaryKeyColumn,
  getDb,
  getPivotInfo,
  resolveTargetId,
  extractGraphRelationData,
  collectRefs,
  resolveRefs,
} from "./parser.js"
import { processNode, processBelongsTo } from "./insert.js"

// ─── UPSERT GRAPH ─────────────────────────────────────────────

/**
 * Upsert a graph of related models.
 *
 * Models with an `id` get updated, models without an `id` get inserted.
 * Models in relation arrays that were not included get deleted (or unrelated).
 *
 * See {@link UpsertGraphOptions} for fine-grained control.
 */
export async function upsertGraph(
  def: ModelDefinition,
  data: Record<string, unknown> | Record<string, unknown>[],
  options: UpsertGraphOptions = {},
): Promise<any> {
  const context: GraphContext = {
    refMap: new Map(),
    processedRefs: new Map(),
    allowRefs: options.allowRefs ?? false,
    allowedGraphSet: resolveAllowGraph(options),
  }

  const nodes = Array.isArray(data) ? data : [data]

  for (const node of nodes) {
    collectRefs(node, def, context.refMap)
  }
  for (const node of nodes) {
    resolveRefs(node, context)
  }

  const results: ModelInstance[] = []
  for (const node of nodes) {
    const result = await upsertNode(node, def, null, options, context, "")
    results.push(result)
  }

  return Array.isArray(data) ? results : results[0]
}

// ─── NODE PROCESSING (UPSERT) ─────────────────────────────────

async function upsertNode(
  node: Record<string, unknown>,
  def: ModelDefinition,
  parentFK: Record<string, unknown> | null,
  options: UpsertGraphOptions,
  context: GraphContext,
  _path: string,
): Promise<ModelInstance> {
  const nodeId = node["#id"]
  if (nodeId && typeof nodeId === "string" && context.processedRefs.has(nodeId)) {
    return context.processedRefs.get(nodeId)!
  }

  const { columnData, relationOps } = extractGraphRelationData(def, node)

  if (parentFK) {
    Object.assign(columnData, parentFK)
  }

  // Process belongsTo FIRST
  for (const [relName, op] of Object.entries(relationOps)) {
    const relation = def.relations[relName]
    if (relation?.type === "belongsTo") {
      const relPath = joinPath(_path, relName)
      assertRelationAllowed(def, relPath, context.allowedGraphSet)
      const relatedInstance = await processBelongsTo(
        relation,
        op as Record<string, unknown>,
        options,
        context,
        relPath,
        columnData,
      )
      if (relatedInstance) {
        columnData[relation.foreignKey] = relatedInstance.get(relation.localKey)
      }
    }
  }

  // Determine: UPDATE or INSERT?
  const pkCol = getPrimaryKeyColumn(def)
  const idValue = columnData[pkCol] ?? node[pkCol]

  let instance: ModelInstance
  if (idValue != null) {
    // UPDATE existing
    if (isRelPathAllowed(pkCol, options.noUpdate as any)) {
      // noUpdate is set for this — skip update, just use existing
      const existing = await def.find(idValue as number | string)
      if (!existing) throw new DatabaseError(`Cannot find ${def.name} with id ${idValue}`, "UNKNOWN")
      instance = existing
    } else {
      const existing = await def.find(idValue as number | string)
      if (existing) {
        existing.fill(columnData)
        await existing.$save()
        instance = existing
      } else {
        // ID given but not found — insert with explicit id
        instance = await def.insert(columnData)
      }
    }
  } else {
    // INSERT new
    instance = await def.insert(columnData)
  }

  if (nodeId && typeof nodeId === "string") {
    context.processedRefs.set(nodeId, instance)
  }

  // Process post-insert relations
  const pkValue = instance.get(pkCol)
  if (pkValue == null) throw new DatabaseError("Cannot process relations without primary key", "MISSING_ID")

  for (const [relName, op] of Object.entries(relationOps)) {
    const relation = def.relations[relName]
    if (!relation) continue
    if (relation.type === "belongsTo") continue

    const relPath = joinPath(_path, relName)
    assertRelationAllowed(def, relPath, context.allowedGraphSet)

    if (relation.type === "hasMany" || relation.type === "hasOne") {
      await upsertHasMany(instance, relation, op, pkValue, options, context, relPath)
    } else if (relation.type === "manyToMany") {
      await upsertManyToMany(instance, relation, op, pkValue, options, context, relPath)
    }
  }

  return instance
}

async function upsertHasMany(
  _instance: ModelInstance,
  relation: Relation,
  op: unknown,
  pkValue: unknown,
  options: UpsertGraphOptions,
  context: GraphContext,
  path: string,
): Promise<void> {
  const relatedDef = relation.relatedModelClass
  const fk = relation.foreignKey

  // Fetch existing children from DB
  const existingChildren = await relatedDef
    .query()
    .where(fk, "=", pkValue as any)
    .execute()
  const existingMap = new Map<unknown, ModelInstance>()
  for (const child of existingChildren) {
    const pkCol = getPrimaryKeyColumn(relatedDef)
    existingMap.set(child.get(pkCol), child)
  }

  // Process incoming items
  const items: Record<string, unknown>[] = Array.isArray(op) ? op : (op as any)?.create ? (op as any).create : []

  const incomingIds = new Set<unknown>()

  for (const item of items) {
    const pkCol = getPrimaryKeyColumn(relatedDef)
    const itemId = item[pkCol] ?? item.id

    if (itemId != null) {
      incomingIds.add(itemId)

      // Update existing
      if (!isRelPathAllowed(relNameFromPath(path), options.noUpdate)) {
        const existing = existingMap.get(itemId)
        if (existing) {
          // Extract only column data — don't try to fill relation keys as columns
          const { columnData: colData, relationOps: nestedOps } = extractGraphRelationData(relatedDef, item)
          existing.fill(colData)
          await existing.$save()
          if (item["#id"]) context.processedRefs.set(item["#id"] as string, existing)
          // Remove from existingMap so we know what's left
          existingMap.delete(itemId)
          // Recurse into nested relations
          for (const [relName, relOp] of Object.entries(nestedOps)) {
            const rel = relatedDef.relations[relName]
            if (!rel) continue
            const nestedPath = `${path}.${relName}`
            assertRelationAllowed(relatedDef, nestedPath, context.allowedGraphSet)
            const childPk = existing.get(getPrimaryKeyColumn(relatedDef))
            if (rel.type === "hasMany" || rel.type === "hasOne") {
              await upsertHasMany(existing, rel, relOp, childPk, options, context, nestedPath)
            } else if (rel.type === "manyToMany") {
              await upsertManyToMany(existing, rel, relOp, childPk, options, context, nestedPath)
            }
          }
          continue
        }
      }
    }

    // Insert new (or existing not found)
    const parentData: Record<string, unknown> = { [fk]: pkValue }
    if (isMorphManyRelation(relation)) {
      const typeCol = getMorphType(relation)!
      const typeVal = getMorphTypeValue(relation)
      if (typeVal !== undefined) parentData[typeCol] = typeVal
    }
    await processNode(item, relatedDef, parentData, options, context, path)
  }

  // Handle delete/unrelate for remaining existing items
  const relName = relNameFromPath(path)
  const shouldDelete = !isRelPathAllowed(relName, options.noDelete)
  const shouldUnrelate = isRelPathAllowed(relName, options.unrelate)

  if (shouldDelete || shouldUnrelate) {
    for (const [existingId, existing] of existingMap) {
      if (!incomingIds.has(existingId)) {
        if (shouldUnrelate) {
          existing.set(fk, null)
          await existing.$save()
        } else if (shouldDelete) {
          await existing.$delete()
        }
      }
    }
  }
}

async function upsertManyToMany(
  _instance: ModelInstance,
  relation: Relation,
  op: unknown,
  pkValue: unknown,
  options: UpsertGraphOptions,
  context: GraphContext,
  path: string,
): Promise<void> {
  const relatedDef = relation.relatedModelClass
  const { throughTable, foreignPivotKey, relatedPivotKey } = getPivotInfo(relation)
  const db = getDb(relatedDef)

  // Fetch existing pivot rows
  let existingPivotIds = new Set<unknown>()
  try {
    const pivots = await db
      .selectFrom(throughTable)
      .select(relatedPivotKey)
      .where(foreignPivotKey, "=", pkValue)
      .execute()
    existingPivotIds = new Set(pivots.map((p: any) => p[relatedPivotKey]))
  } catch {
    /* table may not exist yet */
  }

  const incomingIds = new Set<unknown>()

  const items: Record<string, unknown>[] = Array.isArray(op) ? op : (op as any)?.create ? (op as any).create : []

  for (const item of items) {
    if (item["#dbRef"] != null) {
      const id = item["#dbRef"]
      incomingIds.add(id)
      if (!existingPivotIds.has(id)) {
        try {
          await db
            .insertInto(throughTable)
            .values({ [foreignPivotKey]: pkValue, [relatedPivotKey]: id })
            .execute()
        } catch {
          /* skip */
        }
      }
      continue
    }

    const pkCol = getPrimaryKeyColumn(relatedDef)
    const itemId = item[pkCol] ?? item.id

    if (itemId != null) {
      incomingIds.add(itemId)

      // Update existing if not excluded
      if (!isRelPathAllowed(relNameFromPath(path), options.noUpdate)) {
        const existing = await relatedDef.find(itemId as number | string)
        if (existing) {
          existing.fill(item as Record<string, unknown>)
          await existing.$save()
        }
      }

      // Ensure pivot row exists
      if (!existingPivotIds.has(itemId)) {
        try {
          await db
            .insertInto(throughTable)
            .values({ [foreignPivotKey]: pkValue, [relatedPivotKey]: itemId })
            .execute()
        } catch {
          /* skip */
        }
      }
    } else {
      // Create new child and pivot
      const related = await processNode(item, relatedDef, null, options, context, path)
      const relatedId = related.get(relation.localKey ?? "id")
      if (relatedId != null) {
        incomingIds.add(relatedId)
        try {
          await db
            .insertInto(throughTable)
            .values({ [foreignPivotKey]: pkValue, [relatedPivotKey]: relatedId })
            .execute()
        } catch {
          /* skip */
        }
      }
    }
  }

  // Handle connect items
  const connectItems = !Array.isArray(op) ? ((op as any)?.connect ?? []) : []
  for (const target of connectItems) {
    const targetId = await resolveTargetId(relatedDef, target)
    if (targetId != null) {
      incomingIds.add(targetId)
      if (!existingPivotIds.has(targetId)) {
        try {
          await db
            .insertInto(throughTable)
            .values({ [foreignPivotKey]: pkValue, [relatedPivotKey]: targetId })
            .execute()
        } catch {
          /* skip */
        }
      }
    }
  }

  // Handle delete/unrelate for missing pivot rows
  const relName = relNameFromPath(path)
  const shouldDelete = !isRelPathAllowed(relName, options.noDelete)
  const shouldUnrelate = isRelPathAllowed(relName, options.unrelate)

  if (shouldDelete || shouldUnrelate) {
    for (const pivotId of existingPivotIds) {
      if (!incomingIds.has(pivotId)) {
        if (shouldUnrelate) {
          // For many-to-many, unrelate means remove pivot row
          try {
            await db
              .deleteFrom(throughTable)
              .where(foreignPivotKey, "=", pkValue)
              .where(relatedPivotKey, "=", pivotId)
              .execute()
          } catch {
            /* skip */
          }
        } else if (shouldDelete) {
          await (await relatedDef.find(pivotId as number | string))?.$delete()
          try {
            await db
              .deleteFrom(throughTable)
              .where(foreignPivotKey, "=", pkValue)
              .where(relatedPivotKey, "=", pivotId)
              .execute()
          } catch {
            /* skip */
          }
        }
      }
    }
  }
}
