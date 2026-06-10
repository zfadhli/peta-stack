import { describe, expect, it } from "bun:test"
import { Elysia } from "elysia"
import { requireSession, session } from "../src/elysia.ts"

const password = { 1: "a".repeat(32) }
const cookieName = "ely-session"

function createApp() {
  return new Elysia()
    .use(session({ password, cookieName }))
    .post("/login", async ({ session: s, body }: any) => {
      s.user = { name: body.name }
      await s.save()
      return Response.json({ ok: true })
    })
    .get("/profile", ({ session: s }) => {
      if (!s.user) return Response.json({ error: "unauthorized" }, { status: 401 })
      return Response.json(s.user)
    })
    .post("/logout", ({ session: s }) => {
      s.destroy()
      return Response.json({ ok: true })
    })
    .get("/views", async ({ session: s }) => {
      s.views = (s.views ?? 0) + 1
      await s.save()
      return Response.json({ views: s.views })
    })
}

function createGuardApp() {
  return new Elysia()
    .use(session({ password, cookieName }))
    .post("/login", async ({ session: s, body }: any) => {
      s.user = { name: body.name }
      await s.save()
      return Response.json({ ok: true })
    })
    .get("/public", () => Response.json({ ok: true }))
    .use(requireSession())
    .get("/profile", ({ session: s }) => Response.json(s.user))
}

describe("Elysia adapter", () => {
  const app = createApp()

  it("returns 401 without login", async () => {
    const res = await app.handle(new Request("http://localhost/profile"))
    expect(res.status).toBe(401)
  })

  it("logs in and persists session", async () => {
    const login = await app.handle(
      new Request("http://localhost/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Jason" }),
      }),
    )
    expect((await login.json()).ok).toBe(true)

    const cookie = login.headers.getSetCookie()[0]
    const profile = await app.handle(new Request("http://localhost/profile", { headers: { cookie } }))
    expect((await profile.json()).name).toBe("Jason")
  })

  it("increments views counter", async () => {
    const login = await app.handle(
      new Request("http://localhost/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "V" }),
      }),
    )
    let cookie = login.headers.getSetCookie()[0]

    const r1 = await app.handle(new Request("http://localhost/views", { headers: { cookie } }))
    expect((await r1.json()).views).toBe(1)
    cookie = r1.headers.getSetCookie()[0]

    const r2 = await app.handle(new Request("http://localhost/views", { headers: { cookie } }))
    expect((await r2.json()).views).toBe(2)
  })

  it("clears session on logout", async () => {
    const login = await app.handle(
      new Request("http://localhost/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "J" }),
      }),
    )
    const cookie = login.headers.getSetCookie()[0]

    const logout = await app.handle(new Request("http://localhost/logout", { method: "POST", headers: { cookie } }))
    const clearedCookie = logout.headers.getSetCookie()[0]

    const profile = await app.handle(new Request("http://localhost/profile", { headers: { cookie: clearedCookie } }))
    expect(profile.status).toBe(401)
  })
})

function createKeyGuardApp() {
  return new Elysia()
    .use(session({ password, cookieName }))
    .post("/login", async ({ session: s, body }: any) => {
      s.user = { name: body.name }
      s.userId = body.name === "Alice" ? 42 : 0
      await s.save()
      return Response.json({ ok: true })
    })
    .get("/public", () => Response.json({ ok: true }))
    .use(requireSession("userId"))
    .get("/admin/profile", ({ session: s }) => Response.json({ userId: s.userId }))
}

describe("Elysia requireSession", () => {
  const app = createGuardApp()

  it("returns 401 for protected route without session", async () => {
    const res = await app.handle(new Request("http://localhost/profile"))
    expect(res.status).toBe(401)
  })

  it("allows public route without session", async () => {
    const res = await app.handle(new Request("http://localhost/public"))
    expect(res.status).toBe(200)
  })

  it("allows protected route with session", async () => {
    const login = await app.handle(
      new Request("http://localhost/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Alice" }),
      }),
    )
    const cookie = login.headers.getSetCookie()[0]
    const profile = await app.handle(new Request("http://localhost/profile", { headers: { cookie } }))
    expect(profile.status).toBe(200)
    expect((await profile.json()).name).toBe("Alice")
  })
})

describe("Elysia requireSession with key", () => {
  const app = createKeyGuardApp()

  it("returns 401 when key is missing", async () => {
    const res = await app.handle(new Request("http://localhost/admin/profile"))
    expect(res.status).toBe(401)
  })

  it("returns 401 when key is falsy", async () => {
    const login = await app.handle(
      new Request("http://localhost/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Bob" }),
      }),
    )
    const cookie = login.headers.getSetCookie()[0]
    const res = await app.handle(new Request("http://localhost/admin/profile", { headers: { cookie } }))
    expect(res.status).toBe(401)
  })

  it("allows when key is truthy", async () => {
    const login = await app.handle(
      new Request("http://localhost/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Alice" }),
      }),
    )
    const cookie = login.headers.getSetCookie()[0]
    const res = await app.handle(new Request("http://localhost/admin/profile", { headers: { cookie } }))
    expect(res.status).toBe(200)
  })
})
