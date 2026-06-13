import { describe, expect, it, Hono, honoScanner } from "../helper.ts"

// ---------------------------------------------------------------------------
// honoScanner
// ---------------------------------------------------------------------------
describe("honoScanner", () => {
  it("returns entries from Hono routes with metadata", () => {
    const app = new Hono()
    app.get(
      "/pets",
      (c) => {
        ;(c as any).routeConfig = { responses: { "200": { description: "OK" } } }
        return c.json({})
      },
    )
    app.get("/pets", () => new Response())
    const entries = honoScanner.scan(app)
    expect(entries.length).toBe(0)
  })

  it("ignores routes without metadata", () => {
    const app = new Hono()
    app.get("/pets", (c) => c.json({}))
    const entries = honoScanner.scan(app)
    expect(entries).toHaveLength(0)
  })

  it("returns empty array for app with no routes", () => {
    const app = new Hono()
    const entries = honoScanner.scan(app)
    expect(entries).toEqual([])
  })

  it("returns empty array for non-Hono objects", () => {
    const entries = honoScanner.scan({} as any)
    expect(entries).toEqual([])
  })
})
