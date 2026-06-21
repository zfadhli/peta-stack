import type { IronSession } from "./session.js"

/** Options for CSRF token generation / validation. */
export interface CSRFOptions {
  /** Key used to store the token in the session (default `"_csrfToken"`). */
  key?: string
}

/**
 * Constant-time string comparison to prevent timing side-channel attacks.
 * Always iterates over the full length of the input, regardless of where
 * the first difference occurs.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}

/**
 * Generate a CSRF token and store it in the session.
 *
 * @example
 * ```ts
 * const token = await generateCsrf(session)
 * // send `token` to the client via form field or header
 * ```
 */
export async function generateCsrf(
  session: IronSession<Record<string, unknown>>,
  options?: CSRFOptions,
): Promise<string> {
  const key = options?.key ?? "_csrfToken"
  const token = crypto.randomUUID()
  session[key] = token
  return token
}

/**
 * Validate a CSRF token against the value stored in the session.
 *
 * Uses constant-time comparison to prevent timing side-channel attacks.
 *
 * @example
 * ```ts
 * if (!validateCsrf(session, submittedToken)) {
 *   // reject request
 * }
 * ```
 */
export function validateCsrf(
  session: IronSession<Record<string, unknown>>,
  token: string,
  options?: CSRFOptions,
): boolean {
  const key = options?.key ?? "_csrfToken"
  const stored = session[key]
  return typeof stored === "string" && constantTimeEqual(stored, token)
}
