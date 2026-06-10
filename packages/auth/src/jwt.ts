import * as jose from "jose"
import type { Password } from "./crypto.ts"

function toPasswordMap(password: Password): Record<string, string> {
  return typeof password === "string" ? { 1: password } : password
}

function toKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret)
}

export interface JWTOptions {
  password: Password
  exp?: number
}

export async function signJWT(payload: Record<string, unknown>, options: JWTOptions): Promise<string> {
  const map = toPasswordMap(options.password)
  const id = Math.max(...Object.keys(map).map(Number)).toString()
  const secret = map[id]

  if (!secret || secret.length < 32) {
    throw new Error("peta-auth/jwt: password must be at least 32 characters")
  }

  const jwt = new jose.SignJWT(payload).setProtectedHeader({ alg: "HS256" }).setIssuedAt()
  if (options.exp !== undefined) {
    jwt.setExpirationTime(Math.floor(Date.now() / 1000) + options.exp)
  }

  return jwt.sign(toKey(secret))
}

export async function verifyJWT<T = Record<string, unknown>>(token: string, options: JWTOptions): Promise<T | null> {
  for (const secret of Object.values(toPasswordMap(options.password))) {
    if (!secret) continue
    try {
      const { payload } = await jose.jwtVerify(token, toKey(secret))
      return payload as T
    } catch {
      /* try next password */
    }
  }
  return null
}
