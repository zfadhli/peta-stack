import { afterEach, describe, expect, it } from "bun:test"
import {
  defineOAuthHandler,
  getOAuthRedirectURL,
  handlePKCE,
  handleState,
  redirect,
  requestAccessToken,
} from "../../src/oauth/utils.js"

describe("getOAuthRedirectURL", () => {
  it("extracts URL from request", () => {
    const req = new Request("http://example.com/auth/github?code=xyz")
    expect(getOAuthRedirectURL(req)).toBe("http://example.com/auth/github")
  })
})

describe("handleState", () => {
  it("generates state for initial request", () => {
    const req = new Request("http://example.com/auth")
    const result = handleState(req)
    expect(result.state).toBeDefined()
    expect(result.expectedState).toBeUndefined()
    expect(result.setCookie).toBeDefined()
  })

  it("validates state on callback", () => {
    const req = new Request("http://example.com/auth?state=abc123", {
      headers: { cookie: "peta-auth-state=abc123" },
    })
    const result = handleState(req)
    expect(result.state).toBe("abc123")
    expect(result.expectedState).toBe("abc123")
  })

  it("handles state mismatch", () => {
    const req = new Request("http://example.com/auth?state=evil", {
      headers: { cookie: "peta-auth-state=good" },
    })
    const result = handleState(req)
    expect(result.state).toBe("evil")
    expect(result.expectedState).toBe("good")
  })
})

describe("redirect", () => {
  it("returns 302 with Location", () => {
    const res = redirect("/home")
    expect(res.status).toBe(302)
    expect(res.headers.get("Location")).toBe("/home")
  })

  it("appends Set-Cookie when provided", () => {
    const res = redirect("/home", "token=abc")
    const cookies = res.headers.getSetCookie()
    expect(cookies).toContain("token=abc")
  })
})

describe("handlePKCE", () => {
  it("generates challenge and sets cookie on initial request", async () => {
    const req = new Request("http://localhost/auth/google")
    const result = await handlePKCE(req)

    expect(result.codeChallenge).toBeDefined()
    expect(typeof result.codeChallenge).toBe("string")
    expect(result.codeChallenge).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(result.codeChallengeMethod).toBe("S256")
    expect(result.setCookie).toContain("peta-auth-pkce=")
  })

  it("returns verifier from cookie on callback", async () => {
    const req = new Request("http://localhost/auth/google?code=xyz", {
      headers: { cookie: "peta-auth-pkce=my-verifier-token" },
    })
    const result = await handlePKCE(req)
    expect(result.codeVerifier).toBe("my-verifier-token")
  })

  it("returns undefined verifier when cookie is missing on callback", async () => {
    const req = new Request("http://localhost/auth/google?code=xyz")
    const result = await handlePKCE(req)
    expect(result.codeVerifier).toBeUndefined()
  })
})

describe("requestAccessToken", () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it("returns parsed JSON on success", async () => {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ access_token: "tok123", token_type: "bearer" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    const result = await requestAccessToken("https://example.com/token", {
      body: { grant_type: "authorization_code", code: "abc" },
    })
    expect(result).toEqual({ access_token: "tok123", token_type: "bearer" })
  })

  it("passes through 401 error response", async () => {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: "invalid_grant" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      })
    const result = await requestAccessToken("https://example.com/token", {})
    expect(result).toEqual({ error: "invalid_grant" })
  })

  it("throws on non-401 error", async () => {
    globalThis.fetch = async () => new Response("Server Error", { status: 500 })
    expect(requestAccessToken("https://example.com/token", {})).rejects.toThrow(
      "OAuth token request failed: 500",
    )
  })
})

describe("defineOAuthHandler full callback", () => {
  const mockProvider = {
    name: "mock",
    resolveConfig: (config: any) => ({
      clientId: config.clientId ?? "mock-id",
      clientSecret: config.clientSecret ?? "mock-secret",
      authorizationURL: "https://mock.com/auth",
      tokenURL: "https://mock.com/token",
      scope: ["openid"],
      authorizationParams: {},
      apiURL: "https://mock.com/api",
    }),
    buildAuthUrl: (config: any, _redirectURL: string, state: any) => ({
      url: `${config.authorizationURL}?client_id=${config.clientId}&state=${state.state}`,
      cookies: state.setCookie,
    }),
    requestTokenBody: (config: any, redirectURL: string, code: string) => ({
      grant_type: "authorization_code",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: redirectURL,
      code,
    }),
    fetchUser: async (_config: any, _tokens: any) => ({ id: "user-1", name: "Mock User" }),
  }

  it("executes full callback: state validation → token exchange → user fetch → onSuccess", async () => {
    const originalFetch = globalThis.fetch
    const handler = defineOAuthHandler(mockProvider, {
      config: { clientId: "cid", clientSecret: "cs" },
      onSuccess: async ({ user, tokens }) =>
        new Response(JSON.stringify({ userId: user.id, token: (tokens as any).access_token }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    })

    globalThis.fetch = async () =>
      new Response(JSON.stringify({ access_token: "final-token" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })

    try {
      const res = await handler(
        new Request("http://localhost/auth/mock?code=abc&state=xyz", {
          headers: { cookie: "peta-auth-state=xyz" },
        }),
      )
      const body = await res.json()
      expect(body.userId).toBe("user-1")
      expect(body.token).toBe("final-token")
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
