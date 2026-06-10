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
  const hooks = new Map<LifecycleEvent, HookCallback[]>()

  function on(event: LifecycleEvent, callback: HookCallback): () => void {
    const list = hooks.get(event)
    if (list) {
      list.push(callback)
    } else {
      hooks.set(event, [callback])
    }
    return () => off(event, callback)
  }

  function off(event: LifecycleEvent, callback: HookCallback): void {
    const list = hooks.get(event)
    if (!list) return
    const idx = list.indexOf(callback)
    if (idx !== -1) list.splice(idx, 1)
  }

  async function trigger(event: LifecycleEvent, model: ModelLike): Promise<void> {
    const list = hooks.get(event)
    if (!list) return
    for (const cb of list) await cb(model)
  }

  function clone(): HookManager {
    const mgr = createHookManager()
    for (const [event, callbacks] of hooks) {
      for (const cb of callbacks) mgr.on(event, cb)
    }
    return mgr
  }

  return { on, off, trigger, clone }
}
