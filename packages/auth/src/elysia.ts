import { parse } from "cookie"
import { Elysia } from "elysia"
import type { IronSession, SessionOptions } from "./session.js"
import { createSessionFromAdapter } from "./session.js"

/**
 * Elysia plugin that provides a session via the `session` store property.
 *
 * @example
 * ```ts
 * app.use(session({ password: "...", cookieName: "my-session" }))
 * app.get("/me", ({ session }) => session)
 * ```
 */
export function session<T extends Record<string, unknown> = Record<string, unknown>>(options: SessionOptions) {
  return new Elysia({ name: "peta-auth" }).derive({ as: "scoped" }, async ({ headers, set }) => {
    const cookieString =
      headers instanceof Headers ? (headers.get("cookie") ?? "") : ((headers as Record<string, string>).cookie ?? "")

    const session = await createSessionFromAdapter<T>(
      {
        getCookie: (name) => parse(cookieString)[name],
        setCookie: (value) => {
          set.headers["Set-Cookie"] = value
        },
      },
      options,
    )

    return { session }
  })
}

/**
 * Elysia guard (onBeforeHandle) that requires session data.
 *
 * Returns 401 when the session is empty.
 *
 * @example
 * ```ts
 * app.guard({ beforeHandle: requireSession() }, (app) =>
 *   app.get("/admin", () => "ok")
 * )
 * ```
 */
export function requireSession(): (app: Elysia) => Elysia
export function requireSession<K extends string>(key: K): (app: Elysia) => Elysia
export function requireSession(key?: string) {
  return (app: Elysia): Elysia =>
    app.onBeforeHandle((context) => {
      const session = (context as unknown as { session: IronSession }).session
      const hasData = key
        ? !!session[key]
        : Object.keys(session).some((k) => k !== "save" && k !== "destroy" && k !== "updateConfig")
      if (!hasData) {
        return new Response(JSON.stringify({ error: "unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        })
      }
    }) as unknown as Elysia
}
