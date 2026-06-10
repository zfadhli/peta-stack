import { resolve } from "node:path"
import { type Dialect, Kysely } from "kysely"
import type { ModelDefinition } from "../model/index.js"
import type { PetaLike } from "../types.js"

export interface PetaConfig {
  dialect: Dialect
}

export function createPeta(config: PetaConfig): PetaLike {
  const kysely = new Kysely<Record<string, never>>({ dialect: config.dialect })
  const models = new Map<string, ModelDefinition>()
  function isModelClass(value: unknown): value is ModelDefinition {
    return (
      typeof value === "object" &&
      value !== null &&
      "table" in value &&
      typeof (value as Record<string, unknown>).table === "string"
    )
  }
  function register(modelDef: ModelDefinition): void {
    const table = modelDef.table
    if (!table) throw new Error(`Model ${modelDef.name} has no table name`)
    models.set(table, modelDef)
    modelDef._peta = peta as never
  }
  function registerAll(...classes: ModelDefinition[]): void {
    if (classes.length === 1 && Array.isArray(classes[0])) classes = classes[0]
    for (const cls of classes) register(cls)
  }
  async function discover(pattern: string): Promise<void> {
    const bunModule = await import("bun").catch(() => null)
    const Glob = bunModule?.Glob ?? null
    if (!Glob) throw new Error("peta.discover() requires Bun — use peta.registerAll() directly in other runtimes")
    for await (const file of new Glob(pattern).scan()) {
      const mod = await import(resolve(file))
      for (const value of Object.values(mod as Record<string, unknown>)) {
        if (isModelClass(value as never)) register(value as ModelDefinition)
      }
    }
  }
  function getModel(table: string): ModelDefinition | undefined {
    return models.get(table)
  }
  async function transaction<T>(fn: (kysely: Kysely<Record<string, never>>) => Promise<T>): Promise<T> {
    return await kysely.transaction().execute((trx) => fn(trx))
  }
  async function destroy(): Promise<void> {
    for (const [, cls] of models) cls._peta = null
    models.clear()
    await kysely.destroy()
  }
  const peta: PetaLike = {
    get kysely() {
      return kysely
    },
    register: register as never,
    registerAll: registerAll as never,
    discover: discover as never,
    getModel: getModel as never,
    get models() {
      return models as never
    },
    transaction: transaction as never,
    destroy,
  }
  return peta
}
