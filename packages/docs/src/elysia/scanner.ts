import { getRouteMeta } from "../hono/route.ts"
import type { RouteEntry, RouteScanner } from "../types.ts"

/**
 * Scans an Elysia app instance and extracts route metadata.
 *
 * Relies on Elysia's internal `app.router.history` array. If that structure
 * changes in a future Elysia version, this scanner will warn and
 * return an empty array.
 */
export const elysiaScanner: RouteScanner = {
  scan(app: unknown): RouteEntry[] {
    const entries: RouteEntry[] = []
    if (app == null) return entries

    const router = (app as Record<string, unknown>).router as Record<string, unknown> | undefined
    const rawRoutes = router?.history as unknown[] | undefined

    if (!Array.isArray(rawRoutes)) {
      console.warn(
        "[peta-docs] elysiaScanner: expected app.router.history to be an array, got " +
          typeof rawRoutes +
          ". Is this an Elysia app? Provide a custom RouteScanner for other frameworks.",
      )
      return entries
    }

    for (const r of rawRoutes) {
      const rec = r as Record<string, unknown>
      const handler = rec.handler as unknown
      const meta = typeof handler === "function" ? getRouteMeta(handler) : undefined
      if (meta) {
        const path = typeof rec.path === "string" ? String(rec.path) : ""
        const method = typeof rec.method === "string" ? String(rec.method) : ""
        entries.push({ path, method, config: meta })
      }
    }

    return entries
  },
}
