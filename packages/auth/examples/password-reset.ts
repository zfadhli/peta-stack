import { Hono } from "hono"
import { createPasswordResetToken, hashPassword, resetPassword, verifyPassword } from "peta-auth"
import { requireSession, session } from "peta-auth/hono"

const app = new Hono()
const SECRET = process.env.SESSION_SECRET ?? "demo-secret-key-at-least-32-chars!!"
const users = new Map<string, { hash: string; name: string; email: string }>()

app.use("*", session({ password: SECRET, cookieName: "my-session" }))

// Signup
app.post("/signup", async (c) => {
  const { email, password, name } = await c.req.json()
  if (users.has(email)) return c.json({ error: "Email already registered" }, 409)
  users.set(email, { hash: await hashPassword(password), name, email })
  return c.json({ ok: true })
})

// Login
app.post("/login", async (c) => {
  const { email, password } = await c.req.json()
  const user = users.get(email)
  if (!user || !(await verifyPassword(user.hash, password))) {
    return c.json({ error: "Invalid email or password" }, 401)
  }
  Object.assign(c.var.session, { user: { email, name: user.name } })
  await c.var.session.save()
  return c.json({ ok: true })
})

// Forgot password — generate a reset token
app.post("/forgot-password", async (c) => {
  const { email } = await c.req.json()
  const user = users.get(email)
  if (!user) return c.json({ ok: true }) // don't reveal whether email exists
  const token = await createPasswordResetToken(email, { password: SECRET })
  // In production, email the token as a link:
  // https://example.com/reset-password?token=${token}
  console.log(`Reset token for ${email}: ${token}`)
  return c.json({ ok: true })
})

// Reset password — verify token + set new password
app.post("/reset-password", async (c) => {
  const { token, newPassword } = await c.req.json()
  const result = await resetPassword(token, newPassword, SECRET)
  if (!result) return c.json({ error: "Invalid or expired token" }, 400)
  const user = users.get(result.userId)
  if (!user) return c.json({ error: "User not found" }, 404)
  user.hash = result.hash
  return c.json({ ok: true })
})

app.use("/profile", requireSession())

app.get("/profile", (c) => c.json(c.var.session.user))

export default app
