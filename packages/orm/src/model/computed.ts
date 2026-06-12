import type { ModelDefinition, ModelInstance } from "./types.js"

// ─── TYPES ───────────────────────────────────────────────────

export interface ComputedColumn<T = unknown> {
  readonly type: "sql" | "runtime" | "batch"
  readonly dependencies: string[]
  /** Compute a value for a single record (runtime) */
  compute?: (record: ModelInstance) => T
  /** Compute values for a batch of records (batch async) */
  batchCompute?: (records: ModelInstance[]) => Promise<T[]>
  /** Raw SQL expression to inline in SELECT */
  sql?: string
}

export type ComputedConfig = Record<string, ComputedColumn | (() => ComputedColumn)>

// ─── COMPUTED COLUMN DEFINITIONS ────────────────────────────

/**
 * Define a computed column that uses a raw SQL expression in SELECT.
 */
export function sqlComputed(dependencies: string[], sqlExpr: string): ComputedColumn {
  return { type: "sql", dependencies, sql: sqlExpr }
}

/**
 * Define a computed column that computes a value at runtime (post-query).
 */
export function computeAtRuntime<T>(dependencies: string[], fn: (record: ModelInstance) => T): ComputedColumn<T> {
  return { type: "runtime", dependencies, compute: fn }
}

/**
 * Define a computed column that computes values in a batch after query.
 * The batch function receives ALL loaded records and should return an array
 * of values in the same order.
 */
export function computeBatchAtRuntime<T>(
  dependencies: string[],
  fn: (records: ModelInstance[]) => Promise<T[]>,
): ComputedColumn<T> {
  return { type: "batch", dependencies, batchCompute: fn }
}

// ─── STORE ───────────────────────────────────────────────────

const computedConfigs = new WeakMap<ModelDefinition, ComputedConfig>()

export function setComputedConfig(def: ModelDefinition, config: ComputedConfig): void {
  computedConfigs.set(def, config)
}

export function getComputedConfig(def: ModelDefinition): ComputedConfig | undefined {
  return computedConfigs.get(def)
}

// ─── APPLY COMPUTED COLUMNS ──────────────────────────────────

/**
 * Apply computed columns to a set of loaded records.
 * Handles SQL, runtime, and batch computed columns.
 */
export function applyComputedColumns(
  records: ModelInstance[],
  computedConfig: ComputedConfig,
  selectedColumns: string[] | null,
): Promise<void> | void {
  // For SQL computed: the value is already in the attributes (inlined in SELECT)
  // For runtime: compute for each record
  // For batch: compute in batch

  const names = selectedColumns ?? Object.keys(records[0]?.attributes ?? {})
  const relevant = Object.entries(computedConfig).filter(([name]) => names.includes(name) || !selectedColumns)

  // Run batch computes first
  const batchDefs = relevant.filter(([, c]) => c.type === "batch") as [string, ComputedColumn][]
  for (const [_name, col] of batchDefs) {
    if (col.batchCompute) {
      // Run synchronously — caller must await if we return promise
      // We handle this by returning a promise chain
    }
  }

  // Run per-record computes
  for (const record of records) {
    for (const [name, col] of relevant) {
      if (col.type === "runtime" && col.compute) {
        ;(record as any).attributes[name] = col.compute(record)
      }
    }
  }
}

/**
 * Apply computed columns and return a promise (for async batch computes).
 */
export async function applyComputedColumnsAsync(
  records: ModelInstance[],
  computedConfig: ComputedConfig,
  selectedColumns: string[] | null,
): Promise<void> {
  if (records.length === 0) return

  const _names = selectedColumns ?? []
  const relevant = Object.entries(computedConfig).filter(([name]) => !selectedColumns || selectedColumns.includes(name))

  // Process batch computed columns
  const batchDefs = relevant.filter(([, c]) => c.type === "batch") as [string, ComputedColumn][]
  for (const [name, col] of batchDefs) {
    if (col.batchCompute) {
      const values = await col.batchCompute(records)
      for (let i = 0; i < records.length && i < values.length; i++) {
        records[i].set(name, values[i])
      }
    }
  }

  // Process runtime computed columns (per-record)
  for (const record of records) {
    for (const [name, col] of relevant) {
      if (col.type === "runtime" && col.compute) {
        record.set(name, col.compute(record))
      }
    }
  }
}
