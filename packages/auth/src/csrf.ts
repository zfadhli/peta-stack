import type { IronSession } from "./session.ts"

/** Options for CSRF token generation / validation. */
export interface CSRFOptions {
  /** Key used to store the token in the session (default `"_csrfToken"`). */
  key?: string
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
export async function generateCsrf(session: IronSession, options?: CSRFOptions): Promise<string> {
  const key = options?.key ?? "_csrfToken"
  const token = crypto.randomUUID()
  session[key] = token
  return token
}

/**
 * Validate a CSRF token against the value stored in the session.
 *
 * @example
 * ```ts
 * if (!validateCsrf(session, submittedToken)) {
 *   // reject request
 * }
 * ```
 */
export function validateCsrf(session: IronSession, token: string, options?: CSRFOptions): boolean {
  const key = options?.key ?? "_csrfToken"
  const stored = session[key]
  return typeof stored === "string" && stored === token
}
