import { HookManager } from "../hooks/lifecycle"
import type { Model, ModelClass } from "./model"

const HOOK_MAP = new WeakMap<object, HookManager>()
const TS_SET = new WeakSet<object>()
const SD_SET = new WeakSet<object>()

export function getHooksFor(modelClass: ModelClass): HookManager {
  let mgr = HOOK_MAP.get(modelClass)
  if (!mgr) {
    mgr = new HookManager()
    HOOK_MAP.set(modelClass, mgr)
  }
  return mgr
}

export function registerTimestampsFor(
  modelClass: ModelClass,
  createdAtColumn: string = "createdAt",
  updatedAtColumn: string = "updatedAt",
): void {
  if (TS_SET.has(modelClass)) return
  TS_SET.add(modelClass)

  modelClass.on("beforeCreate", (model: Model) => {
    const now = new Date().toISOString()
    if (!model.get(createdAtColumn)) model.set(createdAtColumn, now)
    model.set(updatedAtColumn, now)
  })
  modelClass.on("beforeUpdate", (model: Model) => {
    model.set(updatedAtColumn, new Date().toISOString())
  })
}

export interface SoftDeleteConfig {
  column: string
}

const SD_CONFIG = new WeakMap<object, SoftDeleteConfig>()

export function getSoftDeleteConfig(modelClass: object): SoftDeleteConfig | null {
  return SD_CONFIG.get(modelClass) ?? null
}

export function registerSoftDeletesFor(modelClass: ModelClass, deletedAtColumn: string = "deletedAt"): void {
  if (SD_CONFIG.has(modelClass)) return
  SD_CONFIG.set(modelClass, { column: deletedAtColumn })

  modelClass.on("beforeRestore", () => {})
  modelClass.on("afterRestore", () => {})
  modelClass.on("beforeForceDelete", () => {})
  modelClass.on("afterForceDelete", () => {})
}
