import type { H3Event } from "h3"
import { appendHeader, createError, getCookie } from "h3"
import type { IronSession, SessionOptions } from "./session.ts"
import { createSessionFromAdapter } from "./session.ts"

export function useSession<T extends Record<string, unknown> = Record<string, unknown>>(
  event: H3Event,
  options: SessionOptions,
): Promise<T & IronSession> {
  const password = options.password ?? process.env.NUXT_SESSION_PASSWORD
  if (!password) throw new Error("peta-auth/nuxt: NUXT_SESSION_PASSWORD is required")

  return createSessionFromAdapter<T>(
    {
      getCookie: (name) => getCookie(event, name),
      setCookie: (value) => appendHeader(event, "Set-Cookie", value),
    },
    {
      password,
      cookieName: options?.cookieName ?? "nuxt-session",
      ttl: options?.ttl,
      cookieOptions: options?.cookieOptions,
    },
  )
}

export function requireSession(_event: H3Event, session: IronSession): void
export function requireSession<K extends string>(_event: H3Event, session: IronSession, key: K): void
export function requireSession(_event: H3Event, session: IronSession, key?: string): void {
  const hasData = key
    ? !!session[key]
    : Object.keys(session).some((k) => k !== "save" && k !== "destroy" && k !== "updateConfig")
  if (!hasData) throw createError({ statusCode: 401, statusMessage: "unauthorized" })
}
