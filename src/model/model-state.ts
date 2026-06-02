import type { Model } from "./model"

export interface AttrState {
  attributes: Record<string, unknown>
  original: Record<string, unknown>
  relations: Record<string, unknown>
  exists: boolean
}

const STATE = new WeakMap<Model, AttrState>()

export function initState(model: Model): void {
  STATE.set(model, { attributes: {}, original: {}, relations: {}, exists: false })
}

export function getState(model: Model): AttrState {
  const s = STATE.get(model)
  if (!s) throw new Error("Model state not initialized")
  return s
}

// --- attributes ---

export function getAttr(model: Model, key: string): unknown {
  return getState(model).attributes[key]
}

export function setAttr(model: Model, key: string, value: unknown): void {
  getState(model).attributes[key] = value
}

export function fillAttrs(model: Model, data: Record<string, unknown>): void {
  const state = getState(model)
  const forbidden = new Set(["__proto__", "constructor", "prototype"])
  for (const [key, value] of Object.entries(data)) {
    if (forbidden.has(key)) continue
    state.attributes[key] = value
  }
}

export function getDirtyAttributes(model: Model): Record<string, unknown> {
  const state = getState(model)
  const dirty: Record<string, unknown> = {}
  for (const key of Object.keys(state.attributes)) {
    if (state.attributes[key] !== state.original[key]) {
      dirty[key] = state.attributes[key]
    }
  }
  return dirty
}

export function isDirty(model: Model): boolean {
  return Object.keys(getDirtyAttributes(model)).length > 0
}

export function resetAttrs(model: Model): void {
  const state = getState(model)
  state.attributes = { ...state.original }
}

export function syncOriginal(model: Model): void {
  const state = getState(model)
  state.original = { ...state.attributes }
}

// --- exists ---

export function getExists(model: Model): boolean {
  return getState(model).exists
}

export function setExists(model: Model, value: boolean): void {
  getState(model).exists = value
}

// --- relations ---

export function getRelation(model: Model, name: string): unknown {
  return getState(model).relations[name] ?? null
}

export function setRelation(model: Model, name: string, value: unknown): void {
  getState(model).relations[name] = value
}

export function hasRelation(model: Model, name: string): boolean {
  return name in getState(model).relations
}

export function relationData(model: Model): Record<string, unknown> {
  return { ...getState(model).relations }
}

// Exposed for serialization — returns the live reference, not a copy
export function getRawAttrs(model: Model): Record<string, unknown> {
  return getState(model).attributes
}

export function getRawRelations(model: Model): Record<string, unknown> {
  return getState(model).relations
}

export { STATE }
