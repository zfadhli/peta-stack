/**
 * peta-auth — Encrypted cookie sessions for Bun.
 *
 * @module
 */

export type { Password } from "./crypto.ts"
export { sealData, unsealData } from "./crypto.ts"

export type { CSRFOptions } from "./csrf.ts"
export { generateCsrf, validateCsrf } from "./csrf.ts"
export { PetaAuthError } from "./errors.ts"
export type { JWTOptions } from "./jwt.ts"
export { signJWT, verifyJWT } from "./jwt.ts"
export { hashPassword, verifyPassword } from "./password.ts"
export type { PasswordResetOptions } from "./reset-password.ts"
export {
  createPasswordResetToken,
  resetPassword,
  verifyPasswordResetToken,
} from "./reset-password.ts"
export type { IronSession, SessionAdapter, SessionOptions } from "./session.ts"
export { createSessionFromAdapter } from "./session.ts"
