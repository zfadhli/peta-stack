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

  it("completes full callback flow on success with a valid code and state", async () => {
    const originalFetch = globalThis.fetch
    const mockFetch = async (url: string, _options?: RequestInit) => {
      if (url.includes("token")) {
        return new Response(
          JSON.stringify({ access_token: "mock-token", scope: "user", token_type: "bearer" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        )
      }
      if (url.includes("/user") && !url.includes("/emails")) {
        return new Response(
          JSON.stringify({ login: "testuser", id: 1, name: "Test", email: "test@example.com" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        )
      }
      return new Response("Not found", { status: 404 })
    }
    globalThis.fetch = mockFetch as typeof globalThis.fetch

    try {
      const handler = defineOAuthGitHubEventHandler({
        config: {
          clientId: "test-client",
          clientSecret: "test-secret",
        },
        async onSuccess({ user, tokens }) {
          return new Response(
            JSON.stringify({ user: user.login, token: (tokens as any).access_token }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          )
        },
      })

      const res = await handler(
        new Request("http://localhost/auth/github?code=mock-code&state=teststate", {
          headers: { cookie: "peta-auth-state=teststate" },
        }),
      )

      const body = await res.json()
      expect(res.status).toBe(200)
      expect(body.user).toBe("testuser")
      expect(body.token).toBe("mock-token")
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it("returns 500 on state mismatch in callback", async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () => new Response("unused", { status: 500 })

    try {
      const handler = defineOAuthGitHubEventHandler({
        config: {
          clientId: "test-client",
          clientSecret: "test-secret",
        },
        async onSuccess({ user }) {
          return new Response(null, { status: 200 })
        },
      })

      const res = await handler(
        new Request("http://localhost/auth/github?code=mock-code&state=wrongstate", {
          headers: { cookie: "peta-auth-state=expectedstate" },
        }),
      )

      expect(res.status).toBe(500)
      const body = await res.json()
      expect(body.error).toContain("state mismatch")
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it("rejects when token exchange fails with 500", async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () => new Response("Server Error", { status: 500 })

    try {
      const handler = defineOAuthGitHubEventHandler({
        config: { clientId: "x", clientSecret: "y" },
        async onSuccess() {
          return new Response(null, { status: 200 })
        },
      })

      await expect(
        handler(
          new Request("http://localhost/auth/github?code=bad-code&state=teststate", {
            headers: { cookie: "peta-auth-state=teststate" },
          }),
        ),
      ).rejects.toThrow("OAuth token request failed: 500")
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it("handles email fetch when email is missing and emailRequired is true", async () => {
    const originalFetch = globalThis.fetch
    let fetchCount = 0
    const mockFetch = async (url: string) => {
      fetchCount++
      if (url.includes("token")) {
        return new Response(
          JSON.stringify({ access_token: "token", scope: "user:email", token_type: "bearer" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        )
      }
      if (url.includes("/user") && !url.includes("/emails")) {
        return new Response(
          JSON.stringify({ login: "testuser", id: 1, name: "Test", email: null }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        )
      }
      if (url.includes("/user/emails")) {
        return new Response(
          JSON.stringify([{ email: "primary@example.com", primary: true, verified: true }]),
          { status: 200, headers: { "Content-Type": "application/json" } },
        )
      }
      return new Response("Not found", { status: 404 })
    }
    globalThis.fetch = mockFetch as typeof globalThis.fetch

    try {
      const handler = defineOAuthGitHubEventHandler({
        config: {
          clientId: "test-client",
          clientSecret: "test-secret",
          emailRequired: true,
        },
        async onSuccess({ user }) {
          return new Response(JSON.stringify({ email: (user as any).email }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        },
      })

      const res = await handler(
        new Request("http://localhost/auth/github?code=code&state=s", {
          headers: { cookie: "peta-auth-state=s" },
        }),
      )

      const body = await res.json()
      expect(body.email).toBe("primary@example.com")
      expect(fetchCount).toBe(3) // token + user + emails
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
