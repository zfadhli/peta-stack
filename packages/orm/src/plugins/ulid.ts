import { ulid as generateUlid } from "ulid"
import type { Plugin } from "./index.js"

/**
 * Plugin that auto-generates ULID primary keys on `beforeCreate`.
 *
 * Requires the model's `id` column to be `t.string(26).primaryKey()`.
 *
 * @example
 * ```ts
 * const User = defineModel("users", {
 *   columns: { id: t.string(26).primaryKey() }
 * }).use(ulid())
 * ```
 */
export function ulid(): Plugin {
  return (def) => {
    def.on("beforeCreate", (model: any) => {
      if (!model.get("id")) model.set("id", generateUlid())
    })
  }
}
