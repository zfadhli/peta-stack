import { Hono } from "hono"
import { requireSession, session } from "../src/hono.js"

const app = new Hono()

app.use(
  "*",
  session({
    password: process.env.SESSION_SECRET ?? "demo-secret-key-at-least-32-chars!!",
    cookieName: "my-session",
  }),
)

app.post("/login", async (c) => {
  const { name } = await c.req.json()
  Object.assign(c.var.session, { user: { name }, userId: Date.now(), loggedInAt: Date.now() })
  await c.var.session.save()
  return c.json({ ok: true })
})

app.get("/public", (c) => c.json({ message: "this is public" }))

// Guard: any session data required
app.use("/protected/*", requireSession())

app.get("/protected/profile", (c) => {
  return c.json(c.var.session.user)
})

// Guard: specific key must be truthy (e.g. userId)
app.use("/admin/*", requireSession("userId"))

app.get("/admin/dashboard", (c) => {
  return c.json({ userId: c.var.session.userId })
})

export default app
