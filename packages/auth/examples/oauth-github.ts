import { Hono } from "hono"
import { session } from "../src/hono.js"
import { defineOAuthGitHubEventHandler } from "../src/oauth/github.js"

const app = new Hono()

app.use(
  "*",
  session({
    password: process.env.SESSION_SECRET ?? "demo-secret-key-at-least-32-chars!!",
    cookieName: "my-session",
  }),
)

const githubHandler = defineOAuthGitHubEventHandler({
  config: {
    clientId: process.env.GITHUB_CLIENT_ID!,
    clientSecret: process.env.GITHUB_CLIENT_SECRET!,
  },
  async onSuccess({ user, tokens }) {
    // The `user` and `tokens` from the OAuth provider are available here.
    // To set a session, use `createSessionFromAdapter` with the `request`
    // param: onSuccess({ user, tokens, request })
    return new Response(null, {
      status: 302,
      headers: { Location: "/" },
    })
  },
})

app.post("/logout", (c) => {
  c.var.session.destroy()
  return c.json({ ok: true })
})

app.get("/auth/github", async (c) => githubHandler(c.req.raw))

export default app
