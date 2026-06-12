import type { Plugin } from "./index.js"

/**
 * Plugin that automatically sets `createdAt` and `updatedAt` timestamps.
 *
 * ```ts
 * const User = defineModel('users', { columns: { ...t.timestamps() } })
 *   .use(timestamps())
 * ```
 */
export function timestamps(opts?: {
  createdAt?: string
  updatedAt?: string
}): Plugin {
  const createdAtCol = opts?.createdAt ?? "createdAt"
  const updatedAtCol = opts?.updatedAt ?? "updatedAt"

  return (def) => {
    def.on("beforeCreate", (model: any) => {
      const now = new Date().toISOString()
      if (!model.get(createdAtCol)) model.set(createdAtCol, now)
      model.set(updatedAtCol, now)
    })
    def.on("beforeUpdate", (model: any) => {
      model.set(updatedAtCol, new Date().toISOString())
    })
  }
}
