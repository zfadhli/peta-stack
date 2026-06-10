import type { SerializeOptions } from "cookie"
import { serialize } from "cookie"
import type { Password } from "./crypto.ts"
import { sealData, unsealData } from "./crypto.ts"

const timestampSkewSec = 60
const defaults = {
  ttl: 14 * 24 * 3600,
  cookieOptions: { httpOnly: true as const, secure: true as const, sameSite: "lax" as const, path: "/" as const },
}
function computeMaxAge(ttl: number): number {
  if (ttl === 0) return 2_147_483_647
  return ttl - timestampSkewSec
}

export interface SessionOptions {
  password: Password
  cookieName: string
  ttl?: number
  cookieOptions?: Omit<SerializeOptions, "encode">
}

export interface IronSession {
  save(): Promise<void>
  destroy(): void
  updateConfig(options: SessionOptions): void
  [key: string]: unknown
}

export function resolveConfig(opts: SessionOptions) {
  const ttl = opts.ttl ?? defaults.ttl
  const cookieOptions = { ...defaults.cookieOptions, ...opts.cookieOptions }

  if (!("maxAge" in (opts.cookieOptions ?? {}))) {
    cookieOptions.maxAge = computeMaxAge(ttl)
  }

  const passwordsMap = typeof opts.password === "string" ? { 1: opts.password } : opts.password

  for (const pw of Object.values(passwordsMap)) {
    if (pw.length < 32) throw new Error("peta-auth: password must be at least 32 characters")
  }

  return { ttl, cookieName: opts.cookieName, password: opts.password, cookieOptions }
}

export type ResolvedConfig = ReturnType<typeof resolveConfig>

export interface SessionAdapter {
  getCookie(name: string): string | undefined
  setCookie(cookie: string): void
}

export async function createSessionFromAdapter<T extends Record<string, unknown> = Record<string, unknown>>(
  adapter: SessionAdapter,
  options: SessionOptions,
): Promise<T & IronSession> {
  let config = resolveConfig(options)

  const seal = adapter.getCookie(config.cookieName)
  const data: T = seal ? await unsealData<T>(seal, { password: config.password, ttl: config.ttl }) : ({} as T)

  const session = data as T & IronSession

  session.save = async () => {
    const s = await sealData(session, { password: config.password, ttl: config.ttl })
    const cookieValue = serialize(config.cookieName, s, config.cookieOptions)

    if (cookieValue.length > 4096) {
      throw new Error(`peta-auth: cookie too large (${cookieValue.length} bytes)`)
    }

    adapter.setCookie(cookieValue)
  }

  session.destroy = () => {
    for (const key of Object.keys(session)) {
      if (key !== "save" && key !== "destroy" && key !== "updateConfig") {
        delete (session as Record<string, unknown>)[key]
      }
    }

    adapter.setCookie(
      serialize(config.cookieName, "", {
        ...config.cookieOptions,
        maxAge: 0,
      }),
    )
  }

  session.updateConfig = (opts: SessionOptions) => {
    config = resolveConfig(opts)
  }

  return session
}
