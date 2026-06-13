import { type } from "arktype"
import { Hono } from "hono"
import { loadRoutes } from "../src/hono/index.js"
import { getRouteMeta, route, setOnValidationError } from "../src/hono/route.js"
import { honoScanner } from "../src/hono/scanner.js"
import { serveScalarUI } from "../src/scalar.js"
import type { RouteScanner } from "../src/scanner.js"
import { buildOpenAPISpec, getOpenAPISpec } from "../src/spec.js"
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs"

export { describe, expect, it } from "bun:test"

export { type, Hono, loadRoutes, getRouteMeta, route, setOnValidationError, honoScanner, serveScalarUI, buildOpenAPISpec, getOpenAPISpec }
export type { RouteScanner }

/** Create a symlink to node_modules for filesystem test fixtures. */
export function linkNodeModules(dir: string) {
  try {
    symlinkSync(`${process.cwd()}/node_modules`, `${dir}/node_modules`)
  } catch {}
}

/** Helper: create a Hono app with a documented GET route. */
export function createDocApp() {
  const app = new Hono()
  app.get(
    "/pets",
    route()
      .summary("List pets")
      .response(200, { description: "OK" })
      .handle(() => new Response()),
  )
  return app
}

export { mkdirSync, writeFileSync }
