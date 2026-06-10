import { describe, expect, it } from "bun:test"
import { getResponseHeader, mockEvent } from "h3"
import { requireSession, useSession } from "../src/nuxt.js"

const password = { 1: "a".repeat(32) }

describe("Nuxt adapter", () => {
  it("starts with empty session", async () => {
    const event = mockEvent("http://localhost/test")
    const session = await useSession(event, { password, cookieName: "ns" })
    expect(session.user).toBeUndefined()
  })

  it("persists data after save", async () => {
    const event = mockEvent("http://localhost/test")
    const session = await useSession(event, { password, cookieName: "ns" })
    session.user = { name: "Jason" }
    await session.save()
    const cookie = getResponseHeader(event, "set-cookie") || ""
    expect(cookie.startsWith("ns=")).toBe(true)
  })

  it("reads persisted data from cookie", async () => {
    // First create a session and persist it
    const event1 = mockEvent("http://localhost/test")
    const session1 = await useSession(event1, { password, cookieName: "ns" })
    session1.user = { name: "Jason" }
    session1.views = 42
    await session1.save()

    const cookie = getResponseHeader(event1, "set-cookie") || ""

    // Now read it back with a new event carrying the same cookie
    const event2 = mockEvent("http://localhost/test", {
      headers: { cookie },
    })
    const session2 = await useSession(event2, { password, cookieName: "ns" })
    expect(session2.user).toEqual({ name: "Jason" })
    expect(session2.views).toBe(42)
  })

  it("clears data on destroy", async () => {
    const event1 = mockEvent("http://localhost/test")
    const session1 = await useSession(event1, { password, cookieName: "ns" })
    session1.user = { name: "Jason" }
    await session1.save()

    const cookie = getResponseHeader(event1, "set-cookie") || ""

    const event2 = mockEvent("http://localhost/test", { headers: { cookie } })
    const session2 = await useSession(event2, { password, cookieName: "ns" })
    session2.destroy()

    const clearedCookie = getResponseHeader(event2, "set-cookie") || ""
    expect(clearedCookie.includes("Max-Age=0")).toBe(true)

    // Verify the session is gone
    const event3 = mockEvent("http://localhost/test", {
      headers: { cookie: clearedCookie.split(";")[0] },
    })
    const session3 = await useSession(event3, { password, cookieName: "ns" })
    expect(session3.user).toBeUndefined()
  })
})

describe("Nuxt requireSession", () => {
  it("throws on empty session", async () => {
    const event = mockEvent("http://localhost/test")
    const session = await useSession(event, { password, cookieName: "ns" })
    expect(() => requireSession(event, session)).toThrow("unauthorized")
  })

  it("passes with populated session", async () => {
    const event = mockEvent("http://localhost/test")
    const session = await useSession(event, { password, cookieName: "ns" })
    session.user = { name: "Alice" }
    expect(() => requireSession(event, session)).not.toThrow()
  })

  it("throws when key is missing", async () => {
    const event = mockEvent("http://localhost/test")
    const session = await useSession(event, { password, cookieName: "ns" })
    expect(() => requireSession(event, session, "userId")).toThrow("unauthorized")
  })

  it("throws when key is falsy", async () => {
    const event = mockEvent("http://localhost/test")
    const session = await useSession(event, { password, cookieName: "ns" })
    session.userId = 0
    expect(() => requireSession(event, session, "userId")).toThrow("unauthorized")
  })

  it("passes when key is truthy", async () => {
    const event = mockEvent("http://localhost/test")
    const session = await useSession(event, { password, cookieName: "ns" })
    session.userId = 42
    expect(() => requireSession(event, session, "userId")).not.toThrow()
  })
})
