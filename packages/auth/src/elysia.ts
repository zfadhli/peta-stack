import { parse } from "cookie"
import { Elysia } from "elysia"
import type { IronSession, SessionOptions } from "./session.ts"
import { createSessionFromAdapter } from "./session.ts"

export function session<T extends Record<string, unknown> = Record<string, unknown>>(options: SessionOptions) {
  return new Elysia({ name: "peta-auth" }).derive({ as: "scoped" }, async ({ headers: reqHeaders, set }) => {
    const cookieStr =
      reqHeaders instanceof Headers
        ? (reqHeaders.get("cookie") ?? "")
        : ((reqHeaders as Record<string, string>).cookie ?? "")

    const session = await createSessionFromAdapter<T>(
      {
        getCookie: (name) => parse(cookieStr)[name],
        setCookie: (v) => {
          set.headers["Set-Cookie"] = v
        },
      },
      options,
    )

    return { session }
  })
}

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
