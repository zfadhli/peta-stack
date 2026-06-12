import { DatabaseError, RelationNotAllowedError, RelationNotFoundError } from "../errors.js"
import type { ModelDefinition, ModelInstance } from "../model/types.js"
import type { Relation } from "./base.js"

// ─── PUBLIC TYPES ──────────────────────────────────────────────

export function isRelationAllowed(relName: string, allowedSet: Set<string>): boolean {
  const parts = relName.split(".")
  for (let i = 0; i < parts.length; i++) {
    if (allowedSet.has(parts.slice(0, i + 1).join("."))) {
      return true
    }
  }
  return false
}

export interface InsertGraphOptions {
  /** Allow `#id` / `#ref` special properties in the graph */
  allowRefs?: boolean
  /**
   * If `true`, objects with an `id` property get related (pivot row / FK set)
   * instead of inserted. Can be an array of relation names to scope.
   */
  relate?: boolean | string[]
  /**
   * Whitelist of relation paths allowed for this graph operation.
   * Accepts an array of dotted paths or a Set. If not set, all relations are allowed.
   * When used via the query builder, the QB's `allowGraph()` set is forwarded automatically.
   */
  allowGraph?: string[] | Set<string>
}

export interface UpsertGraphOptions extends InsertGraphOptions {
  /** Unrelate (set FK null / remove pivot) instead of deleting missing items */
  unrelate?: boolean | string[]
  /** Prevent deletion for all or specific relation paths */
  noDelete?: boolean | string[]
  /** Prevent insertion for all or specific relation paths */
  noInsert?: boolean | string[]
  /** Prevent update for all or specific relation paths */
  noUpdate?: boolean | string[]
}

// ─── INTERNAL TYPES ────────────────────────────────────────────

interface RefEntry {
  node: Record<string, unknown>
  def: ModelDefinition
}

interface GraphContext {
  refMap: Map<string, RefEntry>
  processedRefs: Map<string, ModelInstance>
  allowRefs: boolean
  allowedGraphSet: Set<string> | undefined
}

// ─── HELPERS ───────────────────────────────────────────────────

function getPrimaryKeyColumn(def: ModelDefinition): string {
  const cols = def.columns as Record<string, any>
  for (const [name, col] of Object.entries(cols)) {
    if (col.isPrimaryKey) return name
  }
  return "id"
}

function getDb(def: ModelDefinition): any {
  if (!def._orm) throw new Error("Model not registered")
  return (def._orm as any).kysely
}

function getPivotInfo(relation: Relation): { throughTable: string; foreignPivotKey: string; relatedPivotKey: string } {
  if (relation.type !== "manyToMany" || !relation.throughTable) {
    throw new Error("Not a many-to-many relation")
  }
  return {
    throughTable: relation.throughTable,
    foreignPivotKey: relation.foreignPivotKey ?? "",
    relatedPivotKey: relation.relatedPivotKey ?? "",
  }
}

async function findRelated(
  def: ModelDefinition,
  conditions: Record<string, unknown>,
): Promise<ModelInstance | undefined> {
  return def.query().where(Object.keys(conditions)[0], "=", Object.values(conditions)[0]).executeTakeFirst()
}

async function resolveTargetId(
  def: ModelDefinition,
  target: number | string | Record<string, unknown>,
): Promise<unknown> {
  if (typeof target === "number" || typeof target === "string") {
    return target
  }
  const found = await findRelated(def, target)
  if (found) return found.get("id")
  return undefined
}

function isRelPathAllowed(relName: string, option: boolean | string[] | undefined): boolean {
  if (option === undefined || option === false) return false
  if (option === true) return true
  return option.includes(relName)
}

/**
 * Resolve allowGraph from options (supports both string[] and Set<string>).
 */
function resolveAllowGraph(options: InsertGraphOptions): Set<string> | undefined {
  if (!options.allowGraph) return undefined
  return options.allowGraph instanceof Set ? options.allowGraph : new Set(options.allowGraph)
}

/**
 * Assert that a relation path is allowed by the allowGraph set.
 * Throws RelationNotAllowedError if the path is not permitted.
 * Does nothing if allowedSet is undefined (no restriction).
 */
function assertRelationAllowed(def: ModelDefinition, fullPath: string, allowedSet: Set<string> | undefined): void {
  if (!allowedSet || allowedSet.size === 0) return
  if (!isRelationAllowed(fullPath, allowedSet)) {
    throw new RelationNotAllowedError(def.name, fullPath)
  }
}

/**
 * Build the full dotted path for a nested relation.
 * If parentPath is empty, returns just relName. Otherwise parentPath + "." + relName.
 */
function joinPath(parentPath: string, relName: string): string {
  return parentPath ? `${parentPath}.${relName}` : relName
}

// ─── MORPH (POLYMORPHIC) HELPERS ──────────────────────────────

// Sentinel key used to mark morphTo relations
const MORPH_MAP_KEY = "_morphMap"

/** Whether this relation is a MorphTo (polymorphic belongsTo) */
function isMorphToRelation(relation: Relation): boolean {
  return (relation as any)?.[MORPH_MAP_KEY] !== undefined
}

/** Whether this relation is a MorphMany or MorphOne (polymorphic hasMany/hasOne) */
function isMorphManyRelation(relation: Relation): boolean {
  return (relation as any)?._morphType !== undefined && !isMorphToRelation(relation)
}

/** Get the morph type column name (e.g. "commentableType") from a morph relation */
function getMorphType(relation: Relation): string | undefined {
  return (relation as any)?._morphType
}

/** Get the morph type value (e.g. "morph_posts") from a MorphMany/MorphOne relation */
function getMorphTypeValue(relation: Relation): string | undefined {
  return (relation as any)?._morphTypeValue
}

/** Get the morph id column name (e.g. "commentableId") from a morph relation */
function getMorphId(relation: Relation): string | undefined {
  return (relation as any)?._morphId
}

// Inlined resolveThunk to avoid circular dep via morph.ts → query/index.ts
const THUNK_CACHE = new WeakMap<object, ModelDefinition>()
function resolveThunk(thunk: () => ModelDefinition): ModelDefinition {
  let cls = THUNK_CACHE.get(thunk)
  if (!cls) {
    cls = thunk()
    THUNK_CACHE.set(thunk, cls)
  }
  return cls
}

// ─── EXTRACT RELATION DATA FROM A GRAPH NODE ──────────────────

/**
 * Splits a graph node's keys into column data and relation operations.
 * Handles both the old-style { create: ..., connect: ... } wrappers and
 * the new graph-style where nested objects/arrays represent relations directly.
 */
function extractGraphRelationData(
  def: ModelDefinition,
  node: Record<string, unknown>,
): {
  columnData: Record<string, unknown>
  relationOps: Record<string, unknown>
} {
  const columnData: Record<string, unknown> = {}
  const relationOps: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(node)) {
    // Skip internal markers
    if (key === "#id" || key === "#ref" || key === "#dbRef") continue

    if (def.relations[key]) {
      // This key is a relation name — treat the value as relation data
      relationOps[key] = value
    } else {
      columnData[key] = value
    }
  }

  return { columnData, relationOps }
}

// ─── REF COLLECTION & RESOLUTION ──────────────────────────────

function collectRefs(node: Record<string, unknown>, def: ModelDefinition, refMap: Map<string, RefEntry>): void {
  const id = node["#id"]
  if (id && typeof id === "string") {
    if (refMap.has(id)) {
      throw new Error(`Duplicate #id "${id}" in graph`)
    }
    refMap.set(id, { node, def })
  }

  for (const [key, value] of Object.entries(node)) {
    if (key === "#id" || key === "#ref" || key === "#dbRef") continue

    // Only recurse into relation keys to find nested #id markers
    if (def.relations[key]) {
      const relation = def.relations[key]
      const relatedDef = relation.relatedModelClass

      if (Array.isArray(value)) {
        for (const item of value) {
          if (item && typeof item === "object") {
            collectRefs(item as Record<string, unknown>, relatedDef, refMap)
          }
        }
      } else if (value && typeof value === "object") {
        // For belongsTo/hasOne, the object might have #id inside,
        // or it could have { create: { ... } } wrapper
        const inner = (value as Record<string, unknown>).create as Record<string, unknown> | undefined
        if (inner && typeof inner === "object") {
          collectRefs(inner, relatedDef, refMap)
        } else {
          collectRefs(value as Record<string, unknown>, relatedDef, refMap)
        }
      }
    }
  }
}

function resolveRefs(node: Record<string, unknown>, context: GraphContext): void {
  for (const [key, value] of Object.entries(node)) {
    if (key === "#id" || key === "#ref" || key === "#dbRef") continue

    if (value && typeof value === "object") {
      if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
          const item = value[i]
          if (item && typeof item === "object") {
            if ("#ref" in item) {
              const refId = (item as any)["#ref"]
              if (!context.allowRefs) {
                throw new Error(
                  `#ref is used but allowRefs option is not enabled. Set { allowRefs: true } to use #ref.`,
                )
              }
              const entry = context.refMap.get(refId)
              if (!entry) {
                throw new Error(`#ref "${refId}" not found in graph`)
              }
              value[i] = entry.node
            } else {
              resolveRefs(item as Record<string, unknown>, context)
            }
          }
        }
      } else {
        const obj = value as Record<string, unknown>
        // Handle { create: {...} } wrapper
        if (obj.create && typeof obj.create === "object") {
          resolveRefs(obj.create as Record<string, unknown>, context)
        }
        resolveRefs(obj, context)
      }
    }
  }
}

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
        throw new Error(`#ref is used but allowRefs option is not enabled. Set { allowRefs: true } to use #ref.`)
      }
      const refId = node["#ref"]
      const entry = context.refMap.get(refId)
      if (!entry) {
        throw new Error(`#ref "${refId}" not found in graph`)
      }
      nodes[i] = entry.node
    } else {
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

// ─── NODE PROCESSING (INSERT) ─────────────────────────────────

async function processNode(
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
  if (pkValue == null) throw new DatabaseError("Cannot process relations without primary key", "MISSING_ID")

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

async function processBelongsTo(
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
    if (!existing) throw new DatabaseError(`#dbRef ${id} not found on ${relatedDef.name}`, "UNKNOWN")
    return existing
  }

  // { connect: { key: value } }: find existing and relate
  if (op.connect && typeof op.connect === "object") {
    const conditions = op.connect as Record<string, unknown>
    const existing = await findRelated(relatedDef, conditions)
    if (existing) return existing
    throw new DatabaseError(`Cannot connect: ${JSON.stringify(conditions)} not found on ${relatedDef.name}`, "UNKNOWN")
  }

  // { create: { ... } }: create related with relations
  if (op.create && typeof op.create === "object") {
    return processNode(op.create as Record<string, unknown>, relatedDef, null, options, context, path)
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
  const morphMap = (relation as any)._morphMap as Record<string, () => ModelDefinition> | undefined
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
    if (!existing) throw new DatabaseError(`#dbRef ${id} not found on ${relatedDef.name}`, "UNKNOWN")
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
    instance = await processNode(op.create as Record<string, unknown>, relatedDef, null, options, context, path)
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
  } else if ((op as any)?.create && Array.isArray((op as any).create)) {
    items = (op as any).create
  } else if (typeof op === "object" && !("connect" in (op as any))) {
    // Single object for hasOne — wrap in array
    items = [op as Record<string, unknown>]
  } else {
    items = []
  }

  for (const item of items) {
    if (item["#dbRef"] != null) {
      const id = item["#dbRef"]
      const existing = await relatedDef.find(id as number | string)
      if (!existing) throw new DatabaseError(`#dbRef ${id} not found on ${relatedDef.name}`, "UNKNOWN")
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
  const connectItems = !Array.isArray(op) ? ((op as any)?.connect ?? []) : []
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

  const items: Record<string, unknown>[] = Array.isArray(op) ? op : (op as any)?.create ? (op as any).create : []

  for (const item of items) {
    if (item["#dbRef"] != null) {
      const id = item["#dbRef"]
      try {
        await db
          .insertInto(throughTable)
          .values({ [foreignPivotKey]: pkValue, [relatedPivotKey]: id })
          .execute()
      } catch {
        /* skip duplicate */
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
      } catch {
        /* skip duplicate */
      }
    }
  }

  // Handle connect items
  const connectItems = !Array.isArray(op) ? ((op as any)?.connect ?? []) : []
  for (const target of connectItems) {
    const targetId = await resolveTargetId(relatedDef, target)
    if (targetId != null) {
      try {
        await db
          .insertInto(throughTable)
          .values({ [foreignPivotKey]: pkValue, [relatedPivotKey]: targetId })
          .execute()
      } catch {
        /* skip duplicate */
      }
    }
  }
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
    const itemId = item[pkCol] ?? item["id"]

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
    const itemId = item[pkCol] ?? item["id"]

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

// ─── UTILITY ──────────────────────────────────────────────────

function relNameFromPath(path: string): string {
  const parts = path.split(".")
  return parts[parts.length - 1] ?? ""
}
