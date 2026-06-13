import type { ModelDefinition, ModelInstance } from "./types.js"
import type { RelationQuery } from "../relations/related-query.js"

export interface ModelRuntime {
  saveModel: (def: ModelDefinition, model: ModelInstance) => Promise<ModelInstance>
  deleteModel: (def: ModelDefinition, model: ModelInstance) => Promise<void>
  forceDeleteModel: (def: ModelDefinition, model: ModelInstance) => Promise<void>
  restoreModel: (def: ModelDefinition, model: ModelInstance) => Promise<void>
  trashedModel: (def: ModelDefinition, model: ModelInstance) => boolean
  reloadModel: (def: ModelDefinition, model: ModelInstance) => Promise<void>
  modelToJSON: (def: ModelDefinition, model: ModelInstance) => Record<string, unknown>
  loadModelRelations: (model: ModelInstance, def: ModelDefinition, ...relations: string[]) => Promise<void>
  createRelationQuery: (instance: ModelInstance, def: ModelDefinition, relationName: string) => RelationQuery
}

let runtime: ModelRuntime | null = null

export function initRuntime(fns: ModelRuntime): void {
  runtime = fns
}

export function getRuntime(): ModelRuntime {
  if (!runtime) throw new Error("Model runtime not initialized. Call initRuntime() first.")
  return runtime
}
