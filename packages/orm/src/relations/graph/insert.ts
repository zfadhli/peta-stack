import { DatabaseError, isUniqueConstraintError, normalizeError } from "../../errors.js"
import type { ModelDefinition, ModelInstance } from "../../model/types.js"
import type { Relation } from "../base.js"
import {
  getMorphId,
  getMorphType,
  getMorphTypeValue,
  isMorphManyRelation,
  isMorphToRelation,
  resolveThunk,
} from "./morph.js"
import {
  collectRefs,
  extractGraphRelationData,
  findRelated,
  getDb,
  getPivotInfo,
  getPrimaryKeyColumn,
  resolveRefs,
  resolveTargetId,
} from "./parser.js"
import { assertRelationAllowed, joinPath, resolveAllowGraph } from "./security.js"
import type { GraphContext, InsertGraphOptions, RelationOperationShape } from "./types.js"

// ─── INSERT GRAPH ─────────────────────────────────────────────

/**
 * Insert a graph of related models.
 *
 * Supports:
 * - Nested relation objects (belongsTo/hasOne)
 * - Nested relation arrays (hasMany/manyToMany)
 * - `#id` / `#ref` for shared references (requires `allowRefs: true`)
 * - `#dbRef` for relating to existing records
 *
 * Returns the root node(s) as ModelInstance(s) with IDs populated.
 */
export async function insertGraph(
  def: ModelDefinition,
  data: Record<string, unknown> | Record<string, unknown>[],
  options: InsertGraphOptions = {},
): Promise<any> {
  const context: GraphContext = {
    refMap: new Map(),
    processedRefs: new Map(),
    allowRefs: options.allowRefs ?? false,
    allowedGraphSet: resolveAllowGraph(options),
  }

  const nodes = Array.isArray(data) ? data : [data]

  // Phase 1: collect #id markers
  for (const node of nodes) {
    collectRefs(node, def, context.refMap)
  }

  // Phase 2: resolve #ref references (including at root level)
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]
    if (typeof node === "object" && node !== null && "#ref" in node) {
      if (!context.allowRefs) {
        throw new Error(
          `#ref is used but allowRefs option is not enabled. Set { allowRefs: true } to use #ref.`,
        )
      }
      const refId = node["#ref"] as string | undefined
      if (!refId) throw new Error(`#ref must be a string`)
      const entry = context.refMap.get(refId)
      if (!entry) {
        throw new Error(`#ref "${refId}" not found in graph`)
      }
      nodes[i] = entry.node
    } else if (node) {
      resolveRefs(node, context)
    }
  }

  // Phase 3: process each root node
  const results: ModelInstance[] = []
  for (const node of nodes) {
    const result = await processNode(node, def, null, options, context, "")
    results.push(result)
  }

  return Array.isArray(data) ? results : results[0]
}

// ─── NODE PROCESSING (INSERT) ─────────────────────────────────

export async function processNode(
  node: Record<string, unknown>,
  def: ModelDefinition,
  parentFK: Record<string, unknown> | null,
  options: InsertGraphOptions,
  context: GraphContext,
  path: string,
): Promise<ModelInstance> {
  // Deduplicate: if this node's #id was already processed, return cached instance
  const nodeId = node["#id"]
  if (nodeId && typeof nodeId === "string" && context.processedRefs.has(nodeId)) {
    return context.processedRefs.get(nodeId)!
  }

  const { columnData, relationOps } = extractGraphRelationData(def, node)

  // Apply parent FK if provided
  if (parentFK) {
    Object.assign(columnData, parentFK)
  }

  // Phase 1: Process belongsTo relations FIRST (they provide FK values for this node)
  for (const [relName, op] of Object.entries(relationOps)) {
    const relation = def.relations[relName]
    if (relation?.type === "belongsTo") {
      const relPath = joinPath(path, relName)
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

  // Phase 2: Create the node itself
  // Handle #dbRef at root level (relate to existing record instead of insert)
  if (node["#dbRef"] != null) {
    const id = node["#dbRef"]
    const existing = await def.find(id as number | string)
    if (!existing) throw new DatabaseError(`#dbRef ${id} not found on ${def.name}`, "UNKNOWN")
    // Track processed ref
    if (nodeId && typeof nodeId === "string") {
      context.processedRefs.set(nodeId, existing)
    }
    return existing
  }

  const instance = await def.insert(columnData)

  // Track processed ref
  if (nodeId && typeof nodeId === "string") {
    context.processedRefs.set(nodeId, instance)
  }

  // Phase 3: Process post-insert relations (hasMany, hasOne, manyToMany)
  const pkCol = getPrimaryKeyColumn(def)
  const pkValue = instance.get(pkCol)
  if (pkValue == null)
    throw new DatabaseError("Cannot process relations without primary key", "MISSING_ID")

  for (const [relName, op] of Object.entries(relationOps)) {
    const relation = def.relations[relName]
    if (!relation) continue
    if (relation.type === "belongsTo") continue // already handled

    const relPath = joinPath(path, relName)
    assertRelationAllowed(def, relPath, context.allowedGraphSet)

    const relOptions = {
      ...options,
      relate: options.relate,
    }

    if (relation.type === "hasMany" || relation.type === "hasOne") {
      await processHasMany(instance, relation, op, pkValue, relOptions, context, relPath)
    } else if (relation.type === "manyToMany") {
      await processManyToMany(instance, relation, op, pkValue, relOptions, context, relPath)
    }
  }

  return instance
}

export async function processBelongsTo(
  relation: Relation,
  op: Record<string, unknown>,
  options: InsertGraphOptions,
  context: GraphContext,
  path: string,
  parentColumnData?: Record<string, unknown>,
): Promise<ModelInstance | null> {
  // Handle MorphTo (polymorphic belongsTo)
  if (isMorphToRelation(relation)) {
    return processMorphTo(relation, op, options, context, path, parentColumnData)
  }

  const relatedDef = relation.relatedModelClass

  // #dbRef: relate to existing
  if (op["#dbRef"] != null) {
    const id = op["#dbRef"]
    const existing = await relatedDef.find(id as number | string)
    if (!existing)
      throw new DatabaseError(`#dbRef ${id} not found on ${relatedDef.name}`, "UNKNOWN")
    return existing
  }

  // { connect: { key: value } }: find existing and relate
  if (op.connect && typeof op.connect === "object") {
    const conditions = op.connect as Record<string, unknown>
    const existing = await findRelated(relatedDef, conditions)
    if (existing) return existing
    throw new DatabaseError(
      `Cannot connect: ${JSON.stringify(conditions)} not found on ${relatedDef.name}`,
      "UNKNOWN",
    )
  }

  // { create: { ... } }: create related with relations
  if (op.create && typeof op.create === "object") {
    return processNode(
      op.create as Record<string, unknown>,
      relatedDef,
      null,
      options,
      context,
      path,
    )
  }

  // Graph style: plain nested object { name: "John", ... }
  // Treat as a new record to create
  return processNode({ ...op }, relatedDef, null, options, context, path)
}

/**
 * Process a MorphTo (polymorphic belongsTo) relation in a graph operation.
 *
 * The user must specify which polymorphic type to create via a `type` key
 * in the operation data:
 *   { commentable: { create: { title: "..." }, type: "morph_posts" } }
 *
 * If the morphMap has only one entry, `type` is optional (auto-detected).
 */
async function processMorphTo(
  relation: Relation,
  op: Record<string, unknown>,
  options: InsertGraphOptions,
  context: GraphContext,
  path: string,
  parentColumnData?: Record<string, unknown>,
): Promise<ModelInstance | null> {
  const morphMap = relation._morphMap
  const morphType = getMorphType(relation)!
  const morphId = getMorphId(relation)!

  if (!morphMap || Object.keys(morphMap).length === 0) {
    throw new Error(
      `Cannot process MorphTo relation: no morphMap provided. ` +
        `Define a morphMap with model thunks when calling defineMorphTo().`,
    )
  }

  // Resolve type value from op.type or auto-detect if single entry
  let typeValue = op.type as string | undefined
  if (!typeValue) {
    const keys = Object.keys(morphMap)
    if (keys.length === 1) {
      typeValue = keys[0]
    }
  }
  if (!typeValue) {
    throw new Error(
      `Cannot resolve MorphTo: no type specified. ` +
        `Provide a "type" key in the relation data (e.g., { type: "${Object.keys(morphMap)[0]}" }). ` +
        `Available types: ${Object.keys(morphMap).join(", ")}`,
    )
  }

  const thunk = morphMap[typeValue]
  if (!thunk) {
    throw new Error(
      `No model registered for morph type "${typeValue}" in MorphTo. ` +
        `Available types: ${Object.keys(morphMap).join(", ")}`,
    )
  }

  const relatedDef = resolveThunk(thunk)

  // Process #dbRef / connect / create / graph-style
  let instance: ModelInstance | null = null

  if (op["#dbRef"] != null) {
    const id = op["#dbRef"]
    const existing = await relatedDef.find(id as number | string)
    if (!existing)
      throw new DatabaseError(`#dbRef ${id} not found on ${relatedDef.name}`, "UNKNOWN")
    instance = existing
  } else if (op.connect && typeof op.connect === "object") {
    const conditions = op.connect as Record<string, unknown>
    const existing = await findRelated(relatedDef, conditions)
    if (existing) {
      instance = existing
    } else {
      throw new DatabaseError(
        `Cannot connect: ${JSON.stringify(conditions)} not found on ${relatedDef.name}`,
        "UNKNOWN",
      )
    }
  } else if (op.create && typeof op.create === "object") {
    instance = await processNode(
      op.create as Record<string, unknown>,
      relatedDef,
      null,
      options,
      context,
      path,
    )
  } else {
    // Graph style: plain nested object — strip type/morph column keys before creating
    const createData = { ...op } as Record<string, unknown>
    delete createData.type
    delete createData[morphType]
    delete createData[morphId]
    instance = await processNode(createData, relatedDef, null, options, context, path)
  }

  // Set the type column on the parent record's column data
  if (instance && parentColumnData && typeValue) {
    parentColumnData[morphType] = typeValue
  }

  return instance
}

async function processHasMany(
  _instance: ModelInstance,
  relation: Relation,
  op: unknown,
  pkValue: unknown,
  options: InsertGraphOptions,
  context: GraphContext,
  path: string,
): Promise<void> {
  const relatedDef = relation.relatedModelClass
  const fk = relation.foreignKey

  // Normalize op to an array of items.
  // op can be:
  //   - Array of items (hasMany graph style): [{ title: "Post 1" }, { title: "Post 2" }]
  //   - Single object (hasOne graph style): { bio: "My bio" }
  //   - null (clear all relations for upsert)
  //   - { create: [...], connect: [...] } (operation style)
  //   - { "#dbRef": id }

  let items: Record<string, unknown>[]
  if (op == null) {
    items = []
  } else if (Array.isArray(op)) {
    items = op
  } else if (
    (op as RelationOperationShape)?.create &&
    Array.isArray((op as RelationOperationShape).create)
  ) {
    items = (op as RelationOperationShape).create as Record<string, unknown>[]
  } else if (typeof op === "object" && !("connect" in (op as RelationOperationShape))) {
    // Single object for hasOne — wrap in array
    items = [op as Record<string, unknown>]
  } else {
    items = []
  }

  for (const item of items) {
    if (item["#dbRef"] != null) {
      const id = item["#dbRef"]
      const existing = await relatedDef.find(id as number | string)
      if (!existing)
        throw new DatabaseError(`#dbRef ${id} not found on ${relatedDef.name}`, "UNKNOWN")
      existing.set(fk, pkValue)
      await existing.$save()
      continue
    }
    // Build parent FK, including type column for MorphMany/MorphOne
    const parentData: Record<string, unknown> = { [fk]: pkValue }
    if (isMorphManyRelation(relation)) {
      const typeCol = getMorphType(relation)!
      const typeVal = getMorphTypeValue(relation)
      if (typeVal !== undefined) parentData[typeCol] = typeVal
    }
    await processNode(item, relatedDef, parentData, options, context, path)
  }

  // Handle connect items
  const connectItems = !Array.isArray(op) ? ((op as RelationOperationShape)?.connect ?? []) : []
  for (const target of connectItems) {
    const targetId = await resolveTargetId(relatedDef, target)
    if (targetId != null) {
      const existing = await relatedDef.find(targetId as number | string)
      if (existing) {
        existing.set(fk, pkValue)
        await existing.$save()
      }
    }
  }
}

async function processManyToMany(
  _instance: ModelInstance,
  relation: Relation,
  op: unknown,
  pkValue: unknown,
  options: InsertGraphOptions,
  context: GraphContext,
  path: string,
): Promise<void> {
  const relatedDef = relation.relatedModelClass
  const { throughTable, foreignPivotKey, relatedPivotKey } = getPivotInfo(relation)
  const db = getDb(relatedDef)

  const items: Record<string, unknown>[] = Array.isArray(op)
    ? op
    : Array.isArray((op as RelationOperationShape)?.create)
      ? ((op as RelationOperationShape).create as Record<string, unknown>[])
      : []

  for (const item of items) {
    if (item["#dbRef"] != null) {
      const id = item["#dbRef"]
      try {
        await db
          .insertInto(throughTable)
          .values({ [foreignPivotKey]: pkValue, [relatedPivotKey]: id })
          .execute()
      } catch (e) {
        if (!isUniqueConstraintError(e)) throw normalizeError(e, throughTable)
      }
      continue
    }
    // Create the related record
    const related = await processNode(item, relatedDef, null, options, context, path)
    const relatedId = related.get(relation.localKey ?? "id")
    if (relatedId != null) {
      try {
        await db
          .insertInto(throughTable)
          .values({ [foreignPivotKey]: pkValue, [relatedPivotKey]: relatedId })
          .execute()
      } catch (e) {
        if (!isUniqueConstraintError(e)) throw normalizeError(e, throughTable)
      }
    }
  }

  // Handle connect items
  const connectItems = !Array.isArray(op) ? ((op as RelationOperationShape)?.connect ?? []) : []
  for (const target of connectItems) {
    const targetId = await resolveTargetId(relatedDef, target)
    if (targetId != null) {
      try {
        await db
          .insertInto(throughTable)
          .values({ [foreignPivotKey]: pkValue, [relatedPivotKey]: targetId })
          .execute()
      } catch (e) {
        if (!isUniqueConstraintError(e)) throw normalizeError(e, throughTable)
      }
    }
  }
}
