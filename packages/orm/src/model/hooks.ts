import { createHookManager, type HookManager } from "../hooks/index.js"
import type { ModelDefinition } from "./types.js"

const hookManagers = new WeakMap<ModelDefinition, HookManager>()

export function getHooksFor(def: ModelDefinition): HookManager {
  let hm = hookManagers.get(def)
  if (!hm) {
    hm = createHookManager()
    hookManagers.set(def, hm)
  }
  return hm
}

// Soft-delete config
export interface SoftDeleteConfig {
  column: string
}

const SOFT_DELETE = new WeakMap<ModelDefinition, SoftDeleteConfig>()

export function hasSoftDelete(def: ModelDefinition): boolean {
  return SOFT_DELETE.has(def)
}

export function getSoftDeleteConfig(def: ModelDefinition): SoftDeleteConfig | undefined {
  return SOFT_DELETE.get(def)
}

export function registerSoftDeletesFor(def: ModelDefinition, deletedAtColumn = "deletedAt"): void {
  SOFT_DELETE.set(def, { column: deletedAtColumn })
}

// Timestamps config
export interface TimestampConfig {
  createdAt: string
  updatedAt: string
}

export function registerTimestampsFor(
  def: ModelDefinition,
  createdAtCol = "createdAt",
  updatedAtCol = "updatedAt",
): void {
  const hm = getHooksFor(def)
  hm.on("beforeCreate", (model: any) => {
    const now = new Date().toISOString()
    if (!model.get(createdAtCol)) model.set(createdAtCol, now)
    model.set(updatedAtCol, now)
  })
  hm.on("beforeUpdate", (model: any) => {
    model.set(updatedAtCol, new Date().toISOString())
  })
}
