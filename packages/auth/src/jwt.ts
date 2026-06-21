import * as jose from "jose"
import { normalizePassword, type Password } from "./crypto.js"
import { PetaAuthError } from "./errors.js"

function toKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret)
}

/** Options for JWT sign / verify operations. */
export interface JWTOptions {
  /** Password used to sign the JWT. */
  password: Password
  /** Time-to-live in seconds from now. */
  expiresIn?: number
}

/**
 * Sign a JWT payload.
 *
 * @example
 * ```ts
 * const token = await signJWT({ userId: "abc" }, { password: "my-32-char-secret...", expiresIn: 3600 })
 * ```
 */
export async function signJWT(
  payload: Record<string, unknown>,
  options: JWTOptions,
): Promise<string> {
  const map = normalizePassword(options.password)
  const id = Math.max(...Object.keys(map).map(Number)).toString()
  const secret = map[id]

  if (!secret || secret.length < 32) {
    throw new PetaAuthError(
      "JWT_PASSWORD_TOO_SHORT",
      "peta-auth/jwt: password must be at least 32 characters",
    )
  }

  const jwt = new jose.SignJWT(payload).setProtectedHeader({ alg: "HS256" }).setIssuedAt()
  const ttl = options.expiresIn ?? 86400 // 24 hours default
  jwt.setExpirationTime(Math.floor(Date.now() / 1000) + ttl)

  return jwt.sign(toKey(secret))
}

/**
 * Verify and decode a JWT.
 *
 * Returns `null` when the token is invalid or expired.
 *
 * @example
 * ```ts
 * const payload = await verifyJWT<{ userId: string }>(token, { password: "my-32-char-secret..." })
 * ```
 */
export async function verifyJWT<T = Record<string, unknown>>(
  token: string,
  options: JWTOptions,
): Promise<T | null> {
  let result: T | null = null

  const passwords = normalizePassword(options.password)
  for (const secret of Object.values(passwords)) {
    if (!secret) continue
    try {
      const { payload } = await jose.jwtVerify(token, toKey(secret))
      if (!result) result = payload as T
    } catch {
      // try next password
    }
  }

  return result
}
