import { describe, expect, it } from "bun:test"
import { defineOAuthGoogleEventHandler } from "../../src/oauth/google.js"

describe("Google OAuth handler", () => {
  it("redirects to Google when no code", async () => {
    const handler = defineOAuthGoogleEventHandler({
      config: {
        clientId: "test-client",
        clientSecret: "test-secret",
      },
      async onSuccess({ user, tokens, request }) {
        return new Response(null, { status: 302, headers: { Location: "/" } })
      },
    })

    const res = await handler(new Request("http://localhost/auth/google"))
    expect(res.status).toBe(302)
    const location = res.headers.get("Location")!
    expect(location).toContain("accounts.google.com")
    expect(location).toContain("client_id=test-client")
  })

  it("handles OAuth error from provider", async () => {
    const handler = defineOAuthGoogleEventHandler({
      config: { clientId: "x", clientSecret: "y" },
      onError(error) {
        return new Response(JSON.stringify({ err: error.message }), { status: 400 })
      },
      async onSuccess({ user, tokens }) {
        return new Response(null, { status: 200 })
      },
    })

    const res = await handler(new Request("http://localhost/auth/google?error=access_denied"))
    const body = await res.json()
    expect(body.err).toContain("access_denied")
  })
})
