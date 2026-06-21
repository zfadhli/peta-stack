import type { H3Event } from "h3"
import { appendHeader, createError, getCookie } from "h3"
import { PetaAuthError } from "./errors.js"
import type { IronSession, SessionOptions } from "./session.js"
import { createSessionFromAdapter, sessionHasData } from "./session.js"

/**
 * Create a session from an h3 event (Nuxt / h3).
 *
 * @example
 * ```ts
 * // In a Nuxt server handler:
 * const session = await useSession(event, { password: process.env.NUXT_SESSION_PASSWORD })
 * session.userId = 42
 * await session.save()
 * ```
 */
export function useSession<T extends Record<string, unknown> = Record<string, unknown>>(
  event: H3Event,
  options: SessionOptions,
): Promise<IronSession<T>> {
  const password = options.password ?? process.env.NUXT_SESSION_PASSWORD
  if (!password) {
    throw new PetaAuthError("MISSING_PASSWORD", "peta-auth/nuxt: NUXT_SESSION_PASSWORD is required")
  }

  return createSessionFromAdapter<T>(
    {
      getCookie: (name) => getCookie(event, name),
      setCookie: (value) => appendHeader(event, "Set-Cookie", value),
    },
    {
      password,
      cookieName: options.cookieName ?? "nuxt-session",
      timeToLive: options.timeToLive,
      cookieOptions: options.cookieOptions,
    },
  )
}

/**
 * Guard that requires session data.
 *
 * Throws a 401 h3 error when the session is empty.
 *
 * @example
 * ```ts
 * const session = await useSession(event, options)
 * requireSession(event, session)
 * requireSession(event, session, "role") // require specific key
 * ```
 */
export function requireSession(event: H3Event, session: IronSession<Record<string, unknown>>): void
export function requireSession<K extends string>(
  event: H3Event,
  session: IronSession<Record<string, unknown>>,
  key: K,
): void
export function requireSession(
  _event: H3Event,
  session: IronSession<Record<string, unknown>>,
  key?: string,
): void {
  const hasData = sessionHasData(session, key)
  if (!hasData) throw createError({ statusCode: 401, statusMessage: "unauthorized" })
}
