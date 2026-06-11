import type { Kysely } from "kysely"
import type { ModelId } from "./lib/id.js"

export interface ModelLike {
  readonly instanceId: number
  get<T = unknown>(key: string): T
  set(key: string, value: unknown): void
}

export interface PetaLike {
  readonly kysely: Kysely<Record<string, never>>
  register(modelDef: { table: string; name: string; columns: Record<string, unknown>; _peta: PetaLike | null }): void
  registerAll(
    ...classes: { table: string; name: string; columns: Record<string, unknown>; _peta: PetaLike | null }[]
  ): void
  discover(pattern: string): Promise<void>
  getModel(table: string): { table: string; name: string; _peta: PetaLike | null } | undefined
  readonly models: Map<string, { table: string; name: string; _peta: PetaLike | null }>
  transaction<T>(fn: (kysely: Kysely<Record<string, never>>) => Promise<T>): Promise<T>
  destroy(): Promise<void>
}

export type { ModelId }
