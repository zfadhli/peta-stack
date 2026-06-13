import type { MiddlewareHandler } from "hono"
import { http } from "./http-error.js"

const ROLE_LEVELS: Record<string, number> = { admin: 3, author: 2, user: 1 }

export function requireSession(): MiddlewareHandler {
  return async (c, next) => {
    if (!c.var.session?.userId) throw http.unauthorized()
    await next()
  }
}

export function requireRole(minRole: "admin" | "author" | "user"): MiddlewareHandler {
  return async (c, next) => {
    const userLevel = ROLE_LEVELS[c.var.session?.userRole ?? ""] ?? 0
    const requiredLevel = ROLE_LEVELS[minRole] ?? 0
    if (userLevel < requiredLevel) throw http.forbidden()
    await next()
  }
}
