import type { QueryBuilder } from "../query/index.js"
import type { ModelDefinition } from "./types.js"

const globalScopes = new WeakMap<ModelDefinition, Map<string, (qb: QueryBuilder) => void>>()

export function addScope(def: ModelDefinition, name: string, callback: (qb: QueryBuilder) => void): void {
  let scopes = globalScopes.get(def)
  if (!scopes) {
    scopes = new Map()
    globalScopes.set(def, scopes)
  }
  scopes.set(name, callback)
}

export function removeScope(def: ModelDefinition, name: string): void {
  globalScopes.get(def)?.delete(name)
}

export function getScopes(def: ModelDefinition): Map<string, (qb: QueryBuilder) => void> | undefined {
  return globalScopes.get(def)
}
