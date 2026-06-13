import type { ModelDefinition, ModelInstance } from "../../model/types.js"

// ─── PUBLIC TYPES ──────────────────────────────────────────────

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

export interface RefEntry {
  node: Record<string, unknown>
  def: ModelDefinition
}

export interface GraphContext {
  refMap: Map<string, RefEntry>
  processedRefs: Map<string, ModelInstance>
  allowRefs: boolean
  allowedGraphSet: Set<string> | undefined
}
