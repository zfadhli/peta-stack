import type { RouteEntry } from "./types.ts"

/**
 * Scans a framework app instance and extracts registered routes.
 *
 * Each framework adapter implements this interface to bridge the
 * framework-specific route registry to the generic OpenAPI pipeline.
 */
export interface RouteScanner {
  scan(app: unknown): RouteEntry[]
}
