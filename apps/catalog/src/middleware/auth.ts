import type { MiddlewareHandler } from "hono"
import { http } from "./http-error.js"

export function requireSession(): MiddlewareHandler {
  return async (c, next) => {
    if (!c.var.session?.userId) throw http.unauthorized()
    await next()
  }
}

export function requireRole(role: string): MiddlewareHandler {
  return async (c, next) => {
    if (c.var.session?.userRole !== role) throw http.forbidden()
    await next()
  }
}
