/**
 * peta-docs/hono — Hono framework adapter.
 *
 * Provides the RouteBuilder fluent API, a Hono route scanner,
 * and a filesystem-based route loader.
 *
 * Importing this module also registers the Hono scanner as the
 * default scanner for `getOpenAPISpec()`.
 *
 * @module
 */

import { setDefaultScanner } from "../spec.ts"
import { honoScanner } from "./scanner.ts"

// Register the Hono scanner as the default for getOpenAPISpec
setDefaultScanner(honoScanner)

export { createHonoDocsApp, type HonoDocsConfig } from "./create-app.ts"
export { loadRoutes } from "./loader.ts"
export type { PaginationOptions, ValidationErrorHandler } from "./route.ts"
export { getRouteMeta, RouteBuilder, route, setOnValidationError } from "./route.ts"
export { honoScanner } from "./scanner.ts"
