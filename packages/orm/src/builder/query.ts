import { ModelNotFoundError, RelationNotFoundError } from "../errors.js"
import type { Database } from "../lib/kysely.js"
import type { ModelDefinition, ModelInstance } from "../model/index.js"
import type { PetaLike } from "../types.js"
import type { EagerLoad } from "./eager.js"
import { EagerLoader } from "./eager.js"

const SAFE_COLUMN = /^[a-zA-Z_][a-zA-Z0-9_.]*$/
interface MutationResult {
  numUpdatedRows?: bigint
  numDeletedRows?: bigint
}

export interface QueryBuilder {
  clone(): QueryBuilder
  withoutGlobalScope(name: string): QueryBuilder
  when(condition: unknown, callback: (q: QueryBuilder) => QueryBuilder): QueryBuilder
  unless(condition: unknown, callback: (q: QueryBuilder) => QueryBuilder): QueryBuilder
  execute(): Promise<ModelInstance[]>
  collect(): Promise<import("../collection/index.js").Collection>
  executeTakeFirst(): Promise<ModelInstance | undefined>
  executeTakeFirstOrThrow(): Promise<ModelInstance>
  find(id: number | string): Promise<ModelInstance | undefined>
  findOrFail(id: number | string): Promise<ModelInstance>
  first(): Promise<ModelInstance | undefined>
  toSQL(): { sql: string; parameters: readonly unknown[] }
  count(): Promise<number>
  sum(column: string): Promise<number>
  avg(column: string): Promise<number>
  min(column: string): Promise<number>
  max(column: string): Promise<number>
  chunk(size: number, callback: (chunk: ModelInstance[]) => Promise<void>): Promise<void>
  paginate(page: number, perPage?: number): Promise<import("../pagination/index.js").Paginator>
  with(...relations: (string | Record<string, (qb: QueryBuilder) => void>)[]): QueryBuilder
  updateMany(data: Record<string, unknown>): Promise<number>
  deleteMany(): Promise<number>
  withTrashed(): QueryBuilder
  onlyTrashed(): QueryBuilder
  whereIn(column: string, values: unknown[]): QueryBuilder
  whereInPivot(column: string, values: unknown[]): QueryBuilder
  has(relationName: string): QueryBuilder
  whereHas(relationName: string, callback?: (qb: QueryBuilder) => void): QueryBuilder
  whereDoesntHave(relationName: string, callback?: (qb: QueryBuilder) => void): QueryBuilder
  where(column: string, operator: unknown, value?: unknown): QueryBuilder
  whereRef(col1: string, operator: string, col2: string): QueryBuilder
  orWhere(column: string, operator: unknown, value?: unknown): QueryBuilder
  orderBy(column: string, direction?: "asc" | "desc"): QueryBuilder
  limit(n: number): QueryBuilder
  offset(n: number): QueryBuilder
  select(...columns: string[]): QueryBuilder
  selectAll(table?: string): QueryBuilder
  innerJoin(table: string, lhs: string, rhs: string): QueryBuilder
  leftJoin(table: string, lhs: string, rhs: string): QueryBuilder
  groupBy(...columns: string[]): QueryBuilder
  having(column: string, operator: string, value: unknown): QueryBuilder
}

export function createQueryBuilder(def: ModelDefinition, peta: PetaLike, kyselyOverride?: Database): QueryBuilder {
  const db: any = kyselyOverride ?? peta.kysely
  let qb: any = db.selectFrom(def.table)
  const eagerLoads: EagerLoad[] = []
  let withTrashed = false
  let onlyTrashedMode = false
  const omitScopes = new Set<string>()
  let scopesApplied = false

  function validateColumn(ref: string): string {
    if (!SAFE_COLUMN.test(ref)) throw new Error(`Invalid column reference: ${ref}`)
    return ref
  }

  /** Apply global scopes and soft-delete filters to the query builder. */
  function applyScopes(): void {
    if (scopesApplied) return
    scopesApplied = true

    const scopes = def.getGlobalScopes?.()
    if (scopes) {
      for (const [name, fn] of scopes) {
        if (!omitScopes.has(name)) fn(self)
      }
    }
    const hasDeletedColumn = "deletedAt" in def.columns
    if (!withTrashed && hasDeletedColumn) qb = qb.where("deletedAt", "is", null)
    if (onlyTrashedMode && hasDeletedColumn) qb = qb.where("deletedAt", "is not", null)
  }

  async function runExecute(): Promise<ModelInstance[]> {
    applyScopes()
    const rows = (await qb.selectAll().execute()) as Record<string, unknown>[]
    const models = rows.map((row) => def._hydrate(row))
    if (eagerLoads.length > 0) {
      const loader = new EagerLoader()
      for (const el of eagerLoads) await loader.loadRelated(models, el, def)
    }
    return models
  }

  const self: QueryBuilder = {
    clone(): QueryBuilder {
      // WARNING: clone creates a fresh QueryBuilder that shares the same
      // Kysely SELECT target but WITHOUT any WHERE/ORDER BY/LIMIT/OFFSET/
      // JOIN/etc clauses that were applied. This is by design for simple
      // counting queries, but means all query state set before clone()
      // is silently dropped.
      //
      // Internal methods (first, find, findOrFail, chunk, paginate) no
      // longer use clone() — they work directly with qb.
      const c = createQueryBuilder(def, peta, db)
      for (const el of eagerLoads) {
        if (el.constraints) {
          c.with({ [el.name]: el.constraints } as Record<string, (qb: QueryBuilder) => void>)
        } else {
          c.with(el.name)
        }
      }
      if (withTrashed) c.withTrashed()
      if (onlyTrashedMode) c.onlyTrashed()
      for (const name of omitScopes) c.withoutGlobalScope(name)
      return c
    },
    withoutGlobalScope(name: string): QueryBuilder {
      omitScopes.add(name)
      return self
    },
    when(condition: unknown, callback: (q: QueryBuilder) => QueryBuilder): QueryBuilder {
      return condition ? callback(self) : self
    },
    unless(condition: unknown, callback: (q: QueryBuilder) => QueryBuilder): QueryBuilder {
      return !condition ? callback(self) : self
    },
    execute: runExecute,
    async collect(): Promise<import("../collection/index.js").Collection> {
      const items = await runExecute()
      const { createCollection } = await import("../collection/index.js")
      return createCollection(items)
    },
    async executeTakeFirst(): Promise<ModelInstance | undefined> {
      const rows = await runExecute()
      return rows[0]
    },
    async executeTakeFirstOrThrow(): Promise<ModelInstance> {
      const row = await self.executeTakeFirst()
      if (!row) throw new ModelNotFoundError(def.table)
      return row
    },
    async find(id: number | string) {
      const rows = await self.where("id", "=", id).limit(1).execute()
      return rows[0]
    },
    async findOrFail(id: number | string) {
      const rows = await self.where("id", "=", id).limit(1).execute()
      if (!rows[0]) throw new ModelNotFoundError(def.table)
      return rows[0]
    },
    async first() {
      const rows = await self.limit(1).execute()
      return rows[0]
    },
    toSQL(): { sql: string; parameters: readonly unknown[] } {
      const compiled = qb.compile() as { sql: string; parameters: readonly unknown[] }
      return { sql: compiled.sql, parameters: compiled.parameters }
    },
    async count(): Promise<number> {
      applyScopes()
      const result = await qb.select((eb: any) => eb.fn.countAll().as("count")).executeTakeFirst()
      return Number(result?.count ?? 0)
    },
    async sum(column: string): Promise<number> {
      applyScopes()
      const result = await qb.select((eb: any) => eb.fn.sum(column).as("sum")).executeTakeFirst()
      return Number(result?.sum ?? 0)
    },
    async avg(column: string): Promise<number> {
      applyScopes()
      const result = await qb.select((eb: any) => eb.fn.avg(column).as("avg")).executeTakeFirst()
      return Number(result?.avg ?? 0)
    },
    async min(column: string): Promise<number> {
      applyScopes()
      const result = await qb.select((eb: any) => eb.fn.min(column).as("min")).executeTakeFirst()
      return Number(result?.min ?? 0)
    },
    async max(column: string): Promise<number> {
      applyScopes()
      const result = await qb.select((eb: any) => eb.fn.max(column).as("max")).executeTakeFirst()
      return Number(result?.max ?? 0)
    },
    async chunk(size: number, callback: (chunk: ModelInstance[]) => Promise<void>): Promise<void> {
      let page = 1
      while (true) {
        // No clone() — Kysely's limit()/offset() replace previous values,
        // so each iteration gets the correct slice.
        const items = await self
          .limit(size)
          .offset((page - 1) * size)
          .execute()
        if (items.length === 0) break
        await callback(items)
        if (items.length < size) break
        page++
      }
    },
    async paginate(page: number, perPage = 20) {
      page = Math.max(1, Math.floor(page))
      perPage = Math.max(1, Math.min(perPage, 1000))
      applyScopes()
      // Count total (without limit/offset)
      const countResult = await qb.select((eb: any) => eb.fn.countAll().as("count")).executeTakeFirst()
      const total = Number(countResult?.count ?? 0)
      // Fetch items (with limit/offset)
      const fetchQb = qb.limit(perPage).offset((page - 1) * perPage)
      const rows = (await fetchQb.selectAll().execute()) as Record<string, unknown>[]
      const models = rows.map((row) => def._hydrate(row))
      if (eagerLoads.length > 0) {
        const loader = new EagerLoader()
        for (const el of eagerLoads) await loader.loadRelated(models, el, def)
      }
      const { createPaginator } = await import("../pagination/index.js")
      return createPaginator(models, total, perPage, page)
    },
    with(...relations: (string | Record<string, (qb: QueryBuilder) => void>)[]): QueryBuilder {
      for (const arg of relations) {
        if (typeof arg === "string") eagerLoads.push({ name: arg, constraints: null })
        else if (arg && typeof arg === "object") {
          for (const [name, constraints] of Object.entries(arg))
            eagerLoads.push({ name, constraints: typeof constraints === "function" ? constraints : null })
        }
      }
      return self
    },
    async updateMany(data: Record<string, unknown>): Promise<number> {
      const result = await db.updateTable(def.table).set(data).executeTakeFirst()
      return Number((result as MutationResult).numUpdatedRows ?? 0)
    },
    async deleteMany(): Promise<number> {
      const result = await db.deleteFrom(def.table).executeTakeFirst()
      return Number((result as MutationResult).numDeletedRows ?? 0)
    },
    withTrashed(): QueryBuilder {
      withTrashed = true
      return self
    },
    onlyTrashed(): QueryBuilder {
      withTrashed = true
      onlyTrashedMode = true
      return self
    },
    whereIn(column: string, values: unknown[]): QueryBuilder {
      qb = values.length === 0 ? qb.where("1", "=", "0") : qb.where(validateColumn(column), "in", values)
      return self
    },
    whereInPivot(column: string, values: unknown[]): QueryBuilder {
      return self.whereIn(column, values)
    },
    has(relationName: string): QueryBuilder {
      applyWhereExists(relationName, undefined, true)
      return self
    },
    whereHas(relationName: string, _cb?: (qb: QueryBuilder) => void): QueryBuilder {
      applyWhereExists(relationName, _cb, true)
      return self
    },
    whereDoesntHave(relationName: string, _cb?: (qb: QueryBuilder) => void): QueryBuilder {
      applyWhereExists(relationName, _cb, false)
      return self
    },
    where(column: string, operator: unknown, value?: unknown): QueryBuilder {
      const col = validateColumn(column)
      qb = arguments.length === 2 ? qb.where(col, operator) : qb.where(col, operator, value)
      return self
    },
    whereRef(col1: string, operator: string, col2: string): QueryBuilder {
      qb = qb.whereRef(validateColumn(col1), operator, validateColumn(col2))
      return self
    },
    orWhere(column: string, operator: unknown, value?: unknown): QueryBuilder {
      const col = validateColumn(column)
      qb = arguments.length === 2 ? qb.orWhere(col, operator) : qb.orWhere(col, operator, value)
      return self
    },
    orderBy(column: string, direction?: "asc" | "desc"): QueryBuilder {
      const col = validateColumn(column)
      qb = direction ? qb.orderBy(col, direction) : qb.orderBy(col)
      return self
    },
    limit(n: number): QueryBuilder {
      qb = qb.limit(n)
      return self
    },
    offset(n: number): QueryBuilder {
      qb = qb.offset(n)
      return self
    },
    select(...columns: string[]): QueryBuilder {
      qb = qb.select(columns.map((c) => validateColumn(c)))
      return self
    },
    selectAll(table?: string): QueryBuilder {
      qb = table ? qb.selectAll(validateColumn(table)) : qb.selectAll()
      return self
    },
    innerJoin(table: string, lhs: string, rhs: string): QueryBuilder {
      qb = qb.innerJoin(table, validateColumn(lhs), validateColumn(rhs))
      return self
    },
    leftJoin(table: string, lhs: string, rhs: string): QueryBuilder {
      qb = qb.leftJoin(table, validateColumn(lhs), validateColumn(rhs))
      return self
    },
    groupBy(...columns: string[]): QueryBuilder {
      qb = qb.groupBy(columns.map((c) => validateColumn(c)))
      return self
    },
    having(column: string, operator: string, value: unknown): QueryBuilder {
      qb = qb.having(validateColumn(column), operator, value)
      return self
    },
  }

  function applyWhereExists(
    relationName: string,
    _cb: ((qb: QueryBuilder) => void) | undefined,
    exists: boolean,
  ): void {
    const relation = def.relations[relationName]
    if (!relation) throw new RelationNotFoundError(def.table, relationName)
    const relatedTable = relation.relatedModelClass.table
    const foreignKey = relation.foreignKey
    const localKey = relation.localKey
    const subQb = db
      .selectFrom(`${relatedTable} as ${relatedTable}_exists`)
      .selectAll()
      .whereRef(`${relatedTable}_exists.${foreignKey}`, "=", `${def.table}.${localKey}`)
    qb = qb.where((eb: any) => (exists ? eb.exists(subQb) : eb.not(eb.exists(subQb))))
  }

  return self
}
