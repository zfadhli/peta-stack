import { Elysia } from "elysia"
import { requireSession, session } from "peta-auth/elysia"

new Elysia()
  .use(
    session({
      password: process.env.SESSION_SECRET ?? "demo-secret-key-at-least-32-chars!!",
      cookieName: "ely-session",
    }),
  )
  .post("/login", async ({ session: s, body }: any) => {
    s.user = { name: body.name }
    s.userId = Date.now()
    await s.save()
    return Response.json({ ok: true })
  })
  .get("/public", () => Response.json({ message: "this is public" }))
  // Guard: any session data (positional — everything below is guarded)
  .use(requireSession())
  .get("/protected/profile", ({ session: s }) => Response.json(s.user))
  .get("/admin/dashboard", ({ session: s }) => Response.json({ userId: s.userId }))
  .listen(3000)
