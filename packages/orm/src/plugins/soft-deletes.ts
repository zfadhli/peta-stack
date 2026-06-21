import { isUniqueConstraintError, normalizeError } from "../errors.js"
import { getDb, getPrimaryKeyColumn } from "../lib/model-helpers.js"
import { registerSoftDeletesFor } from "../model/hooks.js"
import type { Plugin } from "./index.js"

/**
 * Plugin that enables soft-delete behavior on a model.
 * Sets `deletedAt` on delete, automatically filters out deleted records.
 *
 * ```ts
 * const User = defineModel('users', {
 *   columns: { deletedAt: t.timestamp().nullable() }
 * }).use(softDeletes())
 * ```
 */
export function softDeletes(opts?: { column?: string }): Plugin {
  const column = opts?.column ?? "deletedAt"

  return (def) => {
    // Register with the soft-delete system for query builder filtering
    registerSoftDeletesFor(def as any, column)

    // Override delete via beforeDelete instance hook to set deletedAt instead
    def.on("beforeDelete", async (model: any) => {
      const pk = getPrimaryKeyColumn(def)
      const pkValue = model.get(pk)
      if (pkValue == null) return

      const db = getDb(def)

      try {
        await db
          .updateTable(def.table)
          .set({ [column]: new Date().toISOString() })
          .where(pk, "=", pkValue)
          .execute()
      } catch (e) {
        // The record may already be deleted — that's fine
        if (!isUniqueConstraintError(e)) throw normalizeError(e, def.table)
      }
    })
  }
}
