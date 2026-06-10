import type { Password } from "./crypto.ts"
import { signJWT, verifyJWT } from "./jwt.ts"
import { hashPassword } from "./password.ts"

const DEFAULT_EXPIRY = 3600

export interface PasswordResetOptions {
  password: Password
  exp?: number
}

export async function createPasswordResetToken(userId: string, options: PasswordResetOptions): Promise<string> {
  return signJWT(
    { userId, purpose: "password-reset" },
    { password: options.password, exp: options.exp ?? DEFAULT_EXPIRY },
  )
}

export async function verifyPasswordResetToken(token: string, password: Password): Promise<{ userId: string } | null> {
  const payload = await verifyJWT<{ userId: string; purpose: string }>(token, { password })
  if (payload?.purpose !== "password-reset") return null
  return { userId: payload.userId }
}

export async function resetPassword(
  token: string,
  newPassword: string,
  password: Password,
): Promise<{ userId: string; hash: string } | null> {
  const payload = await verifyPasswordResetToken(token, password)
  if (!payload) return null
  return { userId: payload.userId, hash: await hashPassword(newPassword) }
}
