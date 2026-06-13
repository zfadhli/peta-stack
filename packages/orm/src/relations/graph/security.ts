import { RelationNotAllowedError } from "../../errors.js"
import type { ModelDefinition } from "../../model/types.js"
import type { InsertGraphOptions } from "./types.js"

export function isRelationAllowed(relName: string, allowedSet: Set<string>): boolean {
  const parts = relName.split(".")
  for (let i = 0; i < parts.length; i++) {
    if (allowedSet.has(parts.slice(0, i + 1).join("."))) {
      return true
    }
  }
  return false
}

export function isRelPathAllowed(relName: string, option: boolean | string[] | undefined): boolean {
  if (option === undefined || option === false) return false
  if (option === true) return true
  return option.includes(relName)
}

/**
 * Resolve allowGraph from options (supports both string[] and Set<string>).
 */
export function resolveAllowGraph(options: InsertGraphOptions): Set<string> | undefined {
  if (!options.allowGraph) return undefined
  return options.allowGraph instanceof Set ? options.allowGraph : new Set(options.allowGraph)
}

/**
 * Assert that a relation path is allowed by the allowGraph set.
 * Throws RelationNotAllowedError if the path is not permitted.
 * Does nothing if allowedSet is undefined (no restriction).
 */
export function assertRelationAllowed(def: ModelDefinition, fullPath: string, allowedSet: Set<string> | undefined): void {
  if (!allowedSet || allowedSet.size === 0) return
  if (!isRelationAllowed(fullPath, allowedSet)) {
    throw new RelationNotAllowedError(def.name, fullPath)
  }
}

/**
 * Build the full dotted path for a nested relation.
 * If parentPath is empty, returns just relName. Otherwise parentPath + "." + relName.
 */
export function joinPath(parentPath: string, relName: string): string {
  return parentPath ? `${parentPath}.${relName}` : relName
}

export function relNameFromPath(path: string): string {
  const parts = path.split(".")
  return parts[parts.length - 1] ?? ""
}
