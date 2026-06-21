import type { ORMLike } from "../types.js"

export interface PetaHonoMiddlewareOptions {
  peta: ORMLike
}

/**
 * Hono middleware that sets the ORM instance on the context.
 */
export function petaMiddleware(options: PetaHonoMiddlewareOptions) {
  return async (c: any, next: any) => {
    c.set("peta", options.peta)
    await next()
  }
}
