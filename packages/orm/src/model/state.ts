import type { ModelInstance } from "./types.js"

export interface AttrState {
  attributes: Record<string, unknown>
  original: Record<string, unknown>
  relations: Record<string, unknown>
  exists: boolean
}

const STATE = new WeakMap<ModelInstance, AttrState>()

export function initState(instance: ModelInstance, data: Record<string, unknown>, exists: boolean): void {
  STATE.set(instance, {
    attributes: { ...data },
    original: { ...data },
    relations: {},
    exists,
  })
}

export function getState(instance: ModelInstance): AttrState {
  const s = STATE.get(instance)
  if (!s) throw new Error("Model instance state not initialized")
  return s
}

export function getAttr(instance: ModelInstance, key: string): unknown {
  return getState(instance).attributes[key]
}

export function setAttr(instance: ModelInstance, key: string, value: unknown): void {
  getState(instance).attributes[key] = value
}

export function fillAttrs(instance: ModelInstance, data: Record<string, unknown>): void {
  const state = getState(instance)
  for (const [key, value] of Object.entries(data)) {
    state.attributes[key] = value
  }
}

export function getDirtyAttributes(instance: ModelInstance): Record<string, unknown> {
  const state = getState(instance)
  const dirty: Record<string, unknown> = {}
  for (const key of Object.keys(state.attributes)) {
    if (state.attributes[key] !== state.original[key]) {
      dirty[key] = state.attributes[key]
    }
  }
  return dirty
}

export function isDirty(instance: ModelInstance, key?: string): boolean {
  const state = getState(instance)
  if (key !== undefined) {
    return state.attributes[key] !== state.original[key]
  }
  for (const k of Object.keys(state.attributes)) {
    if (state.attributes[k] !== state.original[k]) return true
  }
  return false
}

export function resetAttrs(instance: ModelInstance): void {
  const state = getState(instance)
  state.attributes = { ...state.original }
}

export function syncOriginal(instance: ModelInstance): void {
  const state = getState(instance)
  state.original = { ...state.attributes }
}

export function getExists(instance: ModelInstance): boolean {
  return getState(instance).exists
}

export function setExists(instance: ModelInstance, value: boolean): void {
  getState(instance).exists = value
}

export function getRawRelations(instance: ModelInstance): Record<string, unknown> {
  return getState(instance).relations
}
