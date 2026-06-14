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
    expect(params.find((p) => p!.name === "page")?.schema).toMatchObject({ type: "integer", minimum: 1, default: 1 })
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
      type: "string",
      enum: ["name", "-name", "age", "-age"],
    })
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
    expect(incParam?.schema).toMatchObject({ type: "string", enum: ["owner", "vet"] })
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
})
