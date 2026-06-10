import { compareSync, genSaltSync, hashSync } from "bcryptjs"

interface HashOptions {
  cost?: number
}

/**
 * Hash a password with bcrypt.
 *
 * @example
 * ```ts
 * const hash = await hashPassword("my-password")
 * ```
 */
export async function hashPassword(password: string, options: HashOptions = {}): Promise<string> {
  const cost = options.cost ?? 10
  return hashSync(password, genSaltSync(cost))
}

/**
 * Verify a password against a bcrypt hash.
 *
 * @example
 * ```ts
 * const ok = await verifyPassword(hash, "my-password")
 * ```
 */
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  return compareSync(password, hash)
}
