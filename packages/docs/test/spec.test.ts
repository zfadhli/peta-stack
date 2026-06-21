import {
  buildOpenAPISpec,
  createDocApp,
  describe,
  expect,
  getOpenAPISpec,
  Hono,
  it,
  type RouteScanner,
  route,
  type,
} from "./helper.ts"

// ---------------------------------------------------------------------------
// buildOpenAPISpec
// ---------------------------------------------------------------------------
describe("buildOpenAPISpec", () => {
  it("generates a minimal spec from empty routes", () => {
    const spec = buildOpenAPISpec([], { title: "Test", version: "1.0.0" })
    expect(spec.openapi).toBe("3.1.0")
    expect(spec.info.title).toBe("Test")
    expect(spec.paths).toEqual({})
  })

  it("builds path parameters from Hono `:param` notation", () => {
    const app = new Hono()
    app.get(
      "/pets/:id",
      route()
        .params(type({ id: "string" }))
        .response(200, { description: "OK" })
        .handle(() => new Response()),
    )

    const spec = getOpenAPISpec(app, { title: "Test", version: "1.0.0" })
    const params = spec.paths!["/pets/{id}"]?.get?.parameters
    expect(params).toHaveLength(1)
    expect(params![0]!.name).toBe("id")
    expect(params![0]!.in).toBe("path")
    expect(params![0]!.required).toBe(true)
  })

  it("builds query parameters from query schema", () => {
    const app = new Hono()
    app.get(
      "/pets",
      route()
        .query(type({ name: "string", age: "number" }).partial())
        .response(200, { description: "OK" })
        .handle(() => new Response()),
    )

    const spec = getOpenAPISpec(app, { title: "Test", version: "1.0.0" })
    const params = spec.paths!["/pets"]?.get?.parameters ?? []
    expect(params).toHaveLength(2)
    expect(params.find((p) => p!.name === "name")?.in).toBe("query")
    expect(params.find((p) => p!.name === "age")?.in).toBe("query")
  })

  it("marks required query parameters with their required status", () => {
    const app = new Hono()
    app.get(
      "/pets",
      route()
        .query(type({ name: "string" }))
        .response(200, { description: "OK" })
        .handle(() => new Response()),
    )

    const spec = getOpenAPISpec(app, { title: "Test", version: "1.0.0" })
    const params = spec.paths!["/pets"]?.get?.parameters ?? []
    expect(params.find((p) => p!.name === "name")?.required).toBe(true)
  })

  it("builds request body from ArkType schema", () => {
    const app = new Hono()
    app.post(
      "/pets",
      route()
        .requestBody(type({ name: "string" }))
        .response(201, { description: "Created" })
        .handle(async (c) => c.json({}, 201)),
    )

    const spec = getOpenAPISpec(app, { title: "Test", version: "1.0.0" })
    const reqBody = spec.paths!["/pets"]?.post?.requestBody
    expect(reqBody).toBeDefined()
    expect(reqBody!.required).toBe(true)
    expect(reqBody!.content["application/json"]).toBeDefined()
  })

  it("builds response schemas from ArkType type", () => {
    const Pet = type({ id: "number", name: "string" })
    const app = new Hono()
    app.get(
      "/pets",
      route()
        .response(200, Pet)
        .handle(() => new Response()),
    )

    const spec = getOpenAPISpec(app, { title: "Test", version: "1.0.0" })
    const resp = spec.paths!["/pets"]?.get?.responses?.["200"]
    expect(resp).toBeDefined()
    expect(resp!.content?.["application/json"]).toBeDefined()
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

  it("supports multiple HTTP methods on the same path", () => {
    const app = new Hono()
    app.get(
      "/pets",
      route()
        .response(200, { description: "OK" })
        .handle(() => new Response()),
    )
    app.post(
      "/pets",
      route()
        .response(201, { description: "Created" })
        .handle(() => new Response()),
    )

    const spec = getOpenAPISpec(app, { title: "Test", version: "1.0.0" })
    expect(spec.paths!["/pets"]?.get).toBeDefined()
    expect(spec.paths!["/pets"]?.post).toBeDefined()
  })

  it("builds header parameters from schema", () => {
    const app = new Hono()
    app.get(
      "/pets",
      route()
        .headers(type({ "x-api-key": "string" }))
        .response(200, { description: "OK" })
        .handle(() => new Response()),
    )

    const spec = getOpenAPISpec(app, { title: "Test", version: "1.0.0" })
    const params = spec.paths!["/pets"]?.get?.parameters ?? []
    expect(params.some((p) => p!.name === "x-api-key" && p!.in === "header")).toBe(true)
  })

  it("handles schema-to-json error gracefully", () => {
    const spec = buildOpenAPISpec(
      [
        {
          path: "/pets",
          method: "get",
          config: {
            summary: "List pets",
            query: { "~standard": { vendor: "bogus", validate: () => ({ value: "" }) } },
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

  it("supports response shorthand via string", () => {
    const app = new Hono()
    app.get(
      "/pets",
      route()
        .response(200, "All good")
        .handle(() => new Response()),
    )
    const spec = getOpenAPISpec(app, { title: "Test", version: "1.0.0" })
    expect(spec.paths!["/pets"]?.get?.responses?.["200"]?.description).toBe("All good")
  })

  it("auto-describes standard status codes", () => {
    const app = new Hono()
    type Pet = { id: number; name: string }
    const Pet = type({ id: "number", name: "string" })
    app.get(
      "/pets",
      route()
        .response(200, Pet)
        .response(404, { description: "Not Found" })
        .handle(() => new Response()),
    )
    const spec = getOpenAPISpec(app, { title: "Test", version: "1.0.0" })
    expect(spec.paths!["/pets"]?.get?.responses?.["200"]?.description).toBe("OK")
    expect(spec.paths!["/pets"]?.get?.responses?.["404"]?.description).toBe("Not Found")
  })

  it("builds pagination parameters", () => {
    const app = new Hono()
    app.get(
      "/pets",
      route()
        .paginated({ maxLimit: 100, defaultLimit: 20 })
        .response(200, { description: "OK" })
        .handle(() => new Response()),
    )
    const spec = getOpenAPISpec(app, { title: "Test", version: "1.0.0" })
    const params = spec.paths!["/pets"]?.get?.parameters ?? []
    expect(params.find((p) => p!.name === "page")?.schema).toMatchObject({
      type: "integer",
      minimum: 1,
      default: 1,
    })
    expect(params.find((p) => p!.name === "limit")?.schema).toMatchObject({
      type: "integer",
      minimum: 1,
      maximum: 100,
      default: 20,
    })
  })

  it("builds filter parameters with operator suffixes", () => {
    const app = new Hono()
    app.get(
      "/pets",
      route()
        .filter("age", type("number"), { operators: ["gte", "lte"] })
        .response(200, { description: "OK" })
        .handle(() => new Response()),
    )
    const spec = getOpenAPISpec(app, { title: "Test", version: "1.0.0" })
    const params = spec.paths!["/pets"]?.get?.parameters ?? []
    expect(params.find((p) => p!.name === "age__gte")).toBeDefined()
    expect(params.find((p) => p!.name === "age__lte")).toBeDefined()
  })

  it("builds sort parameter with enum values", () => {
    const app = new Hono()
    app.get(
      "/pets",
      route()
        .sort(["name", "age"])
        .response(200, { description: "OK" })
        .handle(() => new Response()),
    )
    const spec = getOpenAPISpec(app, { title: "Test", version: "1.0.0" })
    const sortParam = spec.paths!["/pets"]?.get?.parameters?.find((p) => p!.name === "sort")
    expect(sortParam?.schema).toMatchObject({
      type: "array",
      items: {
        type: "string",
        enum: ["name", "-name", "age", "-age"],
      },
    })
    expect(sortParam?.style).toBe("form")
    expect(sortParam?.explode).toBe(false)
  })

  it("builds include parameter", () => {
    const app = new Hono()
    app.get(
      "/pets",
      route()
        .include(["owner", "vet"])
        .response(200, { description: "OK" })
        .handle(() => new Response()),
    )
    const spec = getOpenAPISpec(app, { title: "Test", version: "1.0.0" })
    const incParam = spec.paths!["/pets"]?.get?.parameters?.find((p) => p!.name === "include")
    expect(incParam?.schema).toMatchObject({
      type: "array",
      items: { type: "string", enum: ["owner", "vet"] },
    })
    expect(incParam?.style).toBe("form")
    expect(incParam?.explode).toBe(false)
  })

  it("includes deprecated flag on operation", () => {
    const app = new Hono()
    app.get(
      "/old-endpoint",
      route()
        .deprecated()
        .response(200, { description: "OK" })
        .handle(() => new Response()),
    )
    const spec = getOpenAPISpec(app, { title: "Test", version: "1.0.0" })
    expect(spec.paths!["/old-endpoint"]?.get?.deprecated).toBe(true)
  })

  it("omits deprecated when not set", () => {
    const app = new Hono()
    app.get(
      "/fresh-endpoint",
      route()
        .response(200, { description: "OK" })
        .handle(() => new Response()),
    )
    const spec = getOpenAPISpec(app, { title: "Test", version: "1.0.0" })
    expect(spec.paths!["/fresh-endpoint"]?.get?.deprecated).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Schema deduplication ($ref)
// ---------------------------------------------------------------------------

describe("schema deduplication", () => {
  it("reuses the same ArkType object via $ref", () => {
    const Pet = type({ id: "number", name: "string" })
    const app = new Hono()

    app.get(
      "/pets/:id",
      route()
        .params(type({ id: "string" }))
        .response(200, Pet)
        .handle(() => new Response()),
    )
    app.post(
      "/pets",
      route()
        .response(201, Pet)
        .handle(() => new Response()),
    )

    const spec = getOpenAPISpec(app, { title: "T", version: "1.0.0" })

    const getResp = spec.paths!["/pets/{id}"]?.get?.responses?.["200"]
    const postResp = spec.paths!["/pets"]?.post?.responses?.["201"]

    expect(getResp?.content?.["application/json"]?.schema).toHaveProperty("$ref")
    expect(postResp?.content?.["application/json"]?.schema).toHaveProperty("$ref")
    expect(getResp?.content?.["application/json"]?.schema).toEqual(
      postResp?.content?.["application/json"]?.schema,
    )

    expect(spec.components).toBeDefined()
    expect((spec.components as Record<string, unknown>).schemas).toBeDefined()
  })

  it("inlines schemas that are only used once", () => {
    const app = new Hono()
    app.get(
      "/pets",
      route()
        .response(200, type({ name: "string" }))
        .handle(() => new Response()),
    )

    const spec = getOpenAPISpec(app, { title: "T", version: "1.0.0" })
    const resp = spec.paths!["/pets"]?.get?.responses?.["200"]
    expect(resp?.content?.["application/json"]?.schema).toHaveProperty("type")
    expect(resp?.content?.["application/json"]?.schema).not.toHaveProperty("$ref")
  })
})

// ---------------------------------------------------------------------------
// getOpenAPISpec
// ---------------------------------------------------------------------------
describe("getOpenAPISpec", () => {
  it("scans Hono routes and generates spec", () => {
    const app = createDocApp()
    const spec = getOpenAPISpec(app, { title: "Test", version: "1.0.0" })
    expect(spec.paths!["/pets"]?.get?.summary).toBe("List pets")
  })

  it("ignores routes without metadata", () => {
    const app = new Hono()
    app.get("/pets", (c) => c.json({}))
    const spec = getOpenAPISpec(app, { title: "Test", version: "1.0.0" })
    expect(spec.paths).toEqual({})
  })

  it("returns empty paths for app with no documented routes", () => {
    const app = new Hono()
    app.get("/health", () => new Response("ok"))
    const spec = getOpenAPISpec(app, { title: "Test", version: "1.0.0" })
    expect(spec.paths).toEqual({})
  })

  it("works with custom scanner", () => {
    const customScanner: RouteScanner = {
      scan: () => [
        {
          path: "/custom",
          method: "GET",
          config: { responses: { "200": { description: "OK" } }, handler: () => new Response() },
        },
      ],
    }
    const spec = getOpenAPISpec(null, { title: "Test", version: "1.0.0" }, customScanner)
    expect(spec.paths!["/custom"]?.get?.responses?.["200"]?.description).toBe("OK")
  })

  it("uses explicit scanner over global default", () => {
    const explicitScanner: RouteScanner = {
      scan: () => [
        {
          path: "/explicit",
          method: "GET",
          config: {
            responses: { "200": { description: "Explicit" } },
            handler: () => new Response(),
          },
        },
      ],
    }
    const spec = getOpenAPISpec(null, { title: "T", version: "1.0.0" }, explicitScanner)
    expect(spec.paths!["/explicit"]?.get?.responses?.["200"]?.description).toBe("Explicit")
  })
})
