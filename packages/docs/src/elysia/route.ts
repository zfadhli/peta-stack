/**
 * Elysia route builder.
 *
 * Re-exports the Hono `route()` function. The `RouteBuilder` attaches
 * OpenAPI metadata to handlers via the `OPENAPI_META` symbol, which
 * `elysiaScanner` reads via `getRouteMeta()`.
 *
 * @module
 */

export { route as elysiaRoute } from "../hono/route.ts"
