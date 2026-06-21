/**
 * peta-docs/elysia — Elysia framework adapter.
 *
 * Provides an Elysia route scanner for `getOpenAPISpec()`.
 * Uses the same RouteBuilder fluent API from the Hono adapter.
 *
 * Pass `elysiaScanner` explicitly to `getOpenAPISpec(app, info, elysiaScanner)`.
 *
 * @module
 */

export { elysiaScanner } from "./scanner.ts"
