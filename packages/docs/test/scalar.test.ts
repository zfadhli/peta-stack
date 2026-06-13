import { describe, expect, it, serveScalarUI } from "./helper.ts"

// ---------------------------------------------------------------------------
// serveScalarUI
// ---------------------------------------------------------------------------
describe("serveScalarUI", () => {
  function mockHtml(): { html(s: string): Response } {
    return { html: (s) => new Response(s) }
  }

  it("returns a function", () => {
    const handler = serveScalarUI({ specUrl: "/openapi.json" })
    expect(typeof handler).toBe("function")
  })

  it("generates HTML with spec URL", async () => {
    const handler = serveScalarUI({ specUrl: "/custom-spec.json" })
    const res = await handler(mockHtml())
    expect(await res.text()).toContain("/custom-spec.json")
  })

  it("generates HTML with custom title", async () => {
    const handler = serveScalarUI({ specUrl: "/spec.json", title: "My API" })
    const res = await handler(mockHtml())
    expect(await res.text()).toContain("My API")
  })

  it("generates HTML with custom theme", async () => {
    const handler = serveScalarUI({ specUrl: "/spec.json", theme: "purple" })
    const res = await handler(mockHtml())
    const html = await res.text()
    expect(html).toContain("purple")
    expect(html).toContain("data-configuration=")
  })

  it("includes Scalar CDN script", async () => {
    const handler = serveScalarUI({ specUrl: "/openapi.json" })
    const res = await handler(mockHtml())
    const html = await res.text()
    expect(html).toContain("https://cdn.jsdelivr.net/npm/@scalar/api-reference")
  })

  it("uses #api-reference div as mount target", async () => {
    const handler = serveScalarUI({ specUrl: "/openapi.json" })
    const res = await handler(mockHtml())
    const html = await res.text()
    expect(html).toContain('id="api-reference"')
  })

  it("passes spec URL via data-url attribute", async () => {
    const handler = serveScalarUI({ specUrl: "/spec.json" })
    const res = await handler(mockHtml())
    const html = await res.text()
    expect(html).toContain('data-url="/spec.json"')
  })

  it("passes configuration via data-configuration attribute", async () => {
    const handler = serveScalarUI({ specUrl: "/spec.json", theme: "purple", showSidebar: false })
    const res = await handler(mockHtml())
    const html = await res.text()
    expect(html).toContain("data-configuration=")
    expect(html).toContain("purple")
    expect(html).toContain("false")
  })

  it("places script tag after mount div", async () => {
    const handler = serveScalarUI({ specUrl: "/spec.json" })
    const res = await handler(mockHtml())
    const html = await res.text()
    const divPos = html.indexOf('<div id="api-reference"')
    const scriptPos = html.indexOf("<script src=")
    expect(divPos).toBeGreaterThan(0)
    expect(scriptPos).toBeGreaterThan(divPos)
  })

  it("escapes HTML in title", async () => {
    const handler = serveScalarUI({ specUrl: "/spec.json", title: '<script>alert("xss")</script>' })
    const res = await handler(mockHtml())
    const html = await res.text()
    expect(html).not.toContain("<script>")
    expect(html).toContain("&lt;script&gt;")
  })
})
