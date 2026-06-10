import type { RouteScanner } from "../scanner.ts"
import type { RouteEntry } from "../types.ts"
import { getRouteMeta } from "./route.ts"

function routeProp(obj: unknown, key: string): unknown {
  if (obj == null) return undefined
  return (obj as Record<string, unknown>)[key]
}

/**
 * Scans a Hono app instance and extracts route metadata.
 *
 * Relies on Hono's internal `app.routes` array. If that structure
 * changes in a future Hono version, this scanner will warn and
 * return an empty array.
 */
export const honoScanner: RouteScanner = {
  scan(app: unknown): RouteEntry[] {
    const entries: RouteEntry[] = []

    const raw = routeProp(app, "routes")
    if (!Array.isArray(raw)) {
      console.warn(
        `[peta-docs] honoScanner: expected app.routes to be an array, got ${typeof raw}. ` +
          "Is this a Hono app? Provide a custom RouteScanner for other frameworks.",
      )
      return entries
    }

    for (const r of raw) {
      const handler = routeProp(r, "handler")
      const meta = typeof handler === "function" ? getRouteMeta(handler) : undefined
      if (meta) {
        const path = typeof routeProp(r, "path") === "string" ? String(routeProp(r, "path")) : ""
        const method = typeof routeProp(r, "method") === "string" ? String(routeProp(r, "method")) : ""
        entries.push({ path, method, config: meta })
      }
    }

    return entries
  },
}
