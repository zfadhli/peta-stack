import type { Context, MiddlewareHandler } from "hono"
import { honoScanner, route } from "../src/hono/index.js"
import { buildOpenAPISpec, getOpenAPISpec } from "../src/index.js"
import type { OpenAPIObject, RouteEntry, RouteScanner } from "../src/types.js"

type AssertEqual<T, U> = [T] extends [U] ? ([U] extends [T] ? true : false) : false
type Expect<T extends true> = T

// 1. route().handle returns a MiddlewareHandler
const _handler = route()
  .response(200, { description: "OK" })
  .handle((_c: Context) => new Response("ok"))
type _HandlerType = Expect<AssertEqual<typeof _handler, MiddlewareHandler>>

// 2. buildOpenAPISpec returns OpenAPIObject
const _spec = buildOpenAPISpec([], { title: "T", version: "1.0.0" })
type _SpecType = Expect<AssertEqual<typeof _spec, OpenAPIObject>>

// 3. getOpenAPISpec returns OpenAPIObject
const _specFromScanner = getOpenAPISpec(null, { title: "T", version: "1.0.0" }, { scan: () => [] })
type _ScannerSpecType = Expect<AssertEqual<typeof _specFromScanner, OpenAPIObject>>

// 4. honoScanner.scan returns RouteEntry[]
const _scanResult = honoScanner.scan({ routes: [] })
type _ScanResultType = Expect<AssertEqual<typeof _scanResult, RouteEntry[]>>

// 5. RouteScanner is structurally typed
const _customScanner: RouteScanner = { scan: () => [] }

import { type } from "arktype"

// 6. .filter() types c.req.valid("query") without casts
const _qf = route()
  .filter("status", type("'active'|'inactive'"))
  .response(200, { description: "OK" })
  .handle((c) => {
    const q: { status?: "active" | "inactive" } = c.req.valid("query")
    return c.json(q)
  })

// 7. .filter() with operators types __-suffixed fields
const _qo = route()
  .filter("price", type("number"), { operators: ["gte", "lte"] })
  .response(200, { description: "OK" })
  .handle((c) => {
    const q: { price__gte?: number; price__lte?: number } = c.req.valid("query")
    return c.json(q)
  })

// 8. .sort() types c.req.valid("query").sort
const _qs = route()
  .sort(["name"])
  .response(200, { description: "OK" })
  .handle((c) => {
    const q: { sort?: string[] } = c.req.valid("query")
    return c.json(q)
  })

// 9. .filter() + .sort() + .paginated() merges all query types
const _qc = route()
  .filter("status", type("'active'|'inactive'"))
  .sort(["name"])
  .paginated()
  .response(200, { description: "OK" })
  .handle((c) => {
    const q: {
      status?: "active" | "inactive"
      sort?: string[]
      page: number
      limit: number
      offset: number
    } = c.req.valid("query")
    return c.json(q)
  })
