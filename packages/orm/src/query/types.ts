import type { ModelInstance } from "../model/types.js"
import type { InsertGraphOptions, UpsertGraphOptions } from "../relations/graph/index.js"

// ─── QUERY BUILDER INTERFACE ──────────────────────────────

export interface QueryBuilder extends PromiseLike<ModelInstance[]> {
  // Core execution
  execute(): Promise<ModelInstance[]>
  collect(): Promise<import("../collection/index.js").Collection>
  executeTakeFirst(): Promise<ModelInstance | undefined>
  executeTakeFirstOrThrow(): Promise<ModelInstance>
  find(id: number | string): Promise<ModelInstance | undefined>
  findOrFail(id: number | string): Promise<ModelInstance>
  first(): Promise<ModelInstance | undefined>
  toSQL(): { sql: string; parameters: readonly unknown[] }

  // Aggregates
  count(): Promise<number>
  sum(column: string): Promise<number>
  avg(column: string): Promise<number>
  min(column: string): Promise<number>
  max(column: string): Promise<number>

  // Aggregates with subquery (withCount)
  withCount(relation: string): QueryBuilder
  withSum(relation: string, column: string): QueryBuilder
  withAvg(relation: string, column: string): QueryBuilder
  withMin(relation: string, column: string): QueryBuilder
  withMax(relation: string, column: string): QueryBuilder
  withExists(relation: string): QueryBuilder

  // Chunking & pagination
  chunk(size: number, callback: (chunk: ModelInstance[]) => Promise<void>): Promise<void>
  paginate(page: number, perPage?: number): Promise<import("../pagination/index.js").Paginator>

  // Graph operations (insert/upsert full relation graphs)
  insertGraph(data: Record<string, unknown> | Record<string, unknown>[], options?: InsertGraphOptions): Promise<any>
  upsertGraph(data: Record<string, unknown> | Record<string, unknown>[], options?: UpsertGraphOptions): Promise<any>

  // Eager loading
  with(...relations: (string | Record<string, (qb: QueryBuilder) => void>)[]): QueryBuilder
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
  allowGraph(...expressions: string[]): QueryBuilder

  // CRUD (bulk)
  updateMany(data: Record<string, unknown>): Promise<number>
  deleteMany(): Promise<number>

  // Soft deletes
  withTrashed(): QueryBuilder
  onlyTrashed(): QueryBuilder

  // Where conditions
  whereIn(column: string, values: unknown[]): QueryBuilder
  whereInPivot(column: string, values: unknown[]): QueryBuilder
  has(relationName: string): QueryBuilder
  whereHas(relationName: string, callback?: (qb: QueryBuilder) => void): QueryBuilder
  whereDoesntHave(relationName: string, callback?: (qb: QueryBuilder) => void): QueryBuilder
  where(column: string, operator: unknown, value?: unknown): QueryBuilder
  whereRef(col1: string, operator: string, col2: string): QueryBuilder
  orWhere(column: string, operator: unknown, value?: unknown): QueryBuilder

  // Ordering
  orderBy(column: string, direction?: "asc" | "desc"): QueryBuilder

  // Limit/offset
  limit(n: number): QueryBuilder
  offset(n: number): QueryBuilder

  // Select
  select(...columns: string[]): QueryBuilder
  selectAll(table?: string): QueryBuilder

  // Joins
  innerJoin(table: string, lhs: string, rhs: string): QueryBuilder
  leftJoin(table: string, lhs: string, rhs: string): QueryBuilder

  // Group by / having
  groupBy(...columns: string[]): QueryBuilder
  having(column: string, operator: string, value: unknown): QueryBuilder

  // Scope control
  withoutGlobalScope(name: string): QueryBuilder
  all(): QueryBuilder

  // Internal
  /** @internal Access underlying Kysely builder for raw SQL operations */
  _getKyselyQb(): any
  /** @internal Replace the underlying Kysely builder */
  _replaceKyselyQb(newQb: any): void

  // Conditional chaining
  when(condition: unknown, callback: (q: QueryBuilder) => QueryBuilder): QueryBuilder
  unless(condition: unknown, callback: (q: QueryBuilder) => QueryBuilder): QueryBuilder
}
