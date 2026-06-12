import type { ModelLike } from "../types.js"

export type LifecycleEvent =
  | "beforeCreate"
  | "afterCreate"
  | "beforeUpdate"
  | "afterUpdate"
  | "beforeSave"
  | "afterSave"
  | "beforeDelete"
  | "afterDelete"
  | "beforeRestore"
  | "afterRestore"
  | "beforeForceDelete"
  | "afterForceDelete"

export type HookCallback = (model: ModelLike) => void | Promise<void>

export interface HookManager {
  on(event: LifecycleEvent, callback: HookCallback): () => void
  off(event: LifecycleEvent, callback: HookCallback): void
  trigger(event: LifecycleEvent, model: ModelLike): Promise<void>
  clone(): HookManager
}

export function createHookManager(): HookManager {
  const listeners = new Map<LifecycleEvent, HookCallback[]>()

  function on(event: LifecycleEvent, callback: HookCallback): () => void {
    let cbs = listeners.get(event)
    if (!cbs) {
      cbs = []
      listeners.set(event, cbs)
    }
    cbs.push(callback)
    return () => off(event, callback)
  }

  function off(event: LifecycleEvent, callback: HookCallback): void {
    const cbs = listeners.get(event)
    if (cbs) {
      const idx = cbs.indexOf(callback)
      if (idx !== -1) cbs.splice(idx, 1)
    }
  }

  async function trigger(event: LifecycleEvent, model: ModelLike): Promise<void> {
    const cbs = listeners.get(event)
    if (cbs) {
      for (const cb of cbs) {
        await cb(model)
      }
    }
  }

  function clone(): HookManager {
    const cloned = createHookManager()
    for (const [event, cbs] of listeners) {
      for (const cb of cbs) {
        cloned.on(event, cb)
      }
    }
    return cloned
  }

  return { on, off, trigger, clone }
}
