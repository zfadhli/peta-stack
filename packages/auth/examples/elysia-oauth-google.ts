import { Elysia } from "elysia"
import { session } from "peta-auth/elysia"
import { defineOAuthGoogleEventHandler } from "peta-auth/oauth/google"

const googleHandler = defineOAuthGoogleEventHandler({
  config: {
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  },
  async onSuccess({ user, tokens }) {
    return new Response(null, { status: 302, headers: { Location: "/" } })
  },
})

new Elysia()
  .use(
    session({
      password: process.env.SESSION_SECRET ?? "demo-secret-key-at-least-32-chars!!",
      cookieName: "my-session",
    }),
  )
  .get("/auth/google", async ({ request }) => googleHandler(request))
  .post("/logout", ({ session: s }) => {
    s.destroy()
    return Response.json({ ok: true })
  })
  .listen(3000)
