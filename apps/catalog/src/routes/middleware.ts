import type { MiddlewareHandler } from "hono"

export function requireSession(): MiddlewareHandler {
  return async (c, next) => {
    if (!c.var.session?.userId) return c.json({ error: "Unauthorized" }, 401)
    await next()
  }
}

export function requireRole(role: string): MiddlewareHandler {
  return async (c, next) => {
    if (c.var.session?.userRole !== role) return c.json({ error: "Forbidden" }, 403)
    await next()
  }
}
