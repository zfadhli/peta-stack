import type { RouteScanner } from "./scanner.ts"
import { buildOpenAPISpec } from "./spec/builder.ts"
import type { InfoObject, OpenAPIObject } from "./types.ts"

export { buildOpenAPISpec } from "./spec/builder.ts"
export { toOpenAPISchema } from "./spec/schema.ts"

let _defaultScanner: RouteScanner | null = null

/** @deprecated Import 'peta-docs/hono' which auto-registers the Hono scanner. Pass the scanner as the 3rd argument to getOpenAPISpec instead. */
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
      "No RouteScanner provided. Import 'peta-docs/hono' or pass a scanner explicitly.",
    )
  }
  return buildOpenAPISpec(active.scan(app), info, options)
}
