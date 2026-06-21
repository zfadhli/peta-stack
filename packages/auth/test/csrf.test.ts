import { describe, expect, it } from "bun:test"
import { generateCsrf, validateCsrf } from "../src/csrf.js"
import { createSessionFromAdapter, type IronSession } from "../src/session.js"

const password = { 1: "a".repeat(32) }

async function makeSession(): Promise<IronSession<Record<string, unknown>>> {
  return createSessionFromAdapter(
    {
      getCookie: () => undefined,
      setCookie: () => {},
    },
    { password, cookieName: "test" },
  )
}

describe("generateCsrf / validateCsrf", () => {
  it("generates a token and stores it in session", async () => {
    const session = await makeSession()
    const token = await generateCsrf(session)
    expect(token).toBeTruthy()
    expect(typeof token).toBe("string")
    expect((session as Record<string, unknown>)._csrfToken).toBe(token)
  })

  it("validates a correct token", async () => {
    const session = await makeSession()
    const token = await generateCsrf(session)
    expect(validateCsrf(session, token)).toBe(true)
  })

  it("rejects an incorrect token", async () => {
    const session = await makeSession()
    await generateCsrf(session)
    expect(validateCsrf(session, "wrong-token")).toBe(false)
  })

  it("supports custom key", async () => {
    const session = await makeSession()
    const token = await generateCsrf(session, { key: "myToken" })
    expect((session as Record<string, unknown>).myToken).toBe(token)
    expect(validateCsrf(session, token, { key: "myToken" })).toBe(true)
    expect(validateCsrf(session, token)).toBe(false)
  })
})
