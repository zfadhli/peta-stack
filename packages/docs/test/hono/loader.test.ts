import {
  describe,
  expect,
  getOpenAPISpec,
  Hono,
  it,
  linkNodeModules,
  loadRoutes,
  mkdirSync,
  writeFileSync,
} from "../helper.ts"

// ---------------------------------------------------------------------------
// loadRoutes
// ---------------------------------------------------------------------------
const cwd = process.cwd()

describe("loadRoutes", () => {
  it("loads and mounts route modules under default /api basePath", async () => {
    const app = new Hono()
    await loadRoutes(app, "examples/structured/routes")
    const spec = getOpenAPISpec(app, { title: "T", version: "1.0.0" })
    expect(spec.paths!["/api/pets"]?.get?.summary).toBe("List all pets")
  })

  it("does not crash on invalid directories", async () => {
    const app = new Hono()
    await loadRoutes(app, "/tmp/non-existent")
    const spec = getOpenAPISpec(app, { title: "T", version: "1.0.0" })
    expect(spec.paths).toEqual({})
  })

  it("mounts under custom basePath when provided", async () => {
    const app = new Hono()
    await loadRoutes(app, "examples/structured/routes", {
      basePath: "/v2",
    })
    const spec = getOpenAPISpec(app, { title: "T", version: "1.0.0" }, undefined, { basePath: "/v2" })
    expect(spec.paths!["/v2/pets"]?.get?.summary).toBe("List all pets")
    expect(spec.paths!["/v2/pets"]?.get?.tags).toEqual(["pets"])
    expect(spec.paths!["/v2/species"]?.get?.tags).toEqual(["species"])
  })

  it("loads nested routes with [id] param convention", async () => {
    const tmp = `/tmp/_nested_test_${Date.now()}`
    mkdirSync(tmp, { recursive: true })
    linkNodeModules(tmp)
    const postsDir = `${tmp}/posts`
    const idDir = `${postsDir}/[id]`
    mkdirSync(idDir, { recursive: true })

    writeFileSync(
      `${postsDir}/index.ts`,
      `
import { Hono } from "hono";
import { route } from "${cwd}/src/hono/index.ts";
const app = new Hono();
app.get("/", route()
  .summary("List posts")
  .response(200, { description: "OK" })
  .handle(() => new Response()));
export default app;
`,
    )
    writeFileSync(
      `${idDir}/index.ts`,
      `
import { type } from "arktype";
import { Hono } from "hono";
import { route } from "${cwd}/src/hono/index.ts";
const app = new Hono();
app.get("/", route()
  .summary("Get post by ID")
  .params(type({ id: "string" }))
  .response(200, { description: "OK" })
  .handle((c) => c.json({ id: (c.req.valid("param") as any).id })));
export default app;
`,
    )

    const app = new Hono()
    await loadRoutes(app, tmp)
    const spec = getOpenAPISpec(app, { title: "T", version: "1.0.0" })
    expect(spec.paths!["/api/posts"]?.get?.summary).toBe("List posts")
    expect(spec.paths!["/api/posts/{id}"]?.get?.summary).toBe("Get post by ID")
  })

  it("loads deeply nested routes", async () => {
    const tmp = `/tmp/_deep_test_${Date.now()}`
    const petsDir = `${tmp}/pets`
    const idDir = `${petsDir}/[id]`
    const commentsDir = `${idDir}/comments`
    mkdirSync(commentsDir, { recursive: true })
    linkNodeModules(tmp)

    writeFileSync(
      `${petsDir}/index.ts`,
      `import { Hono } from "hono";\nimport { route } from "${cwd}/src/hono/index.ts";\nconst app = new Hono();\napp.get("/", route().summary("List pets").response(200, { description: "OK" }).handle(() => new Response()));\nexport default app;\n`,
    )
    writeFileSync(
      `${idDir}/index.ts`,
      `import { Hono } from "hono";\nimport { route } from "${cwd}/src/hono/index.ts";\nconst app = new Hono();\napp.get("/", route().summary("Get pet").response(200, { description: "OK" }).handle(() => new Response()));\nexport default app;\n`,
    )
    writeFileSync(
      `${commentsDir}/index.ts`,
      `import { Hono } from "hono";\nimport { route } from "${cwd}/src/hono/index.ts";\nconst app = new Hono();\napp.get("/", route().summary("List comments").response(200, { description: "OK" }).handle(() => new Response()));\nexport default app;\n`,
    )

    const app = new Hono()
    await loadRoutes(app, tmp)
    const spec = getOpenAPISpec(app, { title: "T", version: "1.0.0" })
    expect(spec.paths!["/api/pets"]?.get?.summary).toBe("List pets")
    expect(spec.paths!["/api/pets/{id}"]?.get?.summary).toBe("Get pet")
    expect(spec.paths!["/api/pets/{id}/comments"]?.get?.summary).toBe("List comments")
  })

  it("handles gap directories (no index.ts at intermediate levels)", async () => {
    const tmp = `/tmp/_gap_test_${Date.now()}`
    const settingsDir = `${tmp}/admin/[id]/settings`
    mkdirSync(settingsDir, { recursive: true })
    linkNodeModules(tmp)

    writeFileSync(
      `${settingsDir}/index.ts`,
      `import { Hono } from "hono";\nimport { route } from "${cwd}/src/hono/index.ts";\nconst app = new Hono();\napp.get("/", route().summary("Get settings").response(200, { description: "OK" }).handle(() => new Response()));\nexport default app;\n`,
    )

    const app = new Hono()
    await loadRoutes(app, tmp)
    const spec = getOpenAPISpec(app, { title: "T", version: "1.0.0" })
    expect(spec.paths!["/api/admin/{id}/settings"]?.get?.summary).toBe("Get settings")
  })
})
