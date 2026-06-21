import type { ColumnShape } from "../columns/column.js"
import type { ModelInstance } from "../model/types.js"
import type { InsertGraphOptions, UpsertGraphOptions } from "../relations/graph/index.js"

// ─── QUERY BUILDER INTERFACE ──────────────────────────────

export interface QueryBuilder<TColumns extends ColumnShape = ColumnShape>
  extends PromiseLike<ModelInstance<TColumns>[]> {
  // Core execution
  execute(): Promise<ModelInstance<TColumns>[]>
  collect(): Promise<import("../collection/index.js").Collection<TColumns>>
  executeTakeFirst(): Promise<ModelInstance<TColumns> | undefined>
  executeTakeFirstOrThrow(): Promise<ModelInstance<TColumns>>
  find(id: number | string): Promise<ModelInstance<TColumns> | undefined>
  findOrFail(id: number | string): Promise<ModelInstance<TColumns>>
  first(): Promise<ModelInstance<TColumns> | undefined>
  toSQL(): { sql: string; parameters: readonly unknown[] }

  // Aggregates
  count(): Promise<number>
  sum(column: string): Promise<number>
  avg(column: string): Promise<number>
  min(column: string): Promise<number>
  max(column: string): Promise<number>

  // Aggregates with subquery (withCount)
  withCount(relation: string): QueryBuilder<TColumns>
  withSum(relation: string, column: string): QueryBuilder<TColumns>
  withAvg(relation: string, column: string): QueryBuilder<TColumns>
  withMin(relation: string, column: string): QueryBuilder<TColumns>
  withMax(relation: string, column: string): QueryBuilder<TColumns>
  withExists(relation: string): QueryBuilder<TColumns>

  // Chunking & pagination
  chunk(size: number, callback: (chunk: ModelInstance<TColumns>[]) => Promise<void>): Promise<void>
  paginate(
    page: number,
    perPage?: number,
  ): Promise<import("../pagination/index.js").Paginator<TColumns>>

  // Graph operations (insert/upsert full relation graphs)
  insertGraph(
    data: Record<string, unknown> | Record<string, unknown>[],
    options?: InsertGraphOptions,
  ): Promise<any>
  upsertGraph(
    data: Record<string, unknown> | Record<string, unknown>[],
    options?: UpsertGraphOptions,
  ): Promise<any>

  // Eager loading
  with(
    ...relations: (string | Record<string, (qb: QueryBuilder<TColumns>) => void>)[]
  ): QueryBuilder<TColumns>
  /**
   * Whitelist allowed relations (and nested paths) for eager loading.
   * Throws if a relation path is not in the allow list.
   *
   * Supports dotted paths for granular control:
   * - `allowGraph("posts")` allows `posts`, `posts.author`, `posts.author.profile`, etc.
   * - `allowGraph("posts.author")` allows `posts.author` and `posts.author.profile`,
   *   but NOT bare `posts` or `posts.comments`.
   *
   * Multiple arguments are merged: `allowGraph("posts", "profile")`
   */
  allowGraph(...expressions: string[]): QueryBuilder<TColumns>

  // CRUD (bulk)
  updateMany(data: Record<string, unknown>): Promise<number>
  deleteMany(): Promise<number>

  // Soft deletes
  withTrashed(): QueryBuilder<TColumns>
  onlyTrashed(): QueryBuilder<TColumns>

  // Where conditions
  whereIn(column: string, values: unknown[]): QueryBuilder<TColumns>
  has(relationName: string): QueryBuilder<TColumns>
  whereHas(
    relationName: string,
    callback?: (qb: QueryBuilder<TColumns>) => void,
  ): QueryBuilder<TColumns>
  whereDoesntHave(
    relationName: string,
    callback?: (qb: QueryBuilder<TColumns>) => void,
  ): QueryBuilder<TColumns>
  where(column: string, operator: unknown, value?: unknown): QueryBuilder<TColumns>
  whereRef(col1: string, operator: string, col2: string): QueryBuilder<TColumns>
  orWhere(column: string, operator: unknown, value?: unknown): QueryBuilder<TColumns>

  // Ordering
  orderBy(column: string, direction?: "asc" | "desc"): QueryBuilder<TColumns>

  // Limit/offset
  limit(n: number): QueryBuilder<TColumns>
  offset(n: number): QueryBuilder<TColumns>

  // Select
  select(...columns: string[]): QueryBuilder<TColumns>
  selectAll(table?: string): QueryBuilder<TColumns>

  // Joins
  innerJoin(table: string, lhs: string, rhs: string): QueryBuilder<TColumns>
  leftJoin(table: string, lhs: string, rhs: string): QueryBuilder<TColumns>

  // Group by / having
  groupBy(...columns: string[]): QueryBuilder<TColumns>
  having(column: string, operator: string, value: unknown): QueryBuilder<TColumns>

  // Scope control
  withoutGlobalScope(name: string): QueryBuilder<TColumns>
  all(): QueryBuilder<TColumns>

  // Internal
  /** @internal Access underlying Kysely builder for raw SQL operations */
  _getKyselyQb(): any
  /** @internal Replace the underlying Kysely builder */
  _replaceKyselyQb(newQb: any): void

  // Conditional chaining
  when(
    condition: unknown,
    callback: (q: QueryBuilder<TColumns>) => QueryBuilder<TColumns>,
  ): QueryBuilder<TColumns>
  unless(
    condition: unknown,
    callback: (q: QueryBuilder<TColumns>) => QueryBuilder<TColumns>,
  ): QueryBuilder<TColumns>
}
