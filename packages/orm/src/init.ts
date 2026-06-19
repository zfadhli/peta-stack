/**
 * Create a lazy-initialized singleton factory.
 *
 * The factory function is called only once — on the first call to the returned
 * function. Subsequent calls return the same resolved promise. This avoids
 * module-level side effects: importing a model file won't trigger database
 * connection or schema initialization until the first explicit `await db()`.
 *
 * @example
 * ```ts
 * import { createClient } from "@libsql/client"
 * import { LibsqlDialect } from "@libsql/kysely-libsql"
 * import { createDb, createORM, defineModel, t } from "peta-orm"
 *
 * const User = defineModel("users", { columns: { ... } })
 *
 * async function setup() {
 *   const client = createClient({ url: "file:my-app.db" })
 *   await client.execute("CREATE TABLE IF NOT EXISTS users (...)") // schema init
 *   const orm = createORM({ dialect: new LibsqlDialect({ client }) })
 *   orm.registerAll(User)
 *   return orm
 * }
 *
 * export const db = createDb(setup)
 * // Usage: const orm = await db()
 * ```
 */
export function createDb<T>(factory: () => Promise<T>): () => Promise<T> {
  let promise: Promise<T> | null = null
  return () => {
    if (!promise) promise = factory()
    return promise
  }
}
