import { describe, expect, it } from "bun:test"
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs"
import { type } from "arktype"
import { Hono } from "hono"
import { loadRoutes } from "../src/hono/index.js"
import { getRouteMeta, route, setOnValidationError } from "../src/hono/route.js"
import { honoScanner } from "../src/hono/scanner.js"

import { serveScalarUI } from "../src/scalar.js"
import type { RouteScanner } from "../src/scanner.js"
import { buildOpenAPISpec, getOpenAPISpec } from "../src/spec.js"

function linkNodeModules(dir: string) {
  try {
    symlinkSync(`${process.cwd()}/node_modules`, `${dir}/node_modules`)
  } catch {}
}

// ---------------------------------------------------------------------------
// route.ts
// ---------------------------------------------------------------------------
describe("route()", () => {
  it("attaches metadata to the handler", () => {
    const handler = route()
      .summary("Test route")
      .response(200, { description: "OK" })
      .handle(() => new Response("ok"))

    const meta = getRouteMeta(handler)
    expect(meta).toBeDefined()
    expect(meta!.summary).toBe("Test route")
  })

  it("handler still works when called", async () => {
    const handler = route()
      .response(200, { description: "OK" })
      .handle(() => new Response("called"))

    const res = await handler({ req: { valid: () => undefined } } as any, async () => {})
    expect(res).toBeInstanceOf(Response)
  })

  it("returns undefined for plain functions", () => {
    expect(getRouteMeta(() => {})).toBeUndefined()
  })

  it("returns undefined for non-functions", () => {
    expect(getRouteMeta(null)).toBeUndefined()
    expect(getRouteMeta({})).toBeUndefined()
  })

  it("stores full route config", () => {
    const Pet = type({ id: "number", name: "string" })
    const handler = route()
      .summary("Create pet")
      .description("Creates a new pet entry")
      .operationId("createPet")
      .tags("pets")
      .query(type({ limit: "string" }))
      .params(type({ id: "string" }))
      .response(201, {
        description: "Created",
        content: { "application/json": { schema: Pet } },
      })
      .response(400, { description: "Bad request" })
      .handle(() => new Response("ok"))

    const meta = getRouteMeta(handler)
    expect(meta!.summary).toBe("Create pet")
    expect(meta!.description).toBe("Creates a new pet entry")
    expect(meta!.operationId).toBe("createPet")
    expect(meta!.tags).toEqual(["pets"])
    expect((meta!.responses["400"] as any)?.description).toBe("Bad request")
  })
})

// ---------------------------------------------------------------------------
// spec.ts — buildOpenAPISpec
// ---------------------------------------------------------------------------
describe("buildOpenAPISpec", () => {
  it("returns empty paths when no routes", () => {
    const spec = buildOpenAPISpec([], { title: "Test", version: "1.0.0" })

    expect(spec.openapi).toBe("3.1.0")
    expect(spec.info.title).toBe("Test")
    expect(spec.info.version).toBe("1.0.0")
    expect(spec.paths).toEqual({})
  })

  it("generates path parameters from route pattern", () => {
    const spec = buildOpenAPISpec(
      [
        {
          path: "/pets/:id",
          method: "get",
          config: {
            summary: "Get pet",
            params: type({ id: "string" }),
            responses: { 200: { description: "OK" } },
            handler: () => new Response(),
          },
        },
      ],
      { title: "Test", version: "1.0.0" },
    )

    const params = spec.paths!["/pets/{id}"]!.get!.parameters!
    expect(params).toHaveLength(1)
    expect(params[0]!.name).toBe("id")
    expect(params[0]!.in).toBe("path")
    expect(params[0]!.required).toBe(true)
    expect(params[0]!.schema.type).toBe("string")
  })

  it("generates query parameters", () => {
    const spec = buildOpenAPISpec(
      [
        {
          path: "/pets",
          method: "get",
          config: {
            summary: "List pets",
            query: type({ limit: "string", offset: "string" }),
            responses: { 200: { description: "OK" } },
            handler: () => new Response(),
          },
        },
      ],
      { title: "Test", version: "1.0.0" },
    )

    const params = spec.paths!["/pets"]!.get!.parameters!
    expect(params).toHaveLength(2)
    expect(params[0]!.in).toBe("query")
    expect(params[1]!.in).toBe("query")
  })

  it("marks query parameters as required when in required array", () => {
    const spec = buildOpenAPISpec(
      [
        {
          path: "/pets",
          method: "get",
          config: {
            summary: "List pets",
            query: type({ limit: "string", offset: "string" }),
            responses: { 200: { description: "OK" } },
            handler: () => new Response(),
          },
        },
      ],
      { title: "Test", version: "1.0.0" },
    )

    const params = spec.paths!["/pets"]!.get!.parameters!
    expect(params.every((p) => p.required === true)).toBe(true)
  })

  it("generates request body", () => {
    const schema = type({ name: "string" })
    const spec = buildOpenAPISpec(
      [
        {
          path: "/pets",
          method: "post",
          config: {
            summary: "Create pet",
            requestBody: {
              required: true,
              content: { "application/json": { schema } },
            },
            responses: { 201: { description: "Created" } },
            handler: () => new Response(),
          },
        },
      ],
      { title: "Test", version: "1.0.0" },
    )

    const s = spec as any
    const body = s.paths["/pets"].post.requestBody
    expect(body.required).toBe(true)
    expect(body.content["application/json"]).toBeDefined()
    expect(body.content["application/json"].schema.type).toBe("object")
  })

  it("generates response schemas", () => {
    const Pet = type({ id: "number", name: "string" })
    const spec = buildOpenAPISpec(
      [
        {
          path: "/pets/:id",
          method: "get",
          config: {
            summary: "Get pet",
            responses: {
              200: {
                description: "OK",
                content: { "application/json": { schema: Pet } },
              },
              404: { description: "Not found" },
            },
            handler: () => new Response(),
          },
        },
      ],
      { title: "Test", version: "1.0.0" },
    )

    const s = spec as any
    const responses = s.paths["/pets/{id}"].get.responses
    expect(responses["200"].description).toBe("OK")
    expect(responses["200"].content["application/json"].schema.properties).toBeDefined()
    expect(responses["404"].description).toBe("Not found")
    expect(responses["404"].content).toBeUndefined()
  })

  it("sets operation metadata", () => {
    const spec = buildOpenAPISpec(
      [
        {
          path: "/pets",
          method: "get",
          config: {
            summary: "List pets",
            description: "Returns all pets",
            operationId: "listPets",
            tags: ["pets"],
            responses: { 200: { description: "OK" } },
            handler: () => new Response(),
          },
        },
      ],
      { title: "Test", version: "1.0.0" },
    )

    const op = spec.paths!["/pets"]!.get!
    expect(op.summary).toBe("List pets")
    expect(op.description).toBe("Returns all pets")
    expect(op.operationId).toBe("listPets")
    expect(op.tags).toEqual(["pets"])
  })

  it("handles multiple routes with different methods on same path", () => {
    const spec = buildOpenAPISpec(
      [
        {
          path: "/pets",
          method: "get",
          config: {
            responses: { 200: { description: "OK" } },
            handler: () => new Response(),
          },
        },
        {
          path: "/pets",
          method: "post",
          config: {
            responses: { 201: { description: "Created" } },
            handler: () => new Response(),
          },
        },
      ],
      { title: "Test", version: "1.0.0" },
    )

    const pathItem = spec.paths!["/pets"]!
    expect(pathItem.get).toBeDefined()
    expect(pathItem.post).toBeDefined()
  })

  it("handles header parameters", () => {
    const spec = buildOpenAPISpec(
      [
        {
          path: "/pets",
          method: "get",
          config: {
            summary: "List pets",
            headers: type({ "x-api-key": "string" }),
            responses: { 200: { description: "OK" } },
            handler: () => new Response(),
          },
        },
      ],
      { title: "Test", version: "1.0.0" },
    )

    const params = spec.paths!["/pets"]!.get!.parameters!
    expect(params[0]!.name).toBe("x-api-key")
    expect(params[0]!.in).toBe("header")
  })

  it("handles schema-to-json error gracefully", () => {
    const spec = buildOpenAPISpec(
      [
        {
          path: "/pets",
          method: "get",
          config: {
            summary: "List pets",
            query: {
              "~standard": { vendor: "bogus", validate: () => ({ value: "" }) },
            },
            responses: { 200: { description: "OK" } },
            handler: () => new Response(),
          },
        },
      ],
      { title: "Test", version: "1.0.0" },
    )

    const params = spec.paths!["/pets"]!.get!.parameters
    expect(params).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// spec.ts — getOpenAPISpec (integration with Hono)
// ---------------------------------------------------------------------------
describe("getOpenAPISpec", () => {
  it("scans Hono routes and generates spec", () => {
    const app = new Hono()

    app.get(
      "/pets",
      route()
        .summary("List pets")
        .response(200, { description: "OK" })
        .handle(() => new Response()),
    )

    const spec = getOpenAPISpec(app, { title: "Test", version: "1.0.0" })

    expect(spec.paths!["/pets"]?.get?.summary).toBe("List pets")
  })

  it("ignores routes without metadata", () => {
    const app = new Hono()

    app.get("/health", () => new Response("ok"))
    app.get(
      "/pets",
      route()
        .summary("List pets")
        .response(200, { description: "OK" })
        .handle(() => new Response()),
    )

    const spec = getOpenAPISpec(app, { title: "Test", version: "1.0.0" })

    expect(spec.paths!["/health"]).toBeUndefined()
    expect(spec.paths!["/pets"]).toBeDefined()
  })

  it("returns empty paths for app with no documented routes", () => {
    const app = new Hono()
    app.get("/health", () => new Response("ok"))
    const spec = getOpenAPISpec(app, { title: "Test", version: "1.0.0" })
    expect(spec.paths).toEqual({})
  })

  it("works with custom scanner", () => {
    const scanner: RouteScanner = {
      scan: () => [
        {
          path: "/pets",
          method: "get",
          config: {
            summary: "List pets",
            responses: { 200: { description: "OK" } },
            handler: () => new Response(),
          },
        },
      ],
    }

    const spec = getOpenAPISpec(null, { title: "Test", version: "1.0.0" }, scanner)
    expect(spec.paths!["/pets"]?.get?.summary).toBe("List pets")
  })
})

// ---------------------------------------------------------------------------
// hono-scanner.ts
// ---------------------------------------------------------------------------
describe("honoScanner", () => {
  it("returns entries from Hono routes with metadata", () => {
    const app = new Hono()

    app.get(
      "/pets",
      route()
        .summary("List pets")
        .response(200, { description: "OK" })
        .handle(() => new Response()),
    )

    const entries = honoScanner.scan(app)
    expect(entries).toHaveLength(1)
    expect(entries[0]!.path).toBe("/pets")
    expect(entries[0]!.method).toBe("GET")
    expect(entries[0]!.config.summary).toBe("List pets")
  })

  it("ignores routes without metadata", () => {
    const app = new Hono()

    app.get("/health", () => new Response("ok"))
    app.get("/metrics", () => new Response("ok"))

    const entries = honoScanner.scan(app)
    expect(entries).toHaveLength(0)
  })

  it("returns empty array for app with no routes", () => {
    const app = new Hono()
    expect(honoScanner.scan(app)).toEqual([])
  })

  it("returns empty array for non-Hono objects", () => {
    expect(honoScanner.scan({})).toEqual([])
    expect(honoScanner.scan(null)).toEqual([])
    expect(honoScanner.scan(undefined)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// scalar.ts
// ---------------------------------------------------------------------------
describe("serveScalarUI", () => {
  function mockHtml(_html: string): { html(s: string): Response } {
    return { html: (s) => new Response(s) }
  }

  it("returns a function", () => {
    const handler = serveScalarUI({ specUrl: "/openapi.json" })
    expect(typeof handler).toBe("function")
  })

  it("generates HTML with spec URL", async () => {
    const handler = serveScalarUI({ specUrl: "/custom-spec.json" })
    const res = await handler(mockHtml(""))
    expect(await res.text()).toContain("/custom-spec.json")
  })

  it("generates HTML with custom title", async () => {
    const handler = serveScalarUI({ specUrl: "/spec.json", title: "My API" })
    const res = await handler(mockHtml(""))
    expect(await res.text()).toContain("My API")
  })

  it("generates HTML with custom theme", async () => {
    const handler = serveScalarUI({ specUrl: "/spec.json", theme: "dark" })
    const res = await handler(mockHtml(""))
    expect(await res.text()).toContain("dark")
  })

  it("includes Scalar CDN script", async () => {
    const handler = serveScalarUI({ specUrl: "/spec.json" })
    const res = await handler(mockHtml(""))
    expect(await res.text()).toContain("@scalar/api-reference")
  })

  it("uses #api-reference div as mount target", async () => {
    const handler = serveScalarUI({ specUrl: "/spec.json" })
    const res = await handler(mockHtml(""))
    expect(await res.text()).toContain('<div id="api-reference"')
  })

  it("passes spec URL via data-url attribute", async () => {
    const handler = serveScalarUI({ specUrl: "/my-spec.json" })
    const res = await handler(mockHtml(""))
    expect(await res.text()).toContain('data-url="/my-spec.json"')
  })

  it("passes configuration via data-configuration attribute", async () => {
    const handler = serveScalarUI({
      specUrl: "/spec.json",
      showSidebar: false,
    })
    const res = await handler(mockHtml(""))
    const html = await res.text()
    expect(html).toContain("data-configuration=")
    expect(html).toContain("purple")
    expect(html).toContain("false")
  })

  it("places script tag after mount div", async () => {
    const handler = serveScalarUI({ specUrl: "/spec.json" })
    const res = await handler(mockHtml(""))
    const html = await res.text()
    const divPos = html.indexOf('<div id="api-reference"')
    const scriptPos = html.indexOf("<script src=")
    expect(divPos).toBeGreaterThan(0)
    expect(scriptPos).toBeGreaterThan(divPos)
  })

  it("escapes HTML in title", async () => {
    const handler = serveScalarUI({
      specUrl: "/spec.json",
      title: '<script>alert("xss")</script>',
    })
    const res = await handler(mockHtml(""))
    const html = await res.text()
    expect(html).not.toContain("<script>")
    expect(html).toContain("&lt;script&gt;")
  })
})

// ---------------------------------------------------------------------------
// Response / request body shorthand
// ---------------------------------------------------------------------------
describe("response shorthand", () => {
  it("accepts Standard Schema as response value (200: Pet)", () => {
    const Pet = type({ name: "string" })
    const spec = buildOpenAPISpec(
      [
        {
          path: "/pets",
          method: "get",
          config: { responses: { 200: Pet }, handler: () => new Response() },
        },
      ],
      { title: "Test", version: "1.0.0" },
    )
    const s = spec as any
    const resp = s.paths["/pets"].get.responses["200"]
    expect(resp.description).toBe("OK")
    expect(resp.content["application/json"].schema.properties).toBeDefined()
  })

  it('accepts string as response value (404: "Not found")', () => {
    const spec = buildOpenAPISpec(
      [
        {
          path: "/pets",
          method: "get",
          config: {
            responses: { 404: "Not found" },
            handler: () => new Response(),
          },
        },
      ],
      { title: "Test", version: "1.0.0" },
    )
    const resp = spec.paths!["/pets"]!.get!.responses!["404"]!
    expect(resp.description).toBe("Not found")
    expect(resp.content).toBeUndefined()
  })

  it("auto-describes known status codes", () => {
    const spec = buildOpenAPISpec(
      [
        {
          path: "/pets",
          method: "post",
          config: {
            responses: { 201: type({ id: "number" }), 400: "bad", 500: "oops" },
            handler: () => new Response(),
          },
        },
      ],
      { title: "Test", version: "1.0.0" },
    )
    expect(spec.paths!["/pets"]!.post!.responses!["201"]!.description).toBe("Created")
    expect(spec.paths!["/pets"]!.post!.responses!["400"]!.description).toBe("bad")
    expect(spec.paths!["/pets"]!.post!.responses!["500"]!.description).toBe("oops")
  })
})

describe("request body shorthand", () => {
  it("accepts Standard Schema directly (requestBody: Pet)", () => {
    const Pet = type({ name: "string" })
    const spec = buildOpenAPISpec(
      [
        {
          path: "/pets",
          method: "post",
          config: {
            requestBody: Pet,
            responses: { 201: { description: "Created" } },
            handler: () => new Response(),
          },
        },
      ],
      { title: "Test", version: "1.0.0" },
    )
    const s = spec as any
    const body = s.paths["/pets"].post.requestBody
    expect(body.required).toBe(true)
    expect(body.content["application/json"].schema.properties).toBeDefined()
  })
})

describe("auto operationId", () => {
  it("generates operationId from method + path", () => {
    const spec = buildOpenAPISpec(
      [
        {
          path: "/pets",
          method: "get",
          config: {
            responses: { 200: { description: "OK" } },
            handler: () => new Response(),
          },
        },
        {
          path: "/pets/:id",
          method: "get",
          config: {
            responses: { 200: { description: "OK" } },
            handler: () => new Response(),
          },
        },
        {
          path: "/pets",
          method: "post",
          config: {
            responses: { 201: { description: "Created" } },
            handler: () => new Response(),
          },
        },
        {
          path: "/pets/:id",
          method: "delete",
          config: {
            responses: { 204: { description: "Deleted" } },
            handler: () => new Response(),
          },
        },
      ],
      { title: "Test", version: "1.0.0" },
    )
    expect(spec.paths!["/pets"]!.get!.operationId).toBe("getPets")
    expect(spec.paths!["/pets"]!.post!.operationId).toBe("postPets")
    expect(spec.paths!["/pets/{id}"]!.get!.operationId).toBe("getPetsById")
    expect(spec.paths!["/pets/{id}"]!.delete!.operationId).toBe("deletePetsById")
  })

  it("uses explicit operationId when provided", () => {
    const spec = buildOpenAPISpec(
      [
        {
          path: "/pets",
          method: "get",
          config: {
            operationId: "listAllPets",
            responses: { 200: { description: "OK" } },
            handler: () => new Response(),
          },
        },
      ],
      { title: "Test", version: "1.0.0" },
    )
    expect(spec.paths!["/pets"]!.get!.operationId).toBe("listAllPets")
  })
})

describe("auto tags", () => {
  it("derives tags from first path segment", () => {
    const spec = buildOpenAPISpec(
      [
        {
          path: "/pets",
          method: "get",
          config: {
            responses: { 200: { description: "OK" } },
            handler: () => new Response(),
          },
        },
        {
          path: "/pets/:id",
          method: "get",
          config: {
            responses: { 200: { description: "OK" } },
            handler: () => new Response(),
          },
        },
        {
          path: "/users",
          method: "get",
          config: {
            responses: { 200: { description: "OK" } },
            handler: () => new Response(),
          },
        },
        {
          path: "/health/status",
          method: "get",
          config: {
            responses: { 200: { description: "OK" } },
            handler: () => new Response(),
          },
        },
      ],
      { title: "Test", version: "1.0.0" },
    )
    expect(spec.paths!["/pets"]!.get!.tags).toEqual(["pets"])
    expect(spec.paths!["/pets/{id}"]!.get!.tags).toEqual(["pets"])
    expect(spec.paths!["/users"]!.get!.tags).toEqual(["users"])
    expect(spec.paths!["/health/status"]!.get!.tags).toEqual(["health"])
  })

  it("uses explicit tags when provided", () => {
    const spec = buildOpenAPISpec(
      [
        {
          path: "/pets",
          method: "get",
          config: {
            tags: ["animals"],
            responses: { 200: { description: "OK" } },
            handler: () => new Response(),
          },
        },
      ],
      { title: "Test", version: "1.0.0" },
    )
    expect(spec.paths!["/pets"]!.get!.tags).toEqual(["animals"])
  })

  it("returns empty tags for root path", () => {
    const spec = buildOpenAPISpec(
      [
        {
          path: "/",
          method: "get",
          config: {
            responses: { 200: { description: "OK" } },
            handler: () => new Response(),
          },
        },
      ],
      { title: "Test", version: "1.0.0" },
    )
    expect(spec.paths!["/"]!.get!.tags).toEqual([])
  })

  it("strips default /api basePath before deriving tag", () => {
    const spec = buildOpenAPISpec(
      [
        {
          path: "/api/pets",
          method: "get",
          config: {
            responses: { 200: { description: "OK" } },
            handler: () => new Response(),
          },
        },
        {
          path: "/api/species",
          method: "post",
          config: {
            responses: { 201: { description: "Created" } },
            handler: () => new Response(),
          },
        },
      ],
      { title: "Test", version: "1.0.0" },
    )
    expect(spec.paths!["/api/pets"]!.get!.tags).toEqual(["pets"])
    expect(spec.paths!["/api/species"]!.post!.tags).toEqual(["species"])
  })
})

describe("shorthand integration with Hono", () => {
  it("full pipeline with shorthand", () => {
    const app = new Hono()
    const Pet = type({ name: "string" })

    app.get(
      "/pets",
      route()
        .response(200, Pet)
        .handle(() => new Response()),
    )

    const spec = getOpenAPISpec(app, { title: "Test", version: "1.0.0" })
    const s = spec as any
    expect(s.paths["/pets"].get.responses["200"].description).toBe("OK")
    expect(s.paths["/pets"].get.responses["200"].content["application/json"].schema.properties).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// Runtime validation
// ---------------------------------------------------------------------------
describe("runtime validation", () => {
  it("returns 400 for invalid request body", async () => {
    const app = new Hono()

    app.post(
      "/pets",
      route()
        .requestBody(type({ name: "string>0" }))
        .response(201, { description: "Created" })
        .handle((c) => c.json({ ok: true }, 201)),
    )

    const res = await app.request("/pets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "" }),
    })
    const body: any = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toBe("Validation failed")
    expect(Array.isArray(body.issues)).toBe(true)
  })

  it("passes valid request body through to handler", async () => {
    const app = new Hono()

    app.post(
      "/pets",
      route()
        .requestBody(type({ name: "string>0" }))
        .response(201, { description: "Created" })
        .handle((c) => {
          const body = c.req.valid("json")
          return c.json(body, 201)
        }),
    )

    const res = await app.request("/pets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Fido" }),
    })

    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ name: "Fido" })
  })

  it("validates query parameters", async () => {
    const app = new Hono()

    app.get(
      "/search",
      route()
        .query(type({ q: "string>0" }))
        .response(200, { description: "OK" })
        .handle((c) => c.json({ ok: true })),
    )

    const res = await app.request("/search?q=")
    expect(res.status).toBe(400)
  })

  it("validates path parameters", async () => {
    const app = new Hono()

    app.get(
      "/users/:id",
      route()
        .params(type({ id: "number" }))
        .response(200, { description: "OK" })
        .handle((c) => c.json({ ok: true })),
    )

    const res = await app.request("/users/abc")
    expect(res.status).toBe(400)
  })

  it("validates headers", async () => {
    const app = new Hono()

    app.get(
      "/protected",
      route()
        .headers(type({ "x-api-key": "string>0" }))
        .response(200, { description: "OK" })
        .handle((c) => c.json({ ok: true })),
    )

    const res = await app.request("/protected", {
      headers: { "x-api-key": "" },
    })
    expect(res.status).toBe(400)
  })

  it("respects custom validation error handler", async () => {
    const restore = setOnValidationError((_issues, c) => c.json({ error: "Invalid" }, 422))

    const app = new Hono()
    app.post(
      "/pets",
      route()
        .requestBody(type({ name: "string>0" }))
        .response(201, { description: "Created" })
        .handle((c) => c.json({ ok: true }, 201)),
    )

    const res = await app.request("/pets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "" }),
    })

    expect(res.status).toBe(422)
    expect((await res.json()) as any).toEqual({ error: "Invalid" })

    restore()
  })

  it("respects per-route validation error handler via chain method", async () => {
    const app = new Hono()
    app.post(
      "/pets",
      route()
        .onValidationError((_issues, c) => c.json({ error: "Invalid" }, 422))
        .requestBody(type({ name: "string>0" }))
        .response(201, { description: "Created" })
        .handle((c) => c.json({ ok: true }, 201)),
    )

    const res = await app.request("/pets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "" }),
    })

    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: "Invalid" })
  })
})

// ---------------------------------------------------------------------------
// Response validation
// ---------------------------------------------------------------------------
describe("response validation", () => {
  it("passes valid JSON response matching schema through", async () => {
    const app = new Hono()
    app.get(
      "/pets",
      route()
        .response(200, type({ name: "string" }))
        .handle((c) => c.json({ name: "Fido" })),
    )

    const res = await app.request("/pets")
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ name: "Fido" })
  })

  it("returns 500 for invalid JSON response (data doesn't match schema)", async () => {
    const app = new Hono()
    app.get(
      "/pets",
      route()
        .response(200, type({ name: "string" }))
        .handle((c) => c.json({ name: 42 })),
    )

    const res = await app.request("/pets")
    expect(res.status).toBe(500)
    const body: any = await res.json()
    expect(body.error).toBe("Response validation failed")
    expect(Array.isArray(body.issues)).toBe(true)
  })

  it("skips validation for non-JSON responses", async () => {
    const app = new Hono()
    app.get(
      "/pets",
      route()
        .response(200, type({ name: "string" }))
        .handle((c) => c.text("hello")),
    )

    const res = await app.request("/pets")
    expect(res.status).toBe(200)
    expect(await res.text()).toBe("hello")
  })

  it("skips validation when no schema is declared for the returned status code", async () => {
    const app = new Hono()
    app.get(
      "/pets",
      route()
        .response(201, type({ name: "string" }))
        .handle((c) => c.json({ anything: "goes" })),
    )

    const res = await app.request("/pets")
    expect(res.status).toBe(200)
  })

  it("skips validation for 204 No Content", async () => {
    const app = new Hono()
    app.get(
      "/empty",
      route()
        .response(204, type({}))
        .handle((c) => c.body(null, 204)),
    )

    const res = await app.request("/empty")
    expect(res.status).toBe(204)
  })

  it("respects per-route onResponseValidationError handler", async () => {
    const app = new Hono()
    app.get(
      "/pets",
      route()
        .onResponseValidationError((_issues, c) => c.json({ error: "Wrong shape!" }, 422))
        .response(200, type({ name: "string" }))
        .handle((c) => c.json({ name: 42 })),
    )

    const res = await app.request("/pets")
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ error: "Wrong shape!" })
  })
})

// ---------------------------------------------------------------------------
// paginated()
// ---------------------------------------------------------------------------
describe("paginated", () => {
  it("provides default page, limit and computed offset", async () => {
    const app = new Hono()
    app.get(
      "/items",
      route()
        .paginated()
        .handle((c) => {
          const q = c.req.valid("query")
          expect(q.page).toBe(1)
          expect(q.limit).toBe(20)
          expect(q.offset).toBe(0)
          return c.json(q)
        }),
    )

    const res = await app.request("/items")
    expect(res.status).toBe(200)
  })

  it("parses page and limit from query string", async () => {
    const app = new Hono()
    app.get(
      "/items",
      route()
        .paginated()
        .handle((c) => {
          const q = c.req.valid("query")
          expect(q.page).toBe(3)
          expect(q.limit).toBe(10)
          expect(q.offset).toBe(20)
          return c.json({})
        }),
    )

    const res = await app.request("/items?page=3&limit=10")
    expect(res.status).toBe(200)
  })

  it("clamps limit to maxLimit", async () => {
    const app = new Hono()
    app.get(
      "/items",
      route()
        .paginated({ maxLimit: 50 })
        .handle((c) => {
          const q = c.req.valid("query")
          expect(q.page).toBe(1)
          expect(q.limit).toBe(50)
          expect(q.offset).toBe(0)
          return c.json({})
        }),
    )

    const res = await app.request("/items?limit=999")
    expect(res.status).toBe(200)
  })

  it("coerces string values to numbers", async () => {
    const app = new Hono()
    app.get(
      "/items",
      route()
        .paginated()
        .handle((c) => {
          const { page, limit } = c.req.valid("query")
          expect(typeof page).toBe("number")
          expect(typeof limit).toBe("number")
          return c.json({})
        }),
    )

    const res = await app.request("/items?page=2&limit=15")
    expect(res.status).toBe(200)
  })

  it("merges with user-defined query schema", async () => {
    const app = new Hono()
    app.get(
      "/items",
      route()
        .paginated()
        .query(type({ category: "string" }))
        .handle((c) => {
          const q = c.req.valid("query")
          expect(q.category).toBe("books")
          expect(q.page).toBe(2)
          expect(q.limit).toBe(10)
          expect(q.offset).toBe(10)
          return c.json({})
        }),
    )

    const res = await app.request("/items?page=2&limit=10&category=books")
    expect(res.status).toBe(200)
  })

  it("adds page/limit query params to OpenAPI spec", () => {
    const spec = buildOpenAPISpec(
      [
        {
          path: "/items",
          method: "get",
          config: {
            pagination: { maxLimit: 100, defaultLimit: 20 },
            responses: { 200: "OK" },
            handler: () => new Response(),
          },
        },
      ],
      { title: "T", version: "1.0.0" },
    )
    const params = spec.paths!["/items"]!.get!.parameters!
    expect(params).toHaveLength(2)
    expect(params[0]!.name).toBe("page")
    expect(params[0]!.in).toBe("query")
    expect(params[0]!.schema).toMatchObject({
      type: "integer",
      minimum: 1,
      default: 1,
    })
    expect(params[1]!.name).toBe("limit")
    expect(params[1]!.schema).toMatchObject({
      type: "integer",
      minimum: 1,
      maximum: 100,
      default: 20,
    })
  })

  it("type-checks c.req.valid('query') when paginated", async () => {
    // Compile-time check only — verify the handler type is correct
    const app = new Hono()
    app.get(
      "/items",
      route()
        .paginated()
        .handle((c) => {
          const q: { page: number; limit: number; offset: number } = c.req.valid("query")
          return c.json(q)
        }),
    )
    const res = await app.request("/items")
    expect(res.status).toBe(200)
  })
})

// ---------------------------------------------------------------------------
// auth()
// ---------------------------------------------------------------------------
describe("auth", () => {
  it("adds security to the operation spec", () => {
    const spec = buildOpenAPISpec(
      [
        {
          path: "/pets",
          method: "get",
          config: {
            security: ["bearerAuth"],
            responses: { 200: { description: "OK" } },
            handler: () => new Response(),
          },
        },
      ],
      { title: "T", version: "1.0.0" },
    )
    expect(spec.paths!["/pets"]!.get!.security).toEqual([{ bearerAuth: [] }])
  })

  it("supports multiple auth schemes", () => {
    const spec = buildOpenAPISpec(
      [
        {
          path: "/admin",
          method: "get",
          config: {
            security: ["bearerAuth", "apiKey"],
            responses: { 200: { description: "OK" } },
            handler: () => new Response(),
          },
        },
      ],
      { title: "T", version: "1.0.0" },
    )
    expect(spec.paths!["/admin"]!.get!.security).toEqual([{ bearerAuth: [], apiKey: [] }])
  })

  it("omits security when not set", () => {
    const spec = buildOpenAPISpec(
      [
        {
          path: "/public",
          method: "get",
          config: {
            responses: { 200: { description: "OK" } },
            handler: () => new Response(),
          },
        },
      ],
      { title: "T", version: "1.0.0" },
    )
    expect(spec.paths!["/public"]!.get!.security).toBeUndefined()
  })

  it("passes components through to spec", () => {
    const spec = buildOpenAPISpec(
      [],
      { title: "T", version: "1.0.0" },
      {
        components: {
          securitySchemes: {
            bearerAuth: { type: "http", scheme: "bearer" },
          },
        },
      },
    )
    expect(spec.components).toEqual({
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer" },
      },
    })
  })

  it("omits components when not provided", () => {
    const spec = buildOpenAPISpec([], {
      title: "T",
      version: "1.0.0",
    })
    expect(spec.components).toBeUndefined()
  })

  it("chain method adds security to route config", () => {
    const handler = route()
      .auth("bearerAuth")
      .response(200, { description: "OK" })
      .handle(() => new Response())
    const meta = getRouteMeta(handler)
    expect(meta?.security).toEqual(["bearerAuth"])
  })

  it("defaults scheme to bearerAuth", () => {
    const handler = route()
      .auth()
      .response(200, { description: "OK" })
      .handle(() => new Response())
    const meta = getRouteMeta(handler)
    expect(meta?.security).toEqual(["bearerAuth"])
  })

  it("accumulates multiple auth calls", () => {
    const handler = route()
      .auth("bearerAuth")
      .auth("apiKey")
      .response(200, { description: "OK" })
      .handle(() => new Response())
    const meta = getRouteMeta(handler)
    expect(meta?.security).toEqual(["bearerAuth", "apiKey"])
  })
})

// ---------------------------------------------------------------------------
// filter / sort
// ---------------------------------------------------------------------------
describe("filter", () => {
  it("adds exact-match query param to spec", () => {
    const spec = buildOpenAPISpec(
      [
        {
          path: "/items",
          method: "get",
          config: {
            filters: [
              {
                name: "status",
                schema: { infer: "never" } as any,
                operators: ["eq"],
              },
            ],
            responses: { 200: { description: "OK" } },
            handler: () => new Response(),
          },
        },
      ],
      { title: "T", version: "1.0.0" },
    )
    const params = spec.paths!["/items"]!.get!.parameters!
    expect(params).toHaveLength(1)
    expect(params[0]!.name).toBe("status")
    expect(params[0]!.in).toBe("query")
  })

  it("adds operator-based query params to spec", () => {
    const spec = buildOpenAPISpec(
      [
        {
          path: "/items",
          method: "get",
          config: {
            filters: [
              {
                name: "price",
                schema: { infer: "never" } as any,
                operators: ["gte", "lte"],
              },
            ],
            responses: { 200: { description: "OK" } },
            handler: () => new Response(),
          },
        },
      ],
      { title: "T", version: "1.0.0" },
    )
    const params = spec.paths!["/items"]!.get!.parameters!
    expect(params).toHaveLength(2)
    expect(params[0]!.name).toBe("price__gte")
    expect(params[1]!.name).toBe("price__lte")
  })

  it("adds sort enum to spec", () => {
    const spec = buildOpenAPISpec(
      [
        {
          path: "/items",
          method: "get",
          config: {
            sort: ["name", "price"],
            responses: { 200: { description: "OK" } },
            handler: () => new Response(),
          },
        },
      ],
      { title: "T", version: "1.0.0" },
    )
    const params = spec.paths!["/items"]!.get!.parameters!
    expect(params).toHaveLength(1)
    expect(params[0]!.name).toBe("sort")
    expect(params[0]!.schema).toMatchObject({
      type: "string",
      enum: ["name", "-name", "price", "-price"],
    })
  })

  it("validates filter value at runtime", async () => {
    const app = new Hono()
    app.get(
      "/items",
      route()
        .filter("status", type("'active'|'inactive'"))
        .response(200, { description: "OK" })
        .handle((c) => c.json({ ok: true })),
    )
    const res = await app.request("/items?status=active")
    expect(res.status).toBe(200)

    const bad = await app.request("/items?status=deleted")
    expect(bad.status).toBe(400)
  })

  it("validates operator filter values", async () => {
    const app = new Hono()
    app.get(
      "/items",
      route()
        .filter("price", type("string"), { operators: ["gte"] })
        .response(200, { description: "OK" })
        .handle((c) => c.json({ ok: true })),
    )
    const res = await app.request("/items?price__gte=10")
    expect(res.status).toBe(200)
  })

  it("validates sort field at runtime", async () => {
    const app = new Hono()
    app.get(
      "/items",
      route()
        .sort(["name", "price"])
        .response(200, { description: "OK" })
        .handle((c) => c.json({ ok: true })),
    )
    const res = await app.request("/items?sort=-price")
    expect(res.status).toBe(200)

    const bad = await app.request("/items?sort=invalid")
    expect(bad.status).toBe(400)
  })

  it("combines filter, sort, pagination and query", async () => {
    const app = new Hono()
    app.get(
      "/items",
      route()
        .query(type({ search: "string | undefined" }))
        .filter("status", type("'active'|'inactive'"))
        .sort(["name"])
        .paginated()
        .response(200, { description: "OK" })
        .handle((c) => c.json(c.req.valid("query"))),
    )
    const res = await app.request("/items?search=foo&status=active&sort=name&page=2&limit=10")
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.search).toBe("foo")
    expect(body.status).toBe("active")
    expect(body.sort).toEqual(["name"])
    expect(body.page).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// include()
// ---------------------------------------------------------------------------
describe("include", () => {
  it("adds include param to spec", () => {
    const spec = buildOpenAPISpec(
      [
        {
          path: "/items",
          method: "get",
          config: {
            include: ["author", "comments"],
            responses: { 200: { description: "OK" } },
            handler: () => new Response(),
          },
        },
      ],
      { title: "T", version: "1.0.0" },
    )
    const params = spec.paths!["/items"]!.get!.parameters!
    expect(params).toHaveLength(1)
    expect(params[0]!.name).toBe("include")
    expect(params[0]!.schema).toMatchObject({
      type: "string",
      enum: ["author", "comments"],
    })
  })

  it("validates include at runtime", async () => {
    const app = new Hono()
    app.get(
      "/items",
      route()
        .include(["author", "comments"])
        .response(200, { description: "OK" })
        .handle((c) => c.json({ ok: true })),
    )
    const res = await app.request("/items?include=author")
    expect(res.status).toBe(200)

    const bad = await app.request("/items?include=invalid")
    expect(bad.status).toBe(400)
  })

  it("combines include with filter, sort and pagination", async () => {
    const app = new Hono()
    app.get(
      "/items",
      route()
        .include(["author"])
        .filter("status", type("'active'|'inactive'"))
        .sort(["name"])
        .paginated()
        .response(200, { description: "OK" })
        .handle((c) => c.json(c.req.valid("query"))),
    )
    const res = await app.request("/items?include=author&status=active&sort=name&page=2")
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.include).toEqual(["author"])
    expect(body.status).toBe("active")
    expect(body.sort).toEqual(["name"])
    expect(body.page).toBe(2)
  })

  it("parses comma-separated include values", async () => {
    const app = new Hono()
    app.get(
      "/items",
      route()
        .include(["author", "comments", "tags"])
        .response(200, { description: "OK" })
        .handle((c) => {
          const q: { include?: string[] } = c.req.valid("query")
          return c.json({ include: q.include })
        }),
    )
    const res = await app.request("/items?include=author,comments")
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.include).toEqual(["author", "comments"])
  })
})

// ---------------------------------------------------------------------------
// fieldsets()
// ---------------------------------------------------------------------------
describe("fieldsets", () => {
  it("adds fields[resource] params to spec", () => {
    const spec = buildOpenAPISpec(
      [
        {
          path: "/articles",
          method: "get",
          config: {
            fieldsets: ["articles", "people"],
            responses: { 200: { description: "OK" } },
            handler: () => new Response(),
          },
        },
      ],
      { title: "T", version: "1.0.0" },
    )
    const params = spec.paths!["/articles"]!.get!.parameters!
    expect(params).toHaveLength(2)
    expect(params[0]!.name).toBe("fields[articles]")
    expect(params[1]!.name).toBe("fields[people]")
  })

  it("passes through fieldset values at runtime", async () => {
    const app = new Hono()
    app.get(
      "/articles",
      route()
        .fieldsets(["articles", "people"])
        .response(200, { description: "OK" })
        .handle((c) => c.json(c.req.valid("query"))),
    )
    const res = await app.request("/articles?fields[articles]=title,body&fields[people]=name")
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body["fields[articles]"]).toBe("title,body")
    expect(body["fields[people]"]).toBe("name")
  })

  it("combines fieldsets with filter, sort, include and pagination", async () => {
    const app = new Hono()
    app.get(
      "/articles",
      route()
        .fieldsets(["articles", "author"])
        .filter("status", type("'published'|'draft'"))
        .sort(["title"])
        .include(["author"])
        .paginated()
        .response(200, { description: "OK" })
        .handle((c) => c.json(c.req.valid("query"))),
    )
    const res = await app.request(
      "/articles?fields[articles]=title&fields[author]=name&status=published&sort=title&include=author&page=1",
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body["fields[articles]"]).toBe("title")
    expect(body["fields[author]"]).toBe("name")
    expect(body.status).toBe("published")
    expect(body.sort).toEqual(["title"])
    expect(body.include).toEqual(["author"])
    expect(body.page).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Integration — full pipeline
// ---------------------------------------------------------------------------
describe("integration", () => {
  it("full pipeline: route → spec → serve", async () => {
    const app = new Hono()
    const Pet = type({ id: "number", name: "string" })

    app.get(
      "/pets/:id",
      route()
        .summary("Get pet")
        .params(type({ id: "string" }))
        .response(200, {
          description: "OK",
          content: { "application/json": { schema: Pet } },
        })
        .handle((c) => c.json({ id: 1, name: "Fido" })),
    )

    const spec = getOpenAPISpec(app, { title: "Pet Store", version: "1.0.0" })
    const s = spec as any

    expect(s.openapi).toBe("3.1.0")
    expect(s.info.title).toBe("Pet Store")

    const getOp = s.paths["/pets/{id}"].get
    expect(getOp.summary).toBe("Get pet")
    expect(getOp.parameters).toHaveLength(1)
    expect(getOp.parameters[0].name).toBe("id")
    expect(getOp.responses["200"].content["application/json"].schema.properties).toBeDefined()
  })

  it("handles request body and response in one route", async () => {
    const app = new Hono()
    const Pet = type({ id: "number", name: "string" })
    const CreatePet = type({ name: "string" })

    app.post(
      "/pets",
      route()
        .summary("Create pet")
        .requestBody(CreatePet)
        .response(201, {
          description: "Created",
          content: { "application/json": { schema: Pet } },
        })
        .handle((c) => c.json({ id: 1, name: "Fido" }, 201)),
    )

    const spec = getOpenAPISpec(app, { title: "Pet Store", version: "1.0.0" })
    const s = spec as any
    const postOp = s.paths["/pets"].post
    expect(postOp.responses["201"].content["application/json"].schema.type).toBe("object")
  })
})
