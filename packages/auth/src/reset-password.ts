import type { Password } from "./crypto.js"
import { signJWT, verifyJWT } from "./jwt.js"
import { hashPassword } from "./password.js"

const DEFAULT_EXPIRES_IN = 3600

/** Options for password reset token generation. */
export interface PasswordResetOptions {
  /** Password(s) used to sign the reset token. */
  password: Password
  /** Token lifetime in seconds (default 1 hour). */
  expiresIn?: number
}

/**
 * Create a password-reset token for a user.
 *
 * @example
 * ```ts
 * const token = await createPasswordResetToken(userId, { password: "..." })
 * ```
 */
export async function createPasswordResetToken(
  userId: string,
  options: PasswordResetOptions,
): Promise<string> {
  return signJWT(
    { userId, purpose: "password-reset" },
    { password: options.password, expiresIn: options.expiresIn ?? DEFAULT_EXPIRES_IN },
  )
}

/**
 * Verify a password-reset token.
 *
 * Returns the user ID when the token is valid, or `null` if expired/invalid.
 */
export async function verifyPasswordResetToken(
  token: string,
  password: Password,
): Promise<{ userId: string } | null> {
  const payload = await verifyJWT<{ userId: string; purpose: string }>(token, { password })
  if (payload?.purpose !== "password-reset") return null
  return { userId: payload.userId }
}

/**
 * Verify a password-reset token and apply the new password.
 *
 * Returns `{ userId, hash }` on success, or `null` if the token is invalid.
 */
export async function resetPassword(
  token: string,
  newPassword: string,
  password: Password,
): Promise<{ userId: string; hash: string } | null> {
  const payload = await verifyPasswordResetToken(token, password)
  if (!payload) return null
  return { userId: payload.userId, hash: await hashPassword(newPassword) }
}
