import { getRequestHeaders, getRequestURL } from "h3"
import { useSession } from "../../../../src/nuxt.js"
import { defineOAuthGoogleEventHandler } from "../../../../src/oauth/google.js"

export default defineEventHandler(async (event) => {
  const handler = defineOAuthGoogleEventHandler({
    config: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
    async onSuccess({ user, tokens }) {
      const session = await useSession(event, {
        password: process.env.NUXT_SESSION_PASSWORD!,
        cookieName: "nuxt-session",
      })
      session.user = { sub: user.sub, email: user.email, name: user.name }
      await session.save()
      return new Response(null, { status: 302, headers: { Location: "/" } })
    },
  })

  const url = getRequestURL(event)
  const headers = getRequestHeaders(event)
  return handler(new Request(url, { headers: headers as Record<string, string> }))
})
