/**
 * peta-docs/hono — Hono framework adapter.
 *
 * Provides the RouteBuilder fluent API, a Hono route scanner,
 * and a filesystem-based route loader.
 *
 * @module
 */

export { loadRoutes } from "./loader.ts"
export type { PaginationOptions, ValidationErrorHandler } from "./route.ts"
export { getRouteMeta, RouteBuilder, route, setOnValidationError } from "./route.ts"
export { honoScanner } from "./scanner.ts"
