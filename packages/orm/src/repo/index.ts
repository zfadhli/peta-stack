import type { ModelDefinition } from "../model/types.js"
import type { QueryBuilder } from "../query/index.js"

// ─── METHOD DEFINITION TYPES ─────────────────────────────────

export type QueryMethod = (qb: QueryBuilder, ...args: any[]) => QueryBuilder

export interface RepoMethods {
  queryMethods?: Record<string, QueryMethod>
  methods?: Record<string, (...args: any[]) => any>
}

// ─── CREATE REPO ──────────────────────────────────────────────

/**
 * Create a repository — a composable set of chainable query methods.
 *
 * ```ts
 * const userRepo = createRepo(User, {
 *   queryMethods: {
 *     search(q, query: string) {
 *       return q.where('name', 'like', `%${query}%`)
 *     },
 *   },
 * })
 * const users = await userRepo.search('john').paginate(1, 20)
 * ```
 */
export function createRepo<TMethods extends RepoMethods>(model: ModelDefinition, methods: TMethods) {
  const customMethods = new Map<string, QueryMethod>()
  if (methods.queryMethods) {
    for (const [name, fn] of Object.entries(methods.queryMethods)) {
      customMethods.set(name, fn)
    }
  }

  /**
   * Wrap a QueryBuilder so custom methods are available for chaining.
   * Custom methods operate on the CURRENT QB (not a fresh one), so
   * chaining carries forward previous conditions.
   */
  function wrapQB(qb: QueryBuilder): any {
    return new Proxy(qb, {
      get(target: any, prop: string | symbol) {
        if (typeof prop === "string") {
          if (customMethods.has(prop)) {
            const fn = customMethods.get(prop)!
            return (...args: any[]) => {
              const result = fn(target, ...args)
              return wrapQB(result)
            }
          }
          if (methods.methods?.[prop]) {
            return (...args: any[]) => (methods.methods![prop] as Function)(...args)
          }
        }
        const val = target[prop]
        if (typeof val === "function") {
          return function (this: any, ...args: any[]) {
            const result = val.apply(target, args)
            return result === target ? wrapQB(result) : result
          }
        }
        return val
      },
    })
  }

  // The repo itself — each property access creates a fresh chain
  const repoProxy = new Proxy({} as any, {
    get(_target: any, prop: string | symbol) {
      if (typeof prop === "string") {
        if (customMethods.has(prop)) {
          const fn = customMethods.get(prop)!
          return (...args: any[]) => {
            const qb = model.query()
            const result = fn(qb, ...args)
            return wrapQB(result)
          }
        }
        if (methods.methods?.[prop]) {
          return (...args: any[]) => (methods.methods![prop] as Function)(...args)
        }
      }
      // Fall through: return a wrapped fresh QB so standard QB methods work
      const qb = model.query()
      const val = (qb as any)[prop]
      if (typeof val === "function") {
        return (...args: any[]) => {
          const result = val.apply(qb, args)
          return wrapQB(result)
        }
      }
      return val
    },
  })

  return repoProxy
}
