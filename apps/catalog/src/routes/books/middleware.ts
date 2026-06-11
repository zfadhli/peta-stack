import type { MiddlewareHandler } from "hono"

/**
 * Middleware that requires an active session (user must be logged in).
 * Returns 401 if no session or no userId in session.
 */
export function requireSession(): MiddlewareHandler {
  return async (c, next) => {
    const session = (c.var as Record<string, unknown>).session as { userId?: number } | undefined
    if (!session?.userId) {
      return c.json({ error: "Unauthorized" }, 401)
    }
    await next()
  }
}

/**
 * Middleware that requires a specific user role.
 * Must be used after requireSession().
 */
export function requireRole(role: string): MiddlewareHandler {
  return async (c, next) => {
    const session = (c.var as Record<string, unknown>).session as { userRole?: string } | undefined
    if (session?.userRole !== role) {
      return c.json({ error: "Forbidden" }, 403)
    }
    await next()
  }
}
