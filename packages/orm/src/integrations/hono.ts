import type { Context, Next } from "hono"
import type { PetaLike } from "../types.js"

export interface PetaHonoMiddlewareOptions {
  peta: PetaLike
}

export function petaMiddleware(options: PetaHonoMiddlewareOptions) {
  const { peta } = options
  return async function petaMiddleware(c: Context, next: Next): Promise<void> {
    c.set("peta", peta)
    await next()
  }
}

export { petaMiddleware as createMiddleware }
