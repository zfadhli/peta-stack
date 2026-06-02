import type { Kysely, SelectQueryBuilder } from "kysely"
import { ModelNotFoundError, RelationNotFoundError } from "../errors/errors"
import type { Model, ModelClass } from "../model/model"
import type { PetaLike } from "../types"
import { type EagerLoad, EagerLoader, type WithArg } from "./eager-loader"

const SAFE_COL = /^[a-zA-Z_][a-zA-Z0-9_.]*$/

export class ModelQueryBuilder<T extends Model> {
  #modelClass: ModelClass<T>
  #peta: PetaLike
  #kysely: Kysely<any>
  #qb: SelectQueryBuilder<any, any, any>
  #eagerLoads: EagerLoad[] = []
  #withTrashed = false
  #onlyTrashed = false
  #omitScopes = new Set<string>()

  constructor(modelClass: ModelClass<T>, peta: PetaLike, kysely?: Kysely<any>) {
    this.#modelClass = modelClass
    this.#peta = peta
    this.#kysely = kysely ?? peta.kysely
    this.#qb = this.#kysely.selectFrom(modelClass.table)
  }

  get peta(): PetaLike {
    return this.#peta
  }

  clone(): ModelQueryBuilder<T> {
    const qb = new ModelQueryBuilder<T>(this.#modelClass, this.#peta)
    qb.#qb = this.#qb
    qb.#eagerLoads = [...this.#eagerLoads]
    qb.#withTrashed = this.#withTrashed
    qb.#onlyTrashed = this.#onlyTrashed
    qb.#omitScopes = new Set(this.#omitScopes)
    return qb
  }

  withoutGlobalScope(name: string): this {
    this.#omitScopes.add(name)
    return this
  }

  when(condition: unknown, callback: (q: this) => this): this {
    if (condition) return callback(this)
    return this
  }

  unless(condition: unknown, callback: (q: this) => this): this {
    if (!condition) return callback(this)
    return this
  }

  async execute(): Promise<T[]> {
    const scopes = this.#modelClass.getGlobalScopes?.()
    if (scopes) {
      for (const [name, fn] of scopes) {
        if (!this.#omitScopes.has(name)) {
          fn(this)
        }
      }
    }
    if (!this.#withTrashed && "deletedAt" in this.#modelClass.columns) {
      ;(this.#qb as any) = (this.#qb as any).where("deletedAt", "is", null)
    }
    if (this.#onlyTrashed) {
      ;(this.#qb as any) = (this.#qb as any).where("deletedAt", "is not", null)
    }
    const rows = (await this.#qb.selectAll().execute()) as Record<string, unknown>[]
    const models = rows.map((row) => this.#modelClass.hydrate(row))
    if (this.#eagerLoads.length > 0) {
      const loader = new EagerLoader()
      for (const el of this.#eagerLoads) {
        await loader.loadRelated(models, el, this.#modelClass)
      }
    }
    return models
  }

  async executeTakeFirst(): Promise<T | undefined> {
    const rows = await this.execute()
    return rows[0]
  }

  async executeTakeFirstOrThrow(): Promise<T> {
    const row = await this.executeTakeFirst()
    if (!row) throw new ModelNotFoundError(this.#modelClass.table)
    return row
  }

  async find(id: number | string): Promise<T | undefined> {
    return this.clone().where("id", "=", id).executeTakeFirst()
  }

  async findOrFail(id: number | string): Promise<T> {
    return this.clone().where("id", "=", id).executeTakeFirstOrThrow()
  }

  async first(): Promise<T | undefined> {
    return this.clone().limit(1).executeTakeFirst()
  }

  toSQL(): { sql: string; parameters: readonly unknown[] } {
    const compiled = this.#qb.compile()
    return { sql: compiled.sql, parameters: compiled.parameters }
  }

  async count(): Promise<number> {
    const result = await this.#qb.select((eb: any) => eb.fn.countAll().as("count")).executeTakeFirst()
    return Number(result?.count ?? 0)
  }

  async sum(column: string): Promise<number> {
    const result = await (this.#qb as any).select((eb: any) => eb.fn.sum(column).as("sum")).executeTakeFirst()
    return Number(result?.sum ?? 0)
  }

  async avg(column: string): Promise<number> {
    const result = await (this.#qb as any).select((eb: any) => eb.fn.avg(column).as("avg")).executeTakeFirst()
    return Number(result?.avg ?? 0)
  }

  async min(column: string): Promise<number> {
    const result = await (this.#qb as any).select((eb: any) => eb.fn.min(column).as("min")).executeTakeFirst()
    return Number(result?.min ?? 0)
  }

  async max(column: string): Promise<number> {
    const result = await (this.#qb as any).select((eb: any) => eb.fn.max(column).as("max")).executeTakeFirst()
    return Number(result?.max ?? 0)
  }

  async chunk(size: number, callback: (chunk: T[]) => Promise<void>): Promise<void> {
    let page = 1
    while (true) {
      const items = await this.clone()
        .limit(size)
        .offset((page - 1) * size)
        .execute()
      if (items.length === 0) break
      await callback(items)
      if (items.length < size) break
      page++
    }
  }

  async paginate(page: number, perPage: number = 20): Promise<import("../pagination/paginator").Paginator<T>> {
    page = Math.max(1, Math.floor(page))
    perPage = Math.max(1, Math.min(perPage, 1000))
    const total = await this.clone().count()
    const items = await this.clone()
      .limit(perPage)
      .offset((page - 1) * perPage)
      .execute()
    const { Paginator } = await import("../pagination/paginator")
    return new Paginator(items, total, perPage, page)
  }

  with(...relations: WithArg[]): this {
    for (const arg of relations) {
      if (typeof arg === "string") {
        this.#eagerLoads.push({ name: arg, constraints: null })
      } else if (arg && typeof arg === "object") {
        for (const [name, constraints] of Object.entries(arg)) {
          this.#eagerLoads.push({
            name,
            constraints: typeof constraints === "function" ? constraints : null,
          })
        }
      }
    }
    return this
  }

  async updateMany(data: Record<string, unknown>): Promise<number> {
    const result = await this.#kysely.updateTable(this.#modelClass.table).set(data).executeTakeFirst()
    return Number((result as any).numUpdatedRows ?? 0)
  }

  async deleteMany(): Promise<number> {
    const result = await this.#kysely.deleteFrom(this.#modelClass.table).executeTakeFirst()
    return Number((result as any).numDeletedRows ?? 0)
  }

  withTrashed(): this {
    this.#withTrashed = true
    return this
  }

  onlyTrashed(): this {
    this.#withTrashed = true
    this.#onlyTrashed = true
    return this
  }

  whereIn(column: string, values: unknown[]): this {
    if (values.length === 0) {
      this.#qb = this.#qb.where("1", "=", "0")
    } else {
      this.#qb = this.#qb.where(column as any, "in", values as any)
    }
    return this
  }

  whereInPivot(column: string, values: unknown[]): this {
    if (values.length === 0) {
      this.#qb = this.#qb.where("1", "=", "0")
    } else {
      this.#qb = this.#qb.where(column as any, "in", values as any)
    }
    return this
  }

  has(relationName: string): this {
    return this.#whereExists(relationName, undefined, true)
  }

  whereHas(relationName: string, _callback?: (qb: ModelQueryBuilder<any>) => void): this {
    return this.#whereExists(relationName, _callback, true)
  }

  whereDoesntHave(relationName: string, _callback?: (qb: ModelQueryBuilder<any>) => void): this {
    return this.#whereExists(relationName, _callback, false)
  }

  #whereExists(relationName: string, _callback?: (qb: ModelQueryBuilder<any>) => void, exists: boolean = true): this {
    const relation = this.#modelClass.relations[relationName]
    if (!relation) {
      throw new RelationNotFoundError(this.#modelClass.table, relationName)
    }
    const relatedTable = relation.relatedModelClass.table
    const foreignKey = relation.foreignKey
    const localKey = relation.localKey

    const subQb = this.#kysely
      .selectFrom(`${relatedTable} as ${relatedTable}_exists`)
      .selectAll()
      .whereRef(`${relatedTable}_exists.${foreignKey}` as any, "=", `${this.#modelClass.table}.${localKey}` as any)

    this.#qb = this.#qb.where((eb: any) => (exists ? eb.exists(subQb) : eb.not(eb.exists(subQb))))
    return this
  }

  #col(ref: string): string {
    if (!SAFE_COL.test(ref)) throw new Error(`Invalid column reference: ${ref}`)
    return ref
  }

  #safeWhere(column: unknown, operator?: unknown, value?: unknown): void {
    const col = this.#col(String(column))
    ;(this.#qb as any) = (this.#qb as any).where(col, operator, value)
  }

  where(column: unknown, operator: unknown, value: unknown): this
  where(column: unknown, value: unknown): this
  where(...args: unknown[]): this {
    this.#safeWhere(args[0], args[1], args[2])
    return this
  }

  whereRef(col1: string, operator: string, col2: string): this {
    ;(this.#qb as any) = (this.#qb as any).whereRef(this.#col(col1), operator, this.#col(col2))
    return this
  }

  orWhere(column: unknown, operator: unknown, value: unknown): this
  orWhere(column: unknown, value: unknown): this
  orWhere(...args: unknown[]): this {
    this.#safeWhere(args[0], args[1], args[2])
    return this
  }

  orderBy(column: string, direction?: "asc" | "desc"): this {
    const col = this.#col(column)
    if (direction) {
      this.#qb = this.#qb.orderBy(col, direction)
    } else {
      this.#qb = this.#qb.orderBy(col)
    }
    return this
  }

  limit(n: number): this {
    this.#qb = this.#qb.limit(n)
    return this
  }

  offset(n: number): this {
    this.#qb = this.#qb.offset(n)
    return this
  }

  select(...columns: string[]): this {
    this.#qb = this.#qb.select(columns.map((c) => this.#col(c)))
    return this
  }

  selectAll(table?: string): this {
    if (table) {
      this.#qb = this.#qb.selectAll(this.#col(table))
    } else {
      this.#qb = this.#qb.selectAll()
    }
    return this
  }

  innerJoin(table: string, lhs: string, rhs: string): this {
    this.#qb = this.#qb.innerJoin(table, this.#col(lhs), this.#col(rhs))
    return this
  }

  leftJoin(table: string, lhs: string, rhs: string): this {
    this.#qb = this.#qb.leftJoin(table, this.#col(lhs), this.#col(rhs))
    return this
  }

  groupBy(...columns: string[]): this {
    this.#qb = this.#qb.groupBy(columns.map((c) => this.#col(c)))
    return this
  }

  having(column: string, operator: string, value: unknown): this {
    ;(this.#qb as any) = (this.#qb as any).having(this.#col(column), operator, value)
    return this
  }
}


