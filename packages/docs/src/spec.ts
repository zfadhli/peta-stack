import type { RouteScanner } from "./scanner.ts"
import type { InfoObject, OpenAPIObject } from "./types.ts"
import { buildOpenAPISpec } from "./spec/builder.ts"

export { buildOpenAPISpec } from "./spec/builder.ts"
export { toOpenAPISchema } from "./spec/schema.ts"

let _defaultScanner: RouteScanner | null = null

/**
 * Register a default scanner for `getOpenAPISpec`.
 * Called automatically by framework adapter modules (e.g., `peta-docs/hono`).
 */
export function setDefaultScanner(scanner: RouteScanner): void {
  _defaultScanner = scanner
}

export function getOpenAPISpec(
  app: unknown,
  info: InfoObject,
  scanner?: RouteScanner,
  options?: { basePath?: string; components?: Record<string, unknown> },
): OpenAPIObject {
  const active = scanner ?? _defaultScanner
  if (!active) {
    throw new Error(
      "No RouteScanner provided. Pass one explicitly or import from 'peta-docs/hono' which registers " +
        "a default scanner.",
    )
  }
  return buildOpenAPISpec(active.scan(app), info, options)
}
