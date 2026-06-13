import type { Context, MiddlewareHandler } from "hono"
import { verifyToken } from "../lib/jwt.js"

/**
 * Middleware that extracts and verifies the JWT token from the
 * `Authorization: Token <jwt>` header. Sets `c.var.currentUserId`
 * and `c.var.currentUsername` if valid.
 *
 * This middleware does NOT fail if the token is missing or invalid —
 * it simply leaves the context vars undefined, allowing per-route
 * opt-in protection via `requireAuth()`.
 */
export function resolveUser(): MiddlewareHandler {
  return async (c, next) => {
    const header = c.req.header("Authorization")
    if (header?.startsWith("Token ")) {
      const token = header.slice(6).trim()
      const payload = await verifyToken(token)
      if (payload) {
        c.set("currentUserId", payload.userId)
        c.set("currentUsername", payload.username)
      }
    }
    await next()
  }
}

/**
 * Middleware that requires a valid JWT token. Must be used after
 * `resolveUser()`. Returns 401 if no user is resolved.
 */
export function requireAuth(): MiddlewareHandler {
  return async (c, next) => {
    const userId = c.var.currentUserId
    if (!userId) {
      return c.json({ errors: { token: ["is missing"] } }, 401)
    }
    await next()
  }
}

/**
 * Helper: check if a user is authenticated. Returns the current user's
 * ID or undefined. Useful for auth-optional endpoints.
 */
export function getCurrentUserId(c: Context): string | undefined {
  return c.var.currentUserId
}
