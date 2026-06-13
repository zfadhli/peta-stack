import { sql } from "kysely"
import type { Column } from "../columns/column.js"
import { RelationNotFoundError } from "../errors.js"
import type { Database } from "../lib/kysely.js"
import type { ModelDefinition, ModelInstance } from "../model/types.js"
import type { QueryBuilder } from "../query/index.js"
import { createQueryBuilder } from "../query/index.js"

export interface RelationQuery extends QueryBuilder {
  /** Attach related model(s) for many-to-many relations. */
  attach(ids: number | number[] | string | string[], pivotData?: Record<string, unknown>): Promise<void>

  /** Detach related model(s) for many-to-many relations. */
  detach(ids?: number | number[] | string | string[]): Promise<void>

  /** Sync related models: attaches new IDs, detaches missing ones. */
  sync(ids: (number | string)[] | Record<number | string, Record<string, unknown>>): Promise<void>

  /** Sync without detaching existing IDs. */
  syncWithoutDetaching(ids: (number | string)[]): Promise<void>

  /** Update pivot data for a specific related model. */
  updateExistingPivot(id: number | string, data: Record<string, unknown>): Promise<void>
}

/**
 * Create a RelationQuery — a QueryBuilder scoped to a relation, with
 * additional methods for managing many-to-many pivot tables.
 */
export function createRelationQuery(
  instance: ModelInstance,
  def: ModelDefinition,
  relationName: string,
): RelationQuery {
  const relation = def.relations[relationName]
  if (!relation) throw new RelationNotFoundError(def.name, relationName)

  const relatedDef = relation.relatedModelClass
  const qb = createQueryBuilder(relatedDef)

  // Apply the relation's WHERE constraint based on relation type
  if (relation.type === "belongsTo") {
    // FK is on THIS model; query related WHERE related.localKey = this.foreignKey
    const fkValue = instance.get(relation.foreignKey)
    if (fkValue != null) {
      qb.where(relation.localKey, "=", fkValue)
    } else {
      qb.where(relation.localKey, "=", -1)
    }
  } else if (relation.type === "manyToMany") {
    // Direct subquery on the Kysely builder: WHERE pk IN (SELECT rpk FROM pivot WHERE fpk = parent.pk)
    const pkValue = instance.get(relation.localKey)
    if (pkValue != null && relation.throughTable && relation.foreignPivotKey && relation.relatedPivotKey) {
      const relatedPk =
        Object.keys(relatedDef.columns).find((k) => (relatedDef.columns as Record<string, Column>)[k]?.isPrimaryKey) ??
        "id"
      const t = relation.throughTable
      const rpk = relation.relatedPivotKey
      const fpk = relation.foreignPivotKey
      // Replace the internal Kysely builder with one that has the subquery WHERE
      const kyselyQb = qb._getKyselyQb()
      const newQb = kyselyQb.where(
        sql`${sql.id(relatedPk)} IN (SELECT ${sql.id(rpk)} FROM ${sql.id(t)} WHERE ${sql.id(fpk)} = ${pkValue})`,
      )
      qb._replaceKyselyQb(newQb)
    } else {
      qb.where(relation.localKey, "=", -1)
    }
  } else {
    // hasMany/hasOne: FK is on related model; query WHERE related.foreignKey = this.localKey
    const fkValue = instance.get(relation.localKey)
    if (fkValue != null) {
      qb.where(relation.foreignKey, "=", fkValue)
    } else {
      qb.where(relation.foreignKey, "=", -1)
    }
  }

  const rqb: RelationQuery = Object.create(qb) as RelationQuery

  // Delegate all QueryBuilder methods to the underlying qb
  for (const key of Object.keys(qb) as (keyof QueryBuilder)[]) {
    if (typeof qb[key] === "function") {
      const fn = qb[key] as Function
      ;(rqb as unknown as Record<string, unknown>)[key] = (...args: unknown[]) => {
        const result = fn.apply(qb, args)
        // If it returns a QueryBuilder, return the RelationQuery wrapper
        return result === qb ? rqb : result
      }
    }
  }

  // ─── Many-to-many pivot methods ──────────────────────────
  const pivotRelation = relation
  function getPivotInfo(): { throughTable: string; foreignPivotKey: string; relatedPivotKey: string } {
    if (pivotRelation.type !== "manyToMany" || !pivotRelation.throughTable) {
      throw new Error(`attach/detach/sync are only available on manyToMany relations, got "${pivotRelation.type}"`)
    }
    return {
      throughTable: pivotRelation.throughTable,
      foreignPivotKey: pivotRelation.foreignPivotKey ?? "",
      relatedPivotKey: pivotRelation.relatedPivotKey ?? "",
    }
  }

  rqb.attach = async (ids, pivotData) => {
    const { throughTable, foreignPivotKey, relatedPivotKey } = getPivotInfo()
    const pkValue = instance.get(relation.localKey)
    if (pkValue == null) return

    const idsArr = Array.isArray(ids) ? ids : [ids]
    const _db = relatedDef._orm?.kysely
    if (!_db) throw new Error("Model not registered")
    const qdb = _db as any

    for (const id of idsArr) {
      const row: Record<string, unknown> = {
        [foreignPivotKey]: pkValue,
        [relatedPivotKey]: id,
        ...pivotData,
      }
      try {
        await qdb.insertInto(throughTable).values(row).execute()
      } catch (e: unknown) {
        // Skip if already attached (unique constraint) — dialect-agnostic
        const err = e as { code?: string; errno?: number }
        const isDuplicate =
          err.code === "SQLITE_CONSTRAINT_UNIQUE" ||
          err.code === "SQLITE_CONSTRAINT" ||
          err.code === "23505" || // PostgreSQL
          err.code === "ER_DUP_ENTRY" || // MySQL
          err.errno === 1062 // MySQL (numeric)
        if (!isDuplicate) throw e
      }
    }
  }

  rqb.detach = async (ids) => {
    const { throughTable, foreignPivotKey, relatedPivotKey } = getPivotInfo()
    const pkValue = instance.get(relation.localKey)
    if (pkValue == null) return

    const _db = relatedDef._orm?.kysely
    if (!_db) throw new Error("Model not registered")
    const qdb = _db as any

    let query: any = qdb.deleteFrom(throughTable).where(foreignPivotKey, "=", pkValue)
    if (ids !== undefined) {
      const idsArr = Array.isArray(ids) ? ids : [ids]
      query = query.where(relatedPivotKey, "in", idsArr)
    }
    await query.execute()
  }

  rqb.sync = async (ids) => {
    const { throughTable, foreignPivotKey, relatedPivotKey } = getPivotInfo()
    const pkValue = instance.get(relation.localKey)
    if (pkValue == null) return

    const _db = relatedDef._orm?.kysely
    if (!_db) throw new Error("Model not registered")
    const qdb = _db as any

    const desiredIds = Array.isArray(ids) ? ids : Object.keys(ids).map(Number)

    // Get current IDs
    const currentRows = await qdb
      .selectFrom(throughTable)
      .select(relatedPivotKey)
      .where(foreignPivotKey, "=", pkValue)
      .execute()

    const currentIds = new Set<unknown>(currentRows.map((r: Record<string, unknown>) => r[relatedPivotKey]))

    // IDs to attach (in desired but not current)
    const toAttach = desiredIds.filter((id) => !currentIds.has(id))
    // IDs to detach (in current but not desired)
    const toDetach = [...currentIds].filter(
      (id): id is string | number => (typeof id === "string" || typeof id === "number") && !desiredIds.includes(id),
    )

    // Run operations
    const ops: Promise<any>[] = []

    if (toDetach.length > 0) {
      ops.push(
        qdb
          .deleteFrom(throughTable)
          .where(foreignPivotKey, "=", pkValue)
          .where(relatedPivotKey, "in", toDetach)
          .execute(),
      )
    }

    for (const id of toAttach) {
      const pivotRow: Record<string, unknown> = {
        [foreignPivotKey]: pkValue,
        [relatedPivotKey]: id,
      }
      // If ids is an object with pivot data
      if (!Array.isArray(ids) && typeof ids === "object") {
        const entry = (ids as Record<string, Record<string, unknown>>)[String(id)]
        if (entry) Object.assign(pivotRow, entry)
      }
      ops.push(qdb.insertInto(throughTable).values(pivotRow).execute())
    }

    await Promise.all(ops)
  }

  rqb.syncWithoutDetaching = async (ids) => {
    const { throughTable, foreignPivotKey, relatedPivotKey } = getPivotInfo()
    const pkValue = instance.get(relation.localKey)
    if (pkValue == null) return

    const _db = relatedDef._orm?.kysely
    if (!_db) throw new Error("Model not registered")
    const qdb = _db as any

    const idsArr = Array.isArray(ids) ? ids : [ids]

    for (const id of idsArr) {
      const row: Record<string, unknown> = {
        [foreignPivotKey]: pkValue,
        [relatedPivotKey]: id,
      }
      try {
        await qdb.insertInto(throughTable).values(row).execute()
      } catch (e: unknown) {
        // Skip if already attached (unique constraint) — dialect-agnostic
        const err = e as { code?: string; errno?: number }
        const isDuplicate =
          err.code === "SQLITE_CONSTRAINT_UNIQUE" ||
          err.code === "SQLITE_CONSTRAINT" ||
          err.code === "23505" || // PostgreSQL
          err.code === "ER_DUP_ENTRY" || // MySQL
          err.errno === 1062 // MySQL (numeric)
        if (!isDuplicate) throw e
      }
    }
  }

  rqb.updateExistingPivot = async (id, data) => {
    const { throughTable, foreignPivotKey, relatedPivotKey } = getPivotInfo()
    const pkValue = instance.get(relation.localKey)
    if (pkValue == null) return

    const _db = relatedDef._orm?.kysely
    if (!_db) throw new Error("Model not registered")
    const qdb = _db as any

    await qdb
      .updateTable(throughTable)
      .set(data)
      .where(foreignPivotKey, "=", pkValue)
      .where(relatedPivotKey, "=", id)
      .execute()
  }

  return rqb
}
