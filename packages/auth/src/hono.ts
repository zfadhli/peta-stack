import { parse } from "cookie"
import type { MiddlewareHandler } from "hono"
import { createMiddleware } from "hono/factory"
import { createSessionFromAdapter, type IronSession, type SessionOptions } from "./session.ts"

export function session<T extends Record<string, unknown> = Record<string, unknown>>(
  options: SessionOptions,
): MiddlewareHandler<{ Variables: { session: T & IronSession } }> {
  return createMiddleware(async (c, next) => {
    c.set(
      "session",
      await createSessionFromAdapter<T>(
        {
          getCookie: (name) => parse(c.req.header("cookie") ?? "")[name],
          setCookie: (v) => c.res.headers.append("Set-Cookie", v),
        },
        options,
      ),
    )
    await next()
  })
}

export function requireSession(): MiddlewareHandler
export function requireSession<K extends string>(key: K): MiddlewareHandler
export function requireSession(key?: string): MiddlewareHandler {
  return createMiddleware(async (c, next) => {
    const s = c.var.session
    const hasData = key ? !!s[key] : Object.keys(s).some((k) => k !== "save" && k !== "destroy" && k !== "updateConfig")
    if (!hasData) return c.json({ error: "unauthorized" }, 401)
    await next()
  })
}
