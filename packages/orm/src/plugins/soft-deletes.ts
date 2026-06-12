import type { Plugin } from "./index.js"

// Lazy-loaded module references
let _hooksMod: any = null
async function getHooksMod() {
  if (!_hooksMod) _hooksMod = await import("../model/hooks.js")
  return _hooksMod
}

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
    getHooksMod().then((mod) => mod.registerSoftDeletesFor(def as any, column))

    // Override delete via beforeDelete instance hook to set deletedAt instead
    def.on("beforeDelete", async (model: any) => {
      const pk = getPrimaryKeyColumn(def)
      const pkValue = model.get(pk)
      if (pkValue == null) return

      const db = (def._orm as any)?.kysely
      if (!db) return

      try {
        await db
          .updateTable(def.table)
          .set({ [column]: new Date().toISOString() })
          .where(pk, "=", pkValue)
          .execute()
      } catch {
        // Soft delete fails silently — the record may already be deleted
      }
    })
  }
}

function getPrimaryKeyColumn(def: any): string {
  const cols = def.columns as Record<string, any>
  for (const [name, col] of Object.entries(cols)) {
    if (col.isPrimaryKey) return name
  }
  return "id"
}
