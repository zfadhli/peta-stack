import type { Database } from "../lib/kysely.js"
import type { ModelDefinition, ModelInstance } from "../model/index.js"
import type { PetaLike } from "../types.js"

export interface UpdateBuilder {
  execute(id: number | string, data: Record<string, unknown>): Promise<ModelInstance>
}

export function createUpdateBuilder(def: ModelDefinition, peta: PetaLike, kyselyOverride?: Database): UpdateBuilder {
  const db = kyselyOverride ?? peta.kysely
  return {
    async execute(id: number | string, data: Record<string, unknown>): Promise<ModelInstance> {
      await db
        .updateTable(def.table)
        .set(data)
        .where("id", "=", id as never)
        .execute()
      const row = await db
        .selectFrom(def.table)
        .selectAll()
        .where("id", "=", id as never)
        .executeTakeFirst()
      return def._hydrate(row ?? data)
    },
  }
}
