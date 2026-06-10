import { describe, expect, it } from "bun:test"
import { hashPassword, verifyPassword } from "../src/index.ts"

describe("password hashing", () => {
  it("hashes and verifies a password", async () => {
    const hash = await hashPassword("hunter2")
    expect(await verifyPassword(hash, "hunter2")).toBe(true)
  })

  it("rejects wrong password", async () => {
    const hash = await hashPassword("correct")
    expect(await verifyPassword(hash, "wrong")).toBe(false)
  })

  it("uses custom cost", async () => {
    const hash = await hashPassword("test", { cost: 8 })
    expect(hash.startsWith("$2a$08$") || hash.startsWith("$2b$08$") || hash.startsWith("$2y$08$")).toBe(true)
    expect(await verifyPassword(hash, "test")).toBe(true)
  })
})
