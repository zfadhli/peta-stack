import { describe, expect, it } from "bun:test"
import { Elysia } from "elysia"
import { elysiaScanner } from "../../src/elysia/scanner.ts"
import { route } from "../../src/hono/index.ts"

describe("elysiaScanner", () => {
  it("returns entries from Elysia routes with metadata", () => {
    const app = new Elysia()

    app.get(
      "/pets",
      route()
        .summary("List pets")
        .response(200, { description: "OK" })
        .handle(() => new Response()) as any,
    )

    const entries = elysiaScanner.scan(app)
    expect(entries).toHaveLength(1)
    expect(entries[0]!.path).toBe("/pets")
    expect(entries[0]!.method).toBe("GET")
    expect(entries[0]!.config.summary).toBe("List pets")
  })

  it("ignores routes without metadata", () => {
    const app = new Elysia()
    app.get("/health", () => "ok")
    const entries = elysiaScanner.scan(app)
    expect(entries).toHaveLength(0)
  })

  it("returns empty array for app with no routes", () => {
    const app = new Elysia()
    const entries = elysiaScanner.scan(app)
    expect(entries).toEqual([])
  })

  it("returns empty array for non-Elysia objects", () => {
    expect(elysiaScanner.scan({})).toEqual([])
    expect(elysiaScanner.scan(null)).toEqual([])
  })
})
