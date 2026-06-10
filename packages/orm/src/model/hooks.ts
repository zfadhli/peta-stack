import { createHookManager, type HookManager } from "../hooks/index.js"
import type { ModelDefinition } from "./index.js"

const HOOKS = new WeakMap<ModelDefinition, HookManager>()
const SOFT_DELETE = new WeakMap<ModelDefinition, SoftDeleteConfig>()
const TIMESTAMPS = new WeakMap<ModelDefinition, TimestampConfig>()

export interface SoftDeleteConfig {
  column: string
}
export interface TimestampConfig {
  createdAt: string
  updatedAt: string
}

export function getHooksFor(def: ModelDefinition): HookManager {
  let hooks = HOOKS.get(def)
  if (!hooks) {
    hooks = createHookManager()
    HOOKS.set(def, hooks)
  }
  return hooks
}
export function hasSoftDelete(def: ModelDefinition): boolean {
  return SOFT_DELETE.has(def)
}
export function getSoftDeleteConfig(def: ModelDefinition): SoftDeleteConfig | undefined {
  return SOFT_DELETE.get(def)
}

export function registerTimestampsFor(
  def: ModelDefinition,
  createdAtColumn = "createdAt",
  updatedAtColumn = "updatedAt",
): void {
  TIMESTAMPS.set(def, { createdAt: createdAtColumn, updatedAt: updatedAtColumn })
  const hooks = getHooksFor(def)
  hooks.on("beforeCreate", (model) => {
    const now = new Date().toISOString()
    model.set(createdAtColumn, now)
    model.set(updatedAtColumn, now)
  })
  hooks.on("beforeUpdate", (model) => {
    model.set(updatedAtColumn, new Date().toISOString())
  })
}

export function registerSoftDeletesFor(def: ModelDefinition, deletedAtColumn = "deletedAt"): void {
  SOFT_DELETE.set(def, { column: deletedAtColumn })
}
