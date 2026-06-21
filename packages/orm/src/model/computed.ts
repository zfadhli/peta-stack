import type { ModelDefinition, ModelInstance } from "./types.js"

// ─── TYPES ───────────────────────────────────────────────────

export interface ComputedColumn<T = unknown> {
  readonly type: "runtime" | "batch"
  readonly dependencies: string[]
  /** Compute a value for a single record (runtime) */
  compute?: (record: ModelInstance) => T
  /** Compute values for a batch of records (batch async) */
  batchCompute?: (records: ModelInstance[]) => Promise<T[]>
}

export type ComputedConfig = Record<string, ComputedColumn | (() => ComputedColumn)>

// ─── COMPUTED COLUMN DEFINITIONS ────────────────────────────

/**
 * Define a computed column that computes a value at runtime (post-query).
 */
export function computeAtRuntime<T>(
  dependencies: string[],
  fn: (record: ModelInstance) => T,
): ComputedColumn<T> {
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
/** Resolve a ComputedConfig entry (lazy function or plain object). */
function resolveComputedColumn(entry: ComputedColumn | (() => ComputedColumn)): ComputedColumn {
  return typeof entry === "function" ? entry() : entry
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
  const relevant = Object.entries(computedConfig).filter(
    ([name]) => !selectedColumns || selectedColumns.includes(name),
  )

  // Process batch computed columns
  const batchDefs = relevant.filter(([, c]) => resolveComputedColumn(c).type === "batch") as [
    string,
    ComputedColumn,
  ][]
  for (const [name, col] of batchDefs) {
    if (col.batchCompute) {
      const values = await col.batchCompute(records)
      for (let i = 0; i < records.length && i < values.length; i++) {
        records[i]!.set(name, values[i])
      }
    }
  }

  // Process runtime computed columns (per-record)
  for (const record of records) {
    for (const [name, c] of relevant) {
      const col = resolveComputedColumn(c)
      if (col.type === "runtime" && col.compute) {
        record.set(name, col.compute(record))
      }
    }
  }
}
