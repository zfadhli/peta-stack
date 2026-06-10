import type { Database } from "../lib/kysely.js"
import type { ModelDefinition } from "../model/index.js"
import type { PetaLike } from "../types.js"

export interface DeleteBuilder {
  execute(id: number | string): Promise<void>
}

export function createDeleteBuilder(def: ModelDefinition, peta: PetaLike, kyselyOverride?: Database): DeleteBuilder {
  const db = kyselyOverride ?? peta.kysely
  return {
    async execute(id: number | string): Promise<void> {
      await db
        .deleteFrom(def.table)
        .where("id", "=", id as never)
        .execute()
    },
  }
}
