import type { SerializeOptions } from "cookie"
import { serialize } from "cookie"
import { normalizePassword, type Password, sealData, unsealData } from "./crypto.js"
import { PetaAuthError } from "./errors.js"

const TIMESTAMP_SKEW_SECONDS = 60

const DEFAULTS = {
  timeToLive: 14 * 24 * 3600,
  cookieOptions: {
    httpOnly: true as const,
    sameSite: "lax" as const,
    path: "/" as const,
  },
}

function computeMaxAge(timeToLive: number): number {
  if (timeToLive === 0) return 2_147_483_647
  return timeToLive - TIMESTAMP_SKEW_SECONDS
}

/** Options for creating a cookie session. */
export interface SessionOptions {
  /** Password(s) used to encrypt the session cookie. */
  password: Password
  /** Name of the cookie. */
  cookieName: string
  /** Session lifetime in seconds (default 14 days). */
  timeToLive?: number
  /** Extra cookie serialization options. */
  cookieOptions?: Omit<SerializeOptions, "encode">
}

export interface SessionMethods {
  save(): Promise<void>
  destroy(): void
  updateConfig(options: SessionOptions): void
}

export type IronSession<T extends Record<string, unknown> = Record<string, unknown>> = T &
  SessionMethods

/** Check whether a session has any user data keys beyond the built-in methods. */
export function sessionHasData(session: Record<string, unknown>, key?: string): boolean {
  if (key) return !!session[key]
  return Object.keys(session).some((k) => k !== "save" && k !== "destroy" && k !== "updateConfig")
}

/** @internal */
export type ResolvedConfig = {
  timeToLive: number
  cookieName: string
  password: Password
  cookieOptions: SerializeOptions
}

/** @internal */
export function resolveConfig(options: SessionOptions): ResolvedConfig {
  const timeToLive = options.timeToLive ?? DEFAULTS.timeToLive
  const cookieOptions = {
    ...DEFAULTS.cookieOptions,
    secure: process.env.NODE_ENV !== "development",
    ...options.cookieOptions,
  }

  if (!("maxAge" in (options.cookieOptions ?? {}))) {
    cookieOptions.maxAge = computeMaxAge(timeToLive)
  }

  const passwordsMap = normalizePassword(options.password)

  for (const secret of Object.values(passwordsMap)) {
    if (secret.length < 32) {
      throw new PetaAuthError(
        "PASSWORD_TOO_SHORT",
        "peta-auth: password must be at least 32 characters",
      )
    }
  }

  return {
    timeToLive,
    cookieName: options.cookieName,
    password: options.password,
    cookieOptions,
  }
}

/** An adapter between the framework and the session cookie store. */
export interface SessionAdapter {
  /** Read a cookie by name from the incoming request. */
  getCookie(name: string): string | undefined
  /** Set a cookie on the outgoing response. */
  setCookie(cookie: string): void
}

/**
 * Create a session from a framework adapter.
 *
 * Reads the session cookie (if present), hydrates the data, and
 * returns a session object with {@link IronSession.save},
 * {@link IronSession.destroy}, and {@link IronSession.updateConfig}.
 *
 * @example
 * ```ts
 * const session = await createSessionFromAdapter(adapter, {
 *   password: "my-32-char-password...",
 *   cookieName: "my-session",
 * })
 * session.userId = 42
 * await session.save()
 * ```
 */
export async function createSessionFromAdapter<
  T extends Record<string, unknown> = Record<string, unknown>,
>(adapter: SessionAdapter, options: SessionOptions): Promise<IronSession<T>> {
  let config = resolveConfig(options)

  const seal = adapter.getCookie(config.cookieName)
  const data: T = seal
    ? await unsealData<T>(seal, { password: config.password, ttl: config.timeToLive })
    : ({} as T)

  const session = data as IronSession<T>

  session.save = async () => {
    const s = await sealData(session, { password: config.password, ttl: config.timeToLive })
    const cookieValue = serialize(config.cookieName, s, config.cookieOptions)

    if (cookieValue.length > 4096) {
      throw new PetaAuthError(
        "COOKIE_TOO_LARGE",
        `peta-auth: cookie too large (${cookieValue.length} bytes)`,
      )
    }

    adapter.setCookie(cookieValue)
  }

  session.destroy = () => {
    for (const key of Object.keys(session)) {
      if (key !== "save" && key !== "destroy" && key !== "updateConfig") {
        delete session[key]
      }
    }

    adapter.setCookie(
      serialize(config.cookieName, "", {
        ...config.cookieOptions,
        maxAge: 0,
      }),
    )
  }

  session.updateConfig = (updatedOptions: SessionOptions) => {
    config = resolveConfig(updatedOptions)
  }

  return session
}
