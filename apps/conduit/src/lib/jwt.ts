import { signJWT as petaSignJWT, verifyJWT as petaVerifyJWT } from "peta-auth"

export interface JwtPayload {
  userId: number
  username: string
}

const JWT_PASSWORD = process.env.JWT_SECRET ?? "conduit-jwt-secret-change-in-production-32chars!!"
const JWT_EXPIRES_IN = 14 * 24 * 3600 // 14 days

/** Sign a JWT token for a user */
export async function signToken(userId: number, username: string): Promise<string> {
  return petaSignJWT({ userId, username } as unknown as Record<string, unknown>, {
    password: JWT_PASSWORD,
    expiresIn: JWT_EXPIRES_IN,
  })
}

/** Verify and decode a JWT token, returning the payload or null */
export async function verifyToken(token: string): Promise<JwtPayload | null> {
  const payload = await petaVerifyJWT<Record<string, unknown>>(token, { password: JWT_PASSWORD })
  if (!payload) return null
  const userId = Number(payload.userId)
  const username = String(payload.username)
  if (!Number.isFinite(userId) || !username) return null
  return { userId, username }
}
