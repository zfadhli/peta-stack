import { Elysia } from "elysia"
import { hashPassword, verifyPassword } from "peta-auth"
import { session } from "peta-auth/elysia"

const users = new Map<string, { hash: string; name: string }>()

new Elysia()
  .use(
    session({
      password: process.env.SESSION_SECRET ?? "demo-secret-key-at-least-32-chars!!",
      cookieName: "my-session",
    }),
  )
  .post("/signup", async ({ session: s, body }: any) => {
    const { email, password, name } = body
    if (users.has(email)) return Response.json({ error: "Email already registered" }, { status: 409 })
    users.set(email, { hash: await hashPassword(password), name })
    return Response.json({ ok: true })
  })
  .post("/login", async ({ session: s, body }: any) => {
    const { email, password } = body
    const user = users.get(email)
    if (!user || !(await verifyPassword(user.hash, password))) {
      return Response.json({ error: "Invalid email or password" }, { status: 401 })
    }
    s.user = { email, name: user.name }
    s.loggedInAt = Date.now()
    await s.save()
    return Response.json({ ok: true })
  })
  .get("/profile", ({ session: s }) => {
    if (!s.user) return Response.json({ error: "Not logged in" }, { status: 401 })
    return Response.json(s.user)
  })
  .post("/logout", ({ session: s }) => {
    s.destroy()
    return Response.json({ ok: true })
  })
  .listen(3000)
