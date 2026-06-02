import type { Model, ModelClass } from "./model"
import type { ModelQueryBuilder } from "../builder"

const GLOBAL_SCOPES = new WeakMap<object, Map<string, (qb: ModelQueryBuilder<any>) => void>>()

export function addScope(modelClass: ModelClass, name: string, callback: (qb: ModelQueryBuilder<any>) => void): void {
  let scopes = GLOBAL_SCOPES.get(modelClass)
  if (!scopes) {
    scopes = new Map()
    GLOBAL_SCOPES.set(modelClass, scopes)
  }
  scopes.set(name, callback)
}

export function removeScope(modelClass: ModelClass, name: string): void {
  const scopes = GLOBAL_SCOPES.get(modelClass)
  scopes?.delete(name)
}

export function getScopes(modelClass: ModelClass): Map<string, (qb: ModelQueryBuilder<any>) => void> {
  return GLOBAL_SCOPES.get(modelClass) ?? new Map()
}
