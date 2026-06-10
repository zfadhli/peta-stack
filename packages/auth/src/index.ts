/**
 * peta-auth — Encrypted cookie sessions for Bun.
 *
 * @module
 */

export type { Password } from "./crypto.js"
export { sealData, unsealData } from "./crypto.js"

export type { CSRFOptions } from "./csrf.js"
export { generateCsrf, validateCsrf } from "./csrf.js"
export { PetaAuthError } from "./errors.js"
export type { JWTOptions } from "./jwt.js"
export { signJWT, verifyJWT } from "./jwt.js"
export { hashPassword, verifyPassword } from "./password.js"
export type { PasswordResetOptions } from "./reset-password.js"
export {
  createPasswordResetToken,
  resetPassword,
  verifyPasswordResetToken,
} from "./reset-password.js"
export type { IronSession, SessionAdapter, SessionOptions } from "./session.js"
export { createSessionFromAdapter } from "./session.js"
