import { type Dialect, Kysely } from "kysely"
import { resolve } from "path"
import type { ModelClass } from "./model/model"
import type { PetaLike } from "./types"

export interface PetaConfig {
  dialect: Dialect
}

export function isModelClass(value: unknown): value is ModelClass {
  const v = value as { table?: unknown; columns?: unknown }
  return (
    typeof value === "function" &&
    typeof v.table === "string" &&
    v.table.length > 0 &&
    typeof v.columns === "object" &&
    v.columns !== null
  )
}

export class Peta implements PetaLike {
  readonly kysely: Kysely<any>
  readonly #models = new Map<string, ModelClass>()

  constructor(config: PetaConfig) {
    this.kysely = new Kysely<any>({ dialect: config.dialect })
  }

  register(modelClass: ModelClass): void {
    const table = modelClass.table
    if (!table) throw new Error(`Model ${modelClass.name} has no table name`)
    this.#models.set(table, modelClass)
    modelClass.peta = this
  }

  registerAll(...classes: ModelClass[]): void {
    if (classes.length === 1 && Array.isArray(classes[0])) {
      classes = classes[0]
    }
    for (const cls of classes) {
      this.register(cls)
    }
  }

  async discover(pattern: string): Promise<void> {
    const bunModule = await import("bun").catch(() => null)
    const Glob = bunModule?.Glob ?? null
    if (!Glob) {
      throw new Error("peta.discover() requires Bun — use peta.registerAll() directly in other runtimes")
    }
    for await (const file of new Glob(pattern).scan()) {
      const abs = resolve(file)
      const mod = await import(abs)
      for (const value of Object.values(mod as Record<string, unknown>)) {
        if (isModelClass(value)) {
          this.register(value)
        }
      }
    }
  }

  getModel(table: string): ModelClass | undefined {
    return this.#models.get(table)
  }

  get models(): Map<string, ModelClass> {
    return this.#models
  }

  async transaction<T>(fn: (kysely: Kysely<any>) => Promise<T>): Promise<T> {
    return await this.kysely.transaction().execute((trx) => fn(trx))
  }

  async destroy(): Promise<void> {
    for (const [, cls] of this.#models) {
      cls.peta = null
    }
    this.#models.clear()
    await this.kysely.destroy()
  }
}
