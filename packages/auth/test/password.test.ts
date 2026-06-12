import { describe, expect, it } from "bun:test"
import { hashPassword, verifyPassword } from "../src/index.js"

describe("password hashing", () => {
  it("hashes and verifies a password with argon2id", async () => {
    const hash = await hashPassword("hunter2")
    expect(hash.startsWith("$argon2id$")).toBe(true)
    expect(await verifyPassword(hash, "hunter2")).toBe(true)
  })

  it("rejects wrong password", async () => {
    const hash = await hashPassword("correct")
    expect(await verifyPassword(hash, "wrong")).toBe(false)
  })

  it("respects custom argon2id parameters", async () => {
    const hash = await hashPassword("custom", { memoryCost: 8192, timeCost: 1, parallelism: 1 })
    expect(hash.startsWith("$argon2id$")).toBe(true)
    expect(await verifyPassword(hash, "custom")).toBe(true)
  })
})
