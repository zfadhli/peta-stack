import type { ModelInstance } from "./index.js"

export interface AttrState {
  attributes: Record<string, unknown>
  original: Record<string, unknown>
  relations: Record<string, unknown>
  exists: boolean
}

const STATE = new WeakMap<ModelInstance, AttrState>()

export function initState(model: ModelInstance): void {
  STATE.set(model, { attributes: {}, original: {}, relations: {}, exists: false })
}

export function getState(model: ModelInstance): AttrState {
  const s = STATE.get(model)
  if (!s) throw new Error("Model state not initialized")
  return s
}

export function getAttr(model: ModelInstance, key: string): unknown {
  return getState(model).attributes[key]
}
export function setAttr(model: ModelInstance, key: string, value: unknown): void {
  getState(model).attributes[key] = value
}
export function fillAttrs(model: ModelInstance, data: Record<string, unknown>): void {
  const state = getState(model)
  const forbidden = new Set(["__proto__", "constructor", "prototype"])
  for (const [key, value] of Object.entries(data)) {
    if (forbidden.has(key)) continue
    state.attributes[key] = value
  }
}
export function getDirtyAttributes(model: ModelInstance): Record<string, unknown> {
  const state = getState(model)
  const dirty: Record<string, unknown> = {}
  for (const key of Object.keys(state.attributes)) {
    if (state.attributes[key] !== state.original[key]) dirty[key] = state.attributes[key]
  }
  return dirty
}
export function isDirty(model: ModelInstance): boolean {
  return Object.keys(getDirtyAttributes(model)).length > 0
}
export function resetAttrs(model: ModelInstance): void {
  const state = getState(model)
  state.attributes = { ...state.original }
}
export function syncOriginal(model: ModelInstance): void {
  const state = getState(model)
  state.original = { ...state.attributes }
}
export function getExists(model: ModelInstance): boolean {
  return getState(model).exists
}
export function setExists(model: ModelInstance, value: boolean): void {
  getState(model).exists = value
}
export function getRawRelations(model: ModelInstance): Record<string, unknown> {
  return getState(model).relations
}
export { STATE }
