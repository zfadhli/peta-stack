import { ModelNotRegisteredError } from "../errors.js"
import type { ModelDefinition } from "../model/types.js"

export function getPrimaryKeyColumn(def: ModelDefinition): string {
  const cols = def.columns as Record<string, unknown>
  for (const [name, col] of Object.entries(cols)) {
    if ((col as Record<string, unknown>).isPrimaryKey) return name
  }
  return "id"
}

export function getDb(def: ModelDefinition): any {
  if (!def._orm) throw new ModelNotRegisteredError(def.name)
  return (def._orm as any).kysely
}
