import { describe, expect, it } from "bun:test"
import { createSessionFromAdapter } from "../src/index.js"

const password = { 1: "a".repeat(32) }
const cookieName = "test-session"

function makeAdapter() {
  const store = new Map<string, string>()
  return {
    getCookie: (name: string) => store.get(name),
    setCookie: (value: string) => {
      const eq = value.indexOf("=")
      const semi = value.indexOf(";", eq)
      const name = value.slice(0, eq)
      const val = semi === -1 ? value.slice(eq + 1) : value.slice(eq + 1, semi)
      store.set(name, val)
    },
    store,
  }
}

describe("createSessionFromAdapter", () => {
  it("starts with empty session", async () => {
    const a = makeAdapter()
    const session = await createSessionFromAdapter(a, { password, cookieName })
    expect(session.user).toBeUndefined()
  })

  it("persists data after save", async () => {
    const a = makeAdapter()
    const session = await createSessionFromAdapter(a, { password, cookieName })
    session.user = { name: "Jason" }
    await session.save()
    expect(a.store.has(cookieName)).toBe(true)
  })

  it("reads persisted data", async () => {
    const a = makeAdapter()
    let session = await createSessionFromAdapter(a, { password, cookieName })
    session.user = { name: "Jason" }
    session.views = 42
    await session.save()

    session = await createSessionFromAdapter(a, { password, cookieName })
    expect(session.user).toEqual({ name: "Jason" })
    expect(session.views).toBe(42)
  })

  it("clears data on destroy", async () => {
    const a = makeAdapter()
    let session = await createSessionFromAdapter(a, { password, cookieName })
    session.user = { name: "Jason" }
    await session.save()

    session = await createSessionFromAdapter(a, { password, cookieName })
    session.destroy()

    session = await createSessionFromAdapter(a, { password, cookieName })
    expect(session.user).toBeUndefined()
  })

  it("updateConfig changes cookie name", async () => {
    const a = makeAdapter()
    const session = await createSessionFromAdapter(a, { password, cookieName })
    session.updateConfig({ password, cookieName: "other-session" })
    session.msg = "hi"
    await session.save()
    expect(a.store.has("other-session")).toBe(true)
  })

  it("throws on oversized cookie", async () => {
    const a = makeAdapter()
    const session = await createSessionFromAdapter(a, { password, cookieName })
    ;(session as any).data = "x".repeat(5000)
    expect(session.save()).rejects.toThrow("cookie too large")
  })
})
