import { normalizePassword, type Password } from "./crypto.js"
import { PetaAuthError } from "./errors.js"

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

  const header = { alg: "HS256", typ: "JWT" }
  const now = Math.floor(Date.now() / 1000)
  const ttl = options.expiresIn ?? 86400
  const claims = { ...payload, iat: now, exp: now + ttl }

  const headerB64 = Buffer.from(JSON.stringify(header)).toString("base64url")
  const payloadB64 = Buffer.from(JSON.stringify(claims)).toString("base64url")
  const toSign = `${headerB64}.${payloadB64}`

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(toSign))
  const sigB64 = Buffer.from(sig).toString("base64url")

  return `${toSign}.${sigB64}`
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
  let headerB64: string, payloadB64: string, sigB64: string
  try {
    const parts = token.split(".")
    if (parts.length !== 3) return null
    ;[headerB64, payloadB64, sigB64] = parts as [string, string, string]

    const header = JSON.parse(Buffer.from(headerB64, "base64url").toString())
    if (header.alg !== "HS256") return null
  } catch {
    return null
  }

  const passwords = normalizePassword(options.password)
  const toSign = `${headerB64}.${payloadB64}`
  const sig = Buffer.from(sigB64, "base64url")
  const data = new TextEncoder().encode(toSign)

  for (const secret of Object.values(passwords)) {
    if (!secret) continue
    try {
      const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["verify"],
      )
      const valid = await crypto.subtle.verify("HMAC", key, sig, data)
      if (!valid) continue

      const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString()) as T
      const exp = (payload as Record<string, unknown>)?.exp as number | undefined
      if (exp !== undefined && exp < Math.floor(Date.now() / 1000)) continue

      return payload
    } catch {}
  }

  return null
}
