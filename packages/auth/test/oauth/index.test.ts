import { afterEach, describe, expect, it } from "bun:test"
import {
  getOAuthRedirectURL,
  handleInvalidState,
  handleMissingConfiguration,
  handlePKCE,
  handleState,
  redirect,
  requestAccessToken,
} from "../../src/oauth/index.js"

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

describe("handleMissingConfiguration", () => {
  it("returns 500 with JSON error", () => {
    const res = handleMissingConfiguration("github", ["clientId", "clientSecret"])
    expect(res.status).toBe(500)
    expect(res.headers.get("content-type")).toContain("application/json")
  })
})

describe("handleInvalidState", () => {
  it("returns 500 with JSON error", () => {
    const res = handleInvalidState("github")
    expect(res.status).toBe(500)
    expect(res.headers.get("content-type")).toContain("application/json")
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
    expect(requestAccessToken("https://example.com/token", {})).rejects.toThrow("OAuth token request failed: 500")
  })
})
