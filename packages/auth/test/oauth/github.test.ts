import { describe, expect, it } from "bun:test"
import { defineOAuthGitHubEventHandler } from "../../src/oauth/github.js"

describe("GitHub OAuth handler", () => {
  it("redirects to GitHub when no code", async () => {
    const handler = defineOAuthGitHubEventHandler({
      config: {
        clientId: "test-client",
        clientSecret: "test-secret",
      },
      async onSuccess({ user, tokens, request }) {
        return new Response(null, { status: 302, headers: { Location: "/" } })
      },
    })

    const res = await handler(new Request("http://localhost/auth/github"))
    expect(res.status).toBe(302)
    const location = res.headers.get("Location")!
    expect(location).toContain("github.com/login/oauth/authorize")
    expect(location).toContain("client_id=test-client")
  })

  it("handles OAuth error from provider", async () => {
    const handler = defineOAuthGitHubEventHandler({
      config: { clientId: "x", clientSecret: "y" },
      onError(error) {
        return new Response(JSON.stringify({ err: error.message }), { status: 400 })
      },
      async onSuccess({ user, tokens }) {
        return new Response(null, { status: 200 })
      },
    })

    const res = await handler(new Request("http://localhost/auth/github?error=access_denied"))
    const body = await res.json()
    expect(body.err).toContain("access_denied")
  })
})
