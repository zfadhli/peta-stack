import { Hono } from "hono"
import { hashPassword, verifyPassword } from "peta-auth"
import { session } from "peta-auth/hono"

const app = new Hono()

const users = new Map<string, { hash: string; name: string }>()

app.use(
  "*",
  session({
    password: process.env.SESSION_SECRET ?? "demo-secret-key-at-least-32-chars!!",
    cookieName: "my-session",
  }),
)

app.post("/signup", async (c) => {
  const { email, password, name } = await c.req.json()
  if (users.has(email)) return c.json({ error: "Email already registered" }, 409)
  users.set(email, { hash: await hashPassword(password), name })
  return c.json({ ok: true })
})

app.post("/login", async (c) => {
  const { email, password } = await c.req.json()
  const user = users.get(email)
  if (!user || !(await verifyPassword(user.hash, password))) {
    return c.json({ error: "Invalid email or password" }, 401)
  }
  Object.assign(c.var.session, { user: { email, name: user.name }, loggedInAt: Date.now() })
  await c.var.session.save()
  return c.json({ ok: true })
})

app.get("/profile", (c) => {
  const s = c.var.session
  if (!s.user) return c.json({ error: "Not logged in" }, 401)
  return c.json(s.user)
})

app.post("/logout", (c) => {
  c.var.session.destroy()
  return c.json({ ok: true })
})

export default app
