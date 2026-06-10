import { Hono } from "hono"
import { session } from "peta-auth/hono"

const app = new Hono()

app.use(
  "*",
  session({
    password: process.env.SESSION_SECRET ?? "demo-secret-key-at-least-32-chars!!",
    cookieName: "my-session",
  }),
)

app.get("/profile", (c) => {
  const s = c.var.session
  if (!s.user) return c.json({ error: "Not logged in" }, 401)
  return c.json(s.user)
})

app.post("/login", async (c) => {
  const { name } = await c.req.json()
  Object.assign(c.var.session, { user: { name }, loggedInAt: Date.now() })
  await c.var.session.save()
  return c.json({ ok: true })
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

export default app
