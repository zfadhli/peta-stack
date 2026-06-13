import { sql as kyselySql } from "kysely"
import { ModelNotFoundError, RelationNotAllowedError, RelationNotFoundError } from "../errors.js"
import type { ModelDefinition, ModelInstance } from "../model/types.js"
import type { Column } from "../columns/column.js"
import { type EagerLoad, EagerLoader } from "../relations/eager.js"
import type { InsertGraphOptions, UpsertGraphOptions } from "../relations/graph/index.js"
import { isRelationAllowed } from "../relations/graph/index.js"
import type { QueryBuilder } from "./types.js"

// Helper to create raw SQL expressions compatible with Kysely 0.27
function rawSql(str: string): ReturnType<typeof kyselySql> {
  return kyselySql([str] as unknown as TemplateStringsArray)
}

/** Minimal Kysely ExpressionBuilder interface for aggregate selections. */
interface AggregateEB {
  fn: {
    countAll(): { as(alias: string): Record<string, unknown> }
    sum(column: string): { as(alias: string): Record<string, unknown> }
    avg(column: string): { as(alias: string): Record<string, unknown> }
    min(column: string): { as(alias: string): Record<string, unknown> }
    max(column: string): { as(alias: string): Record<string, unknown> }
  }
}

/** Minimal Kysely JoinBuilder interface. */
interface JoinBuilder {
  onRef(lhs: string, op: string, rhs: string): void
}

/** Shape of rows returned before bulk delete — we only need `any[]` semantics. */
type DeletedRows = ModelInstance[]

const SAFE_COLUMN = /^[a-zA-Z_*][a-zA-Z0-9_.*]*$/

// ─── CREATE QUERY BUILDER ────────────────────────────────
export function createQueryBuilder(def: ModelDefinition, peta?: { kysely: import("../lib/kysely.js").Database }): QueryBuilder {
  const db: any = peta?.kysely ?? def._orm?.kysely
  if (!db) throw new Error("Model not registered with an ORM instance")

  let qb: any = db.selectFrom(def.table)
  let hasAll = false
  const eagerLoads: EagerLoad[] = []
  let withTrashed = false
  let onlyTrashedMode = false
  const omitScopes = new Set<string>()
  let scopesApplied = false
  let _hasWhere = false
  let hasEffectiveWhere = false
  let selectedColumns: string[] | null = null
  const aggregateColumns: string[] = []

  // Store for aggregate tracking
  const aggregateAliases: string[] = []

  // Store WHERE operations for replay on update/delete builders
  const whereOps: Array<(qb: any) => void> = []

  // Allow graph security — if non-null, only these relation names are allowed
  let allowedGraphSet: Set<string> | null = null

  function validateColumn(ref: string): string {
    if (!SAFE_COLUMN.test(ref)) throw new Error(`Invalid column reference: ${ref}`)
    return ref
  }

  function applyScopes(): void {
    if (scopesApplied) return
    scopesApplied = true

    const scopes = def.getGlobalScopes?.()
    if (scopes) {
      for (const [name, fn] of scopes) {
        if (!omitScopes.has(name)) fn(self)
      }
    }
    const cols = def.columns as Record<string, Column>
    const hasDeletedColumn =
      "deletedAt" in cols || Object.values(cols).some((c) => c.dataType === "timestamp" && c.isNullable)
    if (hasDeletedColumn) {
      if (onlyTrashedMode) {
        qb = qb.where("deletedAt", "is not", null)
      } else if (!withTrashed) {
        qb = qb.where("deletedAt", "is", null)
      }
    }
  }

  function assertWhereForMutation(): void {
    if (!hasEffectiveWhere && !hasAll) {
      throw new Error(
        `Mutation requires an explicit WHERE condition or .all(). ` +
          `Use .all() to target all rows, or add a WHERE clause.`,
      )
    }
  }
  async function runExecute(): Promise<ModelInstance[]> {
    applyScopes()
    const queryBuilder = selectedColumns ? qb.select(selectedColumns.map(validateColumn)) : qb.selectAll()

    // Apply aggregate subqueries (additive selects)
    let currentQb = queryBuilder
    for (let i = 0; i < aggregateColumns.length; i++) {
      // Kysely 0.27: `select` is additive when called multiple times
      const col = aggregateColumns[i]
      if (col) currentQb = currentQb.select(kyselySql([col] as unknown as TemplateStringsArray))
    }

    const rows = (await currentQb.execute()) as Record<string, unknown>[]
    const models = rows.map((row) => def.hydrate(row))

    // Apply computed columns
    if (models.length > 0) {
      const { getComputedConfig, applyComputedColumnsAsync } = await import("../model/computed.js")
      const computedConfig = getComputedConfig(def)
      if (computedConfig) {
        await applyComputedColumnsAsync(models, computedConfig, selectedColumns)
      }
    }

    if (eagerLoads.length > 0) {
      const loader = new EagerLoader()
      for (const el of eagerLoads) {
        await loader.loadRelated(models, el, def)
      }
    }

    return models
  }
  const self: QueryBuilder = {
    // ─── PromiseLike ──────────────────────────────────────
    // biome-ignore lint/suspicious/noThenProperty: Intentional thenable for await support
    then<TResult1 = ModelInstance[], TResult2 = never>(
      onfulfilled?: ((value: ModelInstance[]) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
    ): PromiseLike<TResult1 | TResult2> {
      return runExecute().then(onfulfilled, onrejected)
    },

    // ─── Execution ────────────────────────────────────────
    execute: runExecute,

    async collect() {
      const items = await runExecute()
      const { createCollection } = await import("../collection/index.js")
      return createCollection(items)
    },

    async executeTakeFirst() {
      const items = await self.limit(1).execute()
      return items[0]
    },

    async executeTakeFirstOrThrow() {
      const item = await self.executeTakeFirst()
      if (!item) throw new ModelNotFoundError(def.name, "query")
      return item
    },

    async find(id) {
      return self.where("id", "=", id).executeTakeFirst()
    },

    async findOrFail(id) {
      const item = await self.find(id)
      if (!item) throw new ModelNotFoundError(def.name, id)
      return item
    },

    async first() {
      return self.limit(1).executeTakeFirst()
    },

    toSQL(): { sql: string; parameters: readonly unknown[] } {
      applyScopes()
      const compiled = qb.selectAll().compile()
      return { sql: compiled.sql, parameters: compiled.parameters }
    },

    // ─── Aggregates ───────────────────────────────────────
    async count() {
      applyScopes()
      const result = await qb.select((eb: AggregateEB) => eb.fn.countAll().as("count")).executeTakeFirst()
      return Number((result as { count: number })?.count ?? 0)
    },

    async sum(column: string) {
      applyScopes()
      const result = await qb.select((eb: AggregateEB) => eb.fn.sum(validateColumn(column)).as("sum")).executeTakeFirst()
      return Number((result as { sum: number })?.sum ?? 0)
    },

    async avg(column: string) {
      applyScopes()
      const result = await qb.select((eb: AggregateEB) => eb.fn.avg(validateColumn(column)).as("avg")).executeTakeFirst()
      return Number((result as { avg: number })?.avg ?? 0)
    },

    async min(column: string) {
      applyScopes()
      const result = await qb.select((eb: AggregateEB) => eb.fn.min(validateColumn(column)).as("min")).executeTakeFirst()
      return Number((result as { min: number })?.min ?? 0)
    },

    async max(column: string) {
      applyScopes()
      const result = await qb.select((eb: AggregateEB) => eb.fn.max(validateColumn(column)).as("max")).executeTakeFirst()
      return Number((result as { max: number })?.max ?? 0)
    },

    // ─── Aggregate subqueries (withCount, etc.) ─────────────
    withCount(relation: string): QueryBuilder {
      const alias = `${relation}_count`
      const rel = def.relations[relation]
      if (!rel) throw new RelationNotFoundError(def.name, relation)
      const relatedTable = rel.relatedModelClass.table
      const fk = rel.foreignKey
      const lk = rel.localKey

      aggregateColumns.push(
        `(SELECT COUNT(*) FROM ${relatedTable} WHERE ${relatedTable}.${fk} = ${def.table}.${lk}) as ${alias}`,
      )
      aggregateAliases.push(alias)
      return self
    },

    withSum(relation: string, column: string): QueryBuilder {
      const alias = `${relation}_sum_${column}`
      const rel = def.relations[relation]
      if (!rel) throw new RelationNotFoundError(def.name, relation)
      const relatedTable = rel.relatedModelClass.table
      const fk = rel.foreignKey
      const lk = rel.localKey
      aggregateColumns.push(
        `(SELECT COALESCE(SUM(${relatedTable}.${validateColumn(column)}), 0) FROM ${relatedTable} WHERE ${relatedTable}.${fk} = ${def.table}.${lk}) as ${alias}`,
      )
      aggregateAliases.push(alias)
      return self
    },

    withAvg(relation: string, column: string): QueryBuilder {
      const alias = `${relation}_avg_${column}`
      const rel = def.relations[relation]
      if (!rel) throw new RelationNotFoundError(def.name, relation)
      const relatedTable = rel.relatedModelClass.table
      const fk = rel.foreignKey
      const lk = rel.localKey
      aggregateColumns.push(
        `(SELECT AVG(${relatedTable}.${validateColumn(column)}) FROM ${relatedTable} WHERE ${relatedTable}.${fk} = ${def.table}.${lk}) as ${alias}`,
      )
      aggregateAliases.push(alias)
      return self
    },

    withMin(relation: string, column: string): QueryBuilder {
      const alias = `${relation}_min_${column}`
      const rel = def.relations[relation]
      if (!rel) throw new RelationNotFoundError(def.name, relation)
      const relatedTable = rel.relatedModelClass.table
      const fk = rel.foreignKey
      const lk = rel.localKey
      aggregateColumns.push(
        `(SELECT MIN(${relatedTable}.${validateColumn(column)}) FROM ${relatedTable} WHERE ${relatedTable}.${fk} = ${def.table}.${lk}) as ${alias}`,
      )
      aggregateAliases.push(alias)
      return self
    },

    withMax(relation: string, column: string): QueryBuilder {
      const alias = `${relation}_max_${column}`
      const rel = def.relations[relation]
      if (!rel) throw new RelationNotFoundError(def.name, relation)
      const relatedTable = rel.relatedModelClass.table
      const fk = rel.foreignKey
      const lk = rel.localKey
      aggregateColumns.push(
        `(SELECT MAX(${relatedTable}.${validateColumn(column)}) FROM ${relatedTable} WHERE ${relatedTable}.${fk} = ${def.table}.${lk}) as ${alias}`,
      )
      aggregateAliases.push(alias)
      return self
    },

    withExists(relation: string): QueryBuilder {
      const alias = `${relation}_exists`
      const rel = def.relations[relation]
      if (!rel) throw new RelationNotFoundError(def.name, relation)
      const relatedTable = rel.relatedModelClass.table
      const fk = rel.foreignKey
      const lk = rel.localKey
      aggregateColumns.push(
        `(SELECT EXISTS(SELECT 1 FROM ${relatedTable} WHERE ${relatedTable}.${fk} = ${def.table}.${lk})) as ${alias}`,
      )
      aggregateAliases.push(alias)
      return self
    },

    // ─── Chunking ─────────────────────────────────────────
    async chunk(size: number, callback: (chunk: ModelInstance[]) => Promise<void>): Promise<void> {
      let offset = 0
      let hasMore = true

      while (hasMore) {
        const items = await self.limit(size).offset(offset).execute()
        if (items.length === 0) {
          hasMore = false
        } else {
          await callback(items)
          offset += items.length
          hasMore = items.length >= size
        }
      }
    },

    async paginate(page: number, perPage = 20) {
      const safePage = Math.max(1, page)
      const safePerPage = Math.min(Math.max(1, perPage), 1000)

      applyScopes()

      // Count total
      const countResult = await qb.select((eb: AggregateEB) => eb.fn.countAll().as("total")).executeTakeFirst()
      const total = Number((countResult as { total: number })?.total ?? 0)

      // Fetch page
      const items = await self
        .limit(safePerPage)
        .offset((safePage - 1) * safePerPage)
        .execute()

      const { createPaginator } = await import("../pagination/index.js")
      return createPaginator(items, total, safePerPage, safePage)
    },

    // ─── Eager loading ────────────────────────────────────
    allowGraph(...expressions: string[]): QueryBuilder {
      const paths = new Set<string>()
      for (const expr of expressions) {
        const parts = expr
          .replace(/[[\]']/g, "")
          .split(/[\s,]+/)
          .filter(Boolean)
        for (const part of parts) {
          // Preserve dotted paths — DO NOT split on '.'
          paths.add(part)
        }
      }
      allowedGraphSet = paths
      return self
    },

    with(...relations: (string | Record<string, (qb: QueryBuilder) => void>)[]): QueryBuilder {
      for (const rel of relations) {
        if (typeof rel === "string") {
          // Validate against allowGraph if set — recursive prefix check
          if (allowedGraphSet && !isRelationAllowed(rel, allowedGraphSet)) {
            throw new RelationNotAllowedError(def.name, rel)
          }
          eagerLoads.push({ name: rel })
        } else {
          for (const [name, constraints] of Object.entries(rel)) {
            // Object keys are single-level (no dots), so direct prefix check is sufficient
            if (allowedGraphSet && !isRelationAllowed(name, allowedGraphSet)) {
              throw new RelationNotAllowedError(def.name, name)
            }
            eagerLoads.push({ name, constraints })
          }
        }
      }
      return self
    },

    // ─── Graph operations ──────────────────────────────────
    async insertGraph(data: Record<string, unknown> | Record<string, unknown>[], options?: InsertGraphOptions): Promise<any> {
      const { insertGraph: doInsertGraph } = await import("../relations/graph/index.js")
      return doInsertGraph(def, data, {
        ...options,
        allowGraph: allowedGraphSet ? [...allowedGraphSet] : options?.allowGraph,
      })
    },

    async upsertGraph(data: Record<string, unknown> | Record<string, unknown>[], options?: UpsertGraphOptions): Promise<any> {
      const { upsertGraph: doUpsertGraph } = await import("../relations/graph/index.js")
      return doUpsertGraph(def, data, {
        ...options,
        allowGraph: allowedGraphSet ? [...allowedGraphSet] : options?.allowGraph,
      })
    },

    // ─── Bulk CRUD ────────────────────────────────────────
    async updateMany(data: Record<string, unknown>): Promise<number> {
      applyScopes()
      assertWhereForMutation()

      // Check for static beforeUpdate hooks
      const { hasStaticHooks, getStaticHooks } = await import("../hooks/static.js")
      if (hasStaticHooks(def, "beforeUpdate")) {
        const hooks = getStaticHooks(def, "beforeUpdate")
        let cancelled = false
        let cancelResult: unknown

        const asFindQuery = () => {
          const selectQb = createQueryBuilder(def)
          for (const op of whereOps) {
            op(selectQb)
          }
          return selectQb
        }

        const cancelQuery = (result: unknown) => {
          cancelled = true
          cancelResult = result
        }

        for (const hook of hooks) {
          await hook({ asFindQuery, cancelQuery, inputItems: [data] })
        }

        if (cancelled) return cancelResult as number
      }

      // Build an UPDATE query and replay WHERE conditions
      let updateQb: any = db.updateTable(def.table).set(data)
      for (const op of whereOps) {
        updateQb = op(updateQb)
      }

      try {
        const result = await updateQb.execute()
        return Number(result.numUpdatedRows ?? 0)
      } catch (e: any) {
        const { normalizeError } = await import("../errors.js")
        throw normalizeError(e, def.table)
      }
    },

    async deleteMany(): Promise<number> {
      applyScopes()
      assertWhereForMutation()

      const { hasStaticHooks, getStaticHooks } = await import("../hooks/static.js")

      // Handle beforeDelete and afterDelete hooks
      const hasBefore = hasStaticHooks(def, "beforeDelete")
      const hasAfter = hasStaticHooks(def, "afterDelete")

      if (hasBefore) {
        const hooks = getStaticHooks(def, "beforeDelete")
        let cancelled = false
        let cancelResult: unknown

        const asFindQuery = () => {
          const selectQb = createQueryBuilder(def)
          for (const op of whereOps) op(selectQb)
          return selectQb
        }
        const cancelQuery = (result: unknown) => {
          cancelled = true
          cancelResult = result
        }

        for (const hook of hooks) {
          await hook({ asFindQuery, cancelQuery, inputItems: undefined })
        }
        if (cancelled) return cancelResult as number
      }

      // For afterDelete hooks, capture the rows BEFORE deleting
      let deletedRows: DeletedRows = []
      if (hasAfter) {
        const previewQb = createQueryBuilder(def)
        for (const op of whereOps) op(previewQb)
        deletedRows = await previewQb.execute()
      }

      // Build a DELETE query and replay WHERE conditions
      let deleteQb: any = db.deleteFrom(def.table)
      for (const op of whereOps) {
        deleteQb = op(deleteQb)
      }

      let numDeleted = 0
      try {
        const result = await deleteQb.execute()
        numDeleted = Number(result.numDeletedRows ?? 0)
      } catch (e: any) {
        const { normalizeError } = await import("../errors.js")
        throw normalizeError(e, def.table)
      }

      // Run afterDelete hooks with captured rows
      if (hasAfter && deletedRows.length > 0) {
        const hooks = getStaticHooks(def, "afterDelete")
        const afterAsFindQuery = () => {
          const selectQb = createQueryBuilder(def)
          for (const op of whereOps) op(selectQb)
          return selectQb
        }
        for (const hook of hooks) {
          await hook({ asFindQuery: afterAsFindQuery, cancelQuery: () => {}, inputItems: undefined })
        }
      }

      return numDeleted
    },

    // ─── Soft deletes ─────────────────────────────────────
    withTrashed(): QueryBuilder {
      withTrashed = true
      return self
    },

    onlyTrashed(): QueryBuilder {
      onlyTrashedMode = true
      withTrashed = false
      return self
    },

    // ─── Where conditions ────────────────────────────────
    whereIn(column: string, values: unknown[]): QueryBuilder {
      qb = qb.where(validateColumn(column), "in", values)
      whereOps.push((q) => q.where(validateColumn(column), "in", values))
      _hasWhere = true
      hasEffectiveWhere = values.length > 0
      return self
    },

    whereInPivot(column: string, values: unknown[]): QueryBuilder {
      qb = qb.where(validateColumn(column), "in", values)
      whereOps.push((q) => q.where(validateColumn(column), "in", values))
      _hasWhere = true
      hasEffectiveWhere = values.length > 0
      return self
    },

    has(relationName: string): QueryBuilder {
      const rel = def.relations[relationName]
      if (!rel) throw new RelationNotFoundError(def.name, relationName)
      const relatedTable = rel.relatedModelClass.table
      const fk = rel.foreignKey
      const lk = rel.localKey

      const existsExpr = rawSql(
        `EXISTS (SELECT 1 FROM ${relatedTable} WHERE ${relatedTable}.${fk} = ${def.table}.${lk})`,
      )
      qb = qb.where(existsExpr)
      _hasWhere = true
      hasEffectiveWhere = true
      return self
    },

    whereHas(relationName: string, _callback?: (qb: QueryBuilder) => void): QueryBuilder {
      return self.has(relationName)
    },

    whereDoesntHave(relationName: string, _callback?: (qb: QueryBuilder) => void): QueryBuilder {
      const rel = def.relations[relationName]
      if (!rel) throw new RelationNotFoundError(def.name, relationName)
      const relatedTable = rel.relatedModelClass.table
      const fk = rel.foreignKey
      const lk = rel.localKey

      const notExistsExpr = rawSql(
        `NOT EXISTS (SELECT 1 FROM ${relatedTable} WHERE ${relatedTable}.${fk} = ${def.table}.${lk})`,
      )
      qb = qb.where(notExistsExpr)
      _hasWhere = true
      hasEffectiveWhere = true
      return self
    },

    where(column: string, operator: unknown, value?: unknown): QueryBuilder {
      if (value === undefined) {
        qb = qb.where(validateColumn(column), "=", operator)
        whereOps.push((q) => q.where(validateColumn(column), "=", operator))
        hasEffectiveWhere = true
      } else {
        qb = qb.where(validateColumn(column), operator as string, value)
        whereOps.push((q) => q.where(validateColumn(column), operator as string, value))
        hasEffectiveWhere = true
      }
      _hasWhere = true
      return self
    },

    whereRef(col1: string, operator: string, col2: string): QueryBuilder {
      qb = qb.whereRef(validateColumn(col1), operator, validateColumn(col2))
      whereOps.push((q) => q.whereRef(validateColumn(col1), operator, validateColumn(col2)))
      _hasWhere = true
      hasEffectiveWhere = true
      return self
    },

    orWhere(column: string, operator: unknown, value?: unknown): QueryBuilder {
      if (value === undefined) {
        qb = qb.orWhere(validateColumn(column), "=", operator)
        whereOps.push((q) => q.orWhere(validateColumn(column), "=", operator))
      } else {
        qb = qb.orWhere(validateColumn(column), operator as string, value)
        whereOps.push((q) => q.orWhere(validateColumn(column), operator as string, value))
      }
      _hasWhere = true
      hasEffectiveWhere = true
      return self
    },

    // ─── Ordering ─────────────────────────────────────────
    orderBy(column: string, direction: "asc" | "desc" = "asc"): QueryBuilder {
      qb = qb.orderBy(validateColumn(column), direction)
      return self
    },

    // ─── Limit/offset ─────────────────────────────────────
    limit(n: number): QueryBuilder {
      qb = qb.limit(n)
      return self
    },

    offset(n: number): QueryBuilder {
      qb = qb.offset(n)
      return self
    },

    // ─── Select ───────────────────────────────────────────
    select(...columns: string[]): QueryBuilder {
      selectedColumns = columns
      return self
    },

    selectAll(_table?: string): QueryBuilder {
      selectedColumns = null
      return self
    },

    // ─── Joins ──────────────────────────────────────────────
    innerJoin(table: string, lhs: string, rhs: string): QueryBuilder {
      qb = qb.innerJoin(table, (join: JoinBuilder) => join.onRef(lhs, "=", rhs))
      return self
    },

    leftJoin(table: string, lhs: string, rhs: string): QueryBuilder {
      qb = qb.leftJoin(table, (join: JoinBuilder) => join.onRef(lhs, "=", rhs))
      return self
    },

    // ─── Group by / having ────────────────────────────────
    groupBy(...columns: string[]): QueryBuilder {
      qb = qb.groupBy(columns.map(validateColumn))
      return self
    },

    having(column: string, operator: string, value: unknown): QueryBuilder {
      qb = qb.having(validateColumn(column), operator, value)
      _hasWhere = true
      hasEffectiveWhere = true
      return self
    },

    // ─── Scope control ────────────────────────────────────
    withoutGlobalScope(name: string): QueryBuilder {
      omitScopes.add(name)
      return self
    },

    all(): QueryBuilder {
      hasAll = true
      return self
    },

    // ─── Conditional chaining ─────────────────────────────
    when(condition: unknown, callback: (q: QueryBuilder) => QueryBuilder): QueryBuilder {
      if (condition) return callback(self)
      return self
    },

    unless(condition: unknown, callback: (q: QueryBuilder) => QueryBuilder): QueryBuilder {
      if (!condition) return callback(self)
      return self
    },

    // ─── Internal ─────────────────────────────────────────
    _getKyselyQb(): any {
      return qb
    },
    _replaceKyselyQb(newQb: any): void {
      qb = newQb
    },
  }

  return self
}
