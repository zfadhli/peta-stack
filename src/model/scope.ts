import type { QueryBuilder } from "../builder/query.js"
import type { ModelDefinition } from "./index.js"

const SCOPES = new WeakMap<ModelDefinition, Map<string, ScopeCallback>>()
export type ScopeCallback = (qb: QueryBuilder) => void

export function addScope(def: ModelDefinition, name: string, callback: ScopeCallback): void {
  let scopes = SCOPES.get(def)
  if (!scopes) {
    scopes = new Map()
    SCOPES.set(def, scopes)
  }
  scopes.set(name, callback)
}
export function removeScope(def: ModelDefinition, name: string): void {
  SCOPES.get(def)?.delete(name)
}
export function getScopes(def: ModelDefinition): Map<string, ScopeCallback> {
  return SCOPES.get(def) ?? new Map()
}
