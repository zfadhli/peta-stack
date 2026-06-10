import { describe, expect, it } from "bun:test"
import { signJWT, verifyJWT } from "../src/jwt.ts"

const password = { 1: "a".repeat(32) }

describe("signJWT / verifyJWT", () => {
  it("signs and verifies a token", async () => {
    const token = await signJWT({ userId: 123 }, { password })
    expect(token.split(".")).toHaveLength(3)

    const payload = await verifyJWT<{ userId: number }>(token, { password })
    expect(payload?.userId).toBe(123)
    expect(payload?.iat).toBeGreaterThan(0)
  })

  it("returns null for invalid token", async () => {
    const result = await verifyJWT("invalid.token.here", { password })
    expect(result).toBeNull()
  })

  it("returns null for tampered token", async () => {
    const token = await signJWT({ msg: "hello" }, { password })
    const parts = token.split(".")
    parts[1] = "eyJtZXNzYWdlIjoiY2hhbmdlZCJ9"
    const result = await verifyJWT(parts.join("."), { password })
    expect(result).toBeNull()
  })

  it("accepts password rotation", async () => {
    const oldPw = { 1: "x".repeat(32), 2: "y".repeat(32) }
    const token = await signJWT({ x: 1 }, { password: oldPw })
    const newPw = { 2: "y".repeat(32), 3: "z".repeat(32) }
    const result = await verifyJWT(token, { password: newPw })
    expect(result?.x).toBe(1)
  })

  it("rejects expired token", async () => {
    const token = await signJWT({ data: "test" }, { password, expiresIn: -3600 })
    const result = await verifyJWT(token, { password })
    expect(result).toBeNull()
  })
})
