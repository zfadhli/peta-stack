import type { ModelDefinition } from "../model/types.js"
import type { QueryBuilder } from "../query/index.js"

// ─── TYPES ───────────────────────────────────────────────────

export interface StaticHookArgs {
  /** Transform the mutating query into a SELECT to preview affected rows */
  asFindQuery(): QueryBuilder
  /** Cancel the mutation and return a custom result */
  cancelQuery(result: unknown): void
  /** The column data being inserted/updated (for create/update hooks) */
  inputItems?: Record<string, unknown>[]
}

export type StaticHookCallback = (args: StaticHookArgs) => void | Promise<void>

export type StaticHookEvent =
  | "beforeCreate"
  | "afterCreate"
  | "beforeUpdate"
  | "afterUpdate"
  | "beforeDelete"
  | "afterDelete"
  | "beforeFind"
  | "afterFind"

// ─── STORE ───────────────────────────────────────────────────

const staticHooks = new WeakMap<ModelDefinition, Map<StaticHookEvent, StaticHookCallback[]>>()

export function addStaticHook(def: ModelDefinition, event: StaticHookEvent, callback: StaticHookCallback): () => void {
  let hooks = staticHooks.get(def)
  if (!hooks) {
    hooks = new Map()
    staticHooks.set(def, hooks)
  }
  let cbs = hooks.get(event)
  if (!cbs) {
    cbs = []
    hooks.set(event, cbs)
  }
  cbs.push(callback)
  return () => {
    const idx = cbs!.indexOf(callback)
    if (idx !== -1) cbs!.splice(idx, 1)
  }
}

export function getStaticHooks(def: ModelDefinition, event: StaticHookEvent): StaticHookCallback[] {
  return staticHooks.get(def)?.get(event) ?? []
}

export function hasStaticHooks(def: ModelDefinition, event: StaticHookEvent): boolean {
  return (staticHooks.get(def)?.get(event)?.length ?? 0) > 0
}
