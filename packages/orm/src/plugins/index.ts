import type { ModelDefinition } from "../model/types.js"

/**
 * A plugin is a function that receives a model definition and can
 * modify it by adding hooks, scopes, columns, or methods.
 *
 * ```ts
 * const myPlugin = (options?: MyOptions): Plugin =>
 *   (def) => {
 *     def.addGlobalScope?.('active', (q) => q.where('active', true))
 *     return def
 *   }
 * ```
 */
export type Plugin = (def: ModelDefinition) => undefined | ModelDefinition
