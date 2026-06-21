import {
  DatabaseError,
  isUniqueConstraintError,
  normalizeError,
  RelationNotFoundError,
} from "../errors.js"
import { getDb } from "../lib/model-helpers.js"
import type { ModelDefinition, ModelInstance } from "../model/types.js"
import type { Relation } from "./base.js"
import { findRelated, getPivotInfo, resolveTargetId } from "./helpers.js"

// ─── TYPES FOR RELATION OPERATIONS ────────────────────────────

export interface BelongsToOp {
  create?: Record<string, unknown>
  connect?: Record<string, unknown>
  connectOrCreate?: {
    where: Record<string, unknown>
    create: Record<string, unknown>
  }
  update?: Record<string, unknown>
  upsert?: {
    update: Record<string, unknown>
    create: Record<string, unknown>
  }
  delete?: boolean
  disconnect?: boolean
  set?: Record<string, unknown>
}

export interface HasManyOp {
  create?: Record<string, unknown>[]
  connect?: (number | string | Record<string, unknown>)[]
  set?: (number | string | Record<string, unknown>)[]
  delete?: Record<string, unknown> | Record<string, unknown>[]
  update?: {
    where: Record<string, unknown> | Record<string, unknown>[]
    data: Record<string, unknown>
  }
}

export interface ManyToManyOp {
  create?: Record<string, unknown>[]
  connect?: (number | string | Record<string, unknown>)[]
  disconnect?: Record<string, unknown> | Record<string, unknown>[]
  set?: (number | string | Record<string, unknown>)[]
  add?: (number | string | Record<string, unknown>)[]
}

export type RelationData = BelongsToOp | HasManyOp | ManyToManyOp

// ─── DETECT RELATION KEYS IN DATA ─────────────────────────────

export function extractRelationData(
  def: ModelDefinition,
  data: Record<string, unknown>,
): { columnData: Record<string, unknown>; relationOps: Record<string, RelationData> } {
  const columnData: Record<string, unknown> = {}
  const relationOps: Record<string, RelationData> = {}

  for (const [key, value] of Object.entries(data)) {
    if (
      def.relations[key] &&
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value)
    ) {
      // belongsTo/hasOne style: { create: {}, connect: {} }
      relationOps[key] = value as unknown as RelationData
    } else if (def.relations[key] && Array.isArray(value)) {
      // hasMany style: [{ create: ... }, { connect: ... }] or flat array for connect
      relationOps[key] = { connect: value } as ManyToManyOp
    } else if (
      def.relations[key] &&
      typeof value === "object" &&
      value !== null &&
      "create" in (value as any)
    ) {
      // hasMany/manyToMany style: { create: [...], connect: [...] }
      relationOps[key] = value as unknown as RelationData
    } else {
      columnData[key] = value
    }
  }

  return { columnData, relationOps }
}

// ─── PROCESS RELATIONS ON CREATE ──────────────────────────────

/**
 * Process relation operations after the parent model has been created.
 * For belongsTo, the related model must be created FIRST, then its ID
 * is set on the parent. For hasMany/hasOne/manyToMany, the parent
 * is created first, then children are created with the parent's FK.
 *
 * This function handles the post-creation phase.
 */
export async function processCreateRelations(
  def: ModelDefinition,
  instance: ModelInstance,
  relationOps: Record<string, RelationData>,
): Promise<void> {
  for (const [relName, op] of Object.entries(relationOps)) {
    const relation = def.relations[relName]
    if (!relation) throw new RelationNotFoundError(def.name, relName)
    const _relatedDef = relation.relatedModelClass
    const pkValue = instance.get(relation.localKey)
    if (pkValue == null)
      throw new DatabaseError("Cannot create relations without primary key", "MISSING_ID")

    if (relation.type === "belongsTo") {
      await processBelongsToCreate(instance, relation, op as BelongsToOp, pkValue)
    } else if (relation.type === "hasOne") {
      await processHasManyCreate(instance, relation, op as HasManyOp, pkValue)
    } else if (relation.type === "hasMany") {
      await processHasManyCreate(instance, relation, op as HasManyOp, pkValue)
    } else if (relation.type === "manyToMany") {
      await processManyToManyCreate(instance, relation, op as ManyToManyOp, pkValue)
    }
  }
}

async function processBelongsToCreate(
  instance: ModelInstance,
  relation: Relation,
  op: BelongsToOp,
  _pkValue: unknown,
): Promise<void> {
  const relatedDef = relation.relatedModelClass
  let relatedId: unknown = instance.get(relation.foreignKey)

  if (op.create) {
    const related = await relatedDef.insert(op.create)
    relatedId = related.get(relation.localKey)
  } else if (op.connect) {
    const related = await findRelated(relatedDef, op.connect)
    if (related) relatedId = related.get(relation.localKey)
  } else if (op.connectOrCreate) {
    const existing = await findRelated(relatedDef, op.connectOrCreate.where)
    if (existing) {
      relatedId = existing.get(relation.localKey)
    } else {
      const created = await relatedDef.insert(op.connectOrCreate.create)
      relatedId = created.get(relation.localKey)
    }
  }

  if (relatedId !== undefined) {
    const db = getDb(relatedDef)
    await db
      .updateTable(relatedDef.table)
      .set({ [relation.foreignKey]: relatedId })
      .where(relation.localKey, "=", _pkValue)
      .execute()
  }
}

async function processHasManyCreate(
  _instance: ModelInstance,
  relation: Relation,
  op: HasManyOp,
  pkValue: unknown,
): Promise<void> {
  const relatedDef = relation.relatedModelClass
  const fk = relation.foreignKey

  if (op.create) {
    for (const data of op.create) {
      await relatedDef.insert({ ...data, [fk]: pkValue })
    }
  }
}

async function processManyToManyCreate(
  _instance: ModelInstance,
  relation: Relation,
  op: ManyToManyOp,
  pkValue: unknown,
): Promise<void> {
  const relatedDef = relation.relatedModelClass
  const { throughTable, foreignPivotKey, relatedPivotKey } = getPivotInfo(relation)
  const db = getDb(relatedDef)

  if (op.create) {
    for (const data of op.create) {
      const related = await relatedDef.insert(data)
      const relatedId = related.get(relation.localKey ?? "id")
      await db
        .insertInto(throughTable)
        .values({ [foreignPivotKey]: pkValue, [relatedPivotKey]: relatedId })
        .execute()
    }
  }

  if (op.connect) {
    for (const target of op.connect) {
      const relatedId = await resolveTargetId(relatedDef, target)
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
  }
}
