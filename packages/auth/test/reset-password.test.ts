import { describe, expect, it } from "bun:test"
import { verifyJWT } from "../src/jwt.ts"
import { createPasswordResetToken, resetPassword, verifyPasswordResetToken } from "../src/reset-password.ts"

const secret = "a".repeat(32)

describe("createPasswordResetToken / verifyPasswordResetToken", () => {
  it("creates and verifies a token", async () => {
    const token = await createPasswordResetToken("user-42", { password: secret })
    expect(token.split(".")).toHaveLength(3)

    const payload = await verifyPasswordResetToken(token, secret)
    expect(payload?.userId).toBe("user-42")
  })

  it("rejects expired token", async () => {
    const token = await createPasswordResetToken("user-42", { password: secret, expiresIn: -1 })
    const result = await verifyPasswordResetToken(token, secret)
    expect(result).toBeNull()
  })

  it("rejects token with wrong purpose", async () => {
    const token = await verifyJWT({ userId: "user-42", purpose: "login" }, { password: secret })
    const result = await verifyPasswordResetToken(token, secret)
    expect(result).toBeNull()
  })
})

describe("resetPassword", () => {
  it("verifies token and hashes new password", async () => {
    const token = await createPasswordResetToken("user-42", { password: secret })
    const result = await resetPassword(token, "new-secret-password", secret)
    expect(result?.userId).toBe("user-42")
    expect(result?.hash).toBeTruthy()
    expect(result?.hash).not.toBe("new-secret-password")
  })

  it("returns null for invalid token", async () => {
    const result = await resetPassword("invalid.token.here", "new-pw", secret)
    expect(result).toBeNull()
  })
})
