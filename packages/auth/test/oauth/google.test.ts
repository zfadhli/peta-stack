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

  it("completes full callback flow with PKCE", async () => {
    const originalFetch = globalThis.fetch
    const mockFetch = async (url: string) => {
      if (url.includes("token")) {
        return new Response(
          JSON.stringify({
            access_token: "google-token",
            id_token: "mock-id",
            expires_in: 3600,
            scope: "openid email",
            token_type: "bearer",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        )
      }
      if (url.includes("userinfo")) {
        return new Response(
          JSON.stringify({
            sub: "12345",
            name: "Google User",
            email: "user@google.com",
            email_verified: true,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        )
      }
      return new Response("Not found", { status: 404 })
    }
    globalThis.fetch = mockFetch as typeof globalThis.fetch

    try {
      const handler = defineOAuthGoogleEventHandler({
        config: {
          clientId: "google-client",
          clientSecret: "google-secret",
        },
        async onSuccess({ user, tokens }) {
          return new Response(
            JSON.stringify({ name: (user as any).name, token: (tokens as any).access_token }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          )
        },
      })

      const res = await handler(
        new Request("http://localhost/auth/google?code=mock-code&state=teststate", {
          headers: {
            cookie: "peta-auth-state=teststate; peta-auth-pkce=mock-verifier",
          },
        }),
      )

      const body = await res.json()
      expect(res.status).toBe(200)
      expect(body.name).toBe("Google User")
      expect(body.token).toBe("google-token")
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it("rejects when PKCE verifier is missing in callback", async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () => new Response("Server Error", { status: 500 })

    try {
      const handler = defineOAuthGoogleEventHandler({
        config: { clientId: "x", clientSecret: "y" },
        async onSuccess() {
          return new Response(null, { status: 200 })
        },
      })

      await expect(
        handler(
          new Request("http://localhost/auth/google?code=mock-code&state=teststate", {
            headers: { cookie: "peta-auth-state=teststate" }, // NO pkce cookie
          }),
        ),
      ).rejects.toThrow()
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
