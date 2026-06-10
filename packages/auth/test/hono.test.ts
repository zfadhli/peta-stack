import { describe, expect, it } from "bun:test"
import { Hono } from "hono"
import { requireSession, session } from "../src/hono.ts"

const password = { 1: "a".repeat(32) }
const cookieName = "hono-session"

function createApp() {
  const app = new Hono()
  app.use("*", session({ password, cookieName }))

  app.post("/login", async (c) => {
    const { name } = await c.req.json()
    Object.assign(c.var.session, { user: { name }, loggedInAt: Date.now() })
    await c.var.session.save()
    return c.json({ ok: true })
  })

  app.get("/profile", (c) => {
    const s = c.var.session
    if (!s.user) return c.json({ error: "unauthorized" }, 401)
    return c.json(s.user)
  })

  app.post("/logout", (c) => {
    c.var.session.destroy()
    return c.json({ ok: true })
  })

  app.get("/views", async (c) => {
    const s = c.var.session
    s.views = (s.views ?? 0) + 1
    await s.save()
    return c.json({ views: s.views })
  })

  return app
}

function createGuardApp() {
  const app = new Hono()
  app.use("*", session({ password, cookieName }))
  app.use("/protected/*", requireSession())

  app.post("/login", async (c) => {
    const { name } = await c.req.json()
    Object.assign(c.var.session, { user: { name }, loggedInAt: Date.now() })
    await c.var.session.save()
    return c.json({ ok: true })
  })

  app.get("/protected/profile", (c) => {
    return c.json(c.var.session.user)
  })

  app.get("/public", (c) => c.json({ ok: true }))

  return app
}

describe("Hono adapter", () => {
  const app = createApp()

  it("returns 401 without login", async () => {
    const res = await app.request("/profile")
    expect(res.status).toBe(401)
  })

  it("logs in and persists session", async () => {
    const login = await app.request("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Jason" }),
    })
    expect((await login.json()).ok).toBe(true)

    const cookie = login.headers.getSetCookie()[0]
    const profile = await app.request("/profile", { headers: { cookie } })
    expect((await profile.json()).name).toBe("Jason")
  })

  it("increments views counter", async () => {
    const login = await app.request("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "V" }),
    })
    let cookie = login.headers.getSetCookie()[0]

    const r1 = await app.request("/views", { headers: { cookie } })
    expect((await r1.json()).views).toBe(1)
    cookie = r1.headers.getSetCookie()[0]

    const r2 = await app.request("/views", { headers: { cookie } })
    expect((await r2.json()).views).toBe(2)
  })

  it("clears session on logout", async () => {
    const login = await app.request("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "J" }),
    })
    const cookie = login.headers.getSetCookie()[0]

    const logout = await app.request("/logout", { method: "POST", headers: { cookie } })
    const clearedCookie = logout.headers.getSetCookie()[0]

    const profile = await app.request("/profile", { headers: { cookie: clearedCookie } })
    expect(profile.status).toBe(401)
  })
})

function createKeyGuardApp() {
  const app = new Hono()
  app.use("*", session({ password, cookieName }))
  app.post("/login", async (c) => {
    const { name } = await c.req.json()
    Object.assign(c.var.session, { user: { name }, userId: name === "Alice" ? 42 : 0 })
    await c.var.session.save()
    return c.json({ ok: true })
  })
  app.use("/admin/*", requireSession("userId"))
  app.get("/admin/profile", (c) => c.json({ userId: c.var.session.userId }))
  app.get("/public", (c) => c.json({ ok: true }))
  return app
}

describe("Hono requireSession", () => {
  const app = createGuardApp()

  it("returns 401 for protected route without session", async () => {
    const res = await app.request("/protected/profile")
    expect(res.status).toBe(401)
  })

  it("allows public route without session", async () => {
    const res = await app.request("/public")
    expect(res.status).toBe(200)
  })

  it("allows protected route with session", async () => {
    const login = await app.request("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Alice" }),
    })
    const cookie = login.headers.getSetCookie()[0]
    const profile = await app.request("/protected/profile", { headers: { cookie } })
    expect(profile.status).toBe(200)
    expect((await profile.json()).name).toBe("Alice")
  })
})

describe("Hono requireSession with key", () => {
  const app = createKeyGuardApp()

  it("returns 401 when key is missing", async () => {
    const res = await app.request("/admin/profile")
    expect(res.status).toBe(401)
  })

  it("returns 401 when key is falsy", async () => {
    const login = await app.request("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Bob" }),
    })
    const cookie = login.headers.getSetCookie()[0]
    const res = await app.request("/admin/profile", { headers: { cookie } })
    expect(res.status).toBe(401)
  })

  it("allows when key is truthy", async () => {
    const login = await app.request("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Alice" }),
    })
    const cookie = login.headers.getSetCookie()[0]
    const res = await app.request("/admin/profile", { headers: { cookie } })
    expect(res.status).toBe(200)
  })
})
