import { Elysia } from "elysia"
import { session } from "../src/elysia.js"

const app = new Elysia()
  .use(
    session({
      password: process.env.SESSION_SECRET ?? "demo-secret-key-at-least-32-chars!!",
      cookieName: "my-session",
    }),
  )
  .get("/profile", ({ session: s }) => {
    if (!s.user) return Response.json({ error: "Not logged in" }, { status: 401 })
    return Response.json(s.user)
  })
  .post("/login", async ({ session: s, body }: any) => {
    s.user = { name: body.name }
    s.loggedInAt = Date.now()
    await s.save()
    return Response.json({ ok: true })
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

export default app
