import { Hono } from "hono"
import type { RouteScanner } from "../scanner.ts"
import { honoScanner } from "./scanner.ts"

export interface HonoDocsConfig {
  app: Hono
  scanner: RouteScanner
}

export function createHonoDocsApp(app?: Hono): HonoDocsConfig {
  return {
    app: app ?? new Hono(),
    scanner: honoScanner,
  }
}
