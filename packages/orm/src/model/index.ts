// Re-export all public types and functions

export { Attribute } from "./attribute.js"
export { applyCastsToData, castForSet, castValue, prepareForDb } from "./casts.js"
export type { ComputedColumn } from "./computed.js"
export {
  applyComputedColumnsAsync,
  computeAtRuntime,
  computeBatchAtRuntime,
  getComputedConfig,
  setComputedConfig,
  sqlComputed,
} from "./computed.js"
export { deleteModel, forceDeleteModel, restoreModel, trashedModel } from "./delete.js"
export { createInstance } from "./factory.js"
export {
  getHooksFor,
  getSoftDeleteConfig,
  hasSoftDelete,
  registerSoftDeletesFor,
  registerTimestampsFor,
} from "./hooks.js"
export { getModelDef, loadModelRelations, setModelDef } from "./relation.js"
export { getConfig, insertManyModel, insertModel, reloadModel, saveModel, setConfig, updateModel } from "./save.js"
export { addScope, getScopes, removeScope } from "./scopes.js"
export { modelToJSON } from "./serialize.js"
export type { ModelConfig, ModelDefinition, ModelInstance } from "./types.js"
export { FORBIDDEN_KEYS } from "./types.js"

import { createRelationQuery } from "../relations/related-query.js"
import { deleteModel, forceDeleteModel, restoreModel, trashedModel } from "./delete.js"
import { initRuntime } from "./runtime.js"
import { loadModelRelations } from "./relation.js"
import { reloadModel, saveModel } from "./save.js"
import { modelToJSON } from "./serialize.js"

initRuntime({
  saveModel,
  deleteModel,
  forceDeleteModel,
  restoreModel,
  trashedModel,
  reloadModel,
  modelToJSON,
  loadModelRelations,
  createRelationQuery,
})

export { defineModel } from "./define.js"
