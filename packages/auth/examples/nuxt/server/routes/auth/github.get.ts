import { getRequestHeaders, getRequestURL } from "h3"
import { useSession } from "peta-auth/nuxt"
import { defineOAuthGitHubEventHandler } from "peta-auth/oauth/github"

export default defineEventHandler(async (event) => {
  const handler = defineOAuthGitHubEventHandler({
    config: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    },
    async onSuccess({ user, tokens }) {
      const session = await useSession(event, {
        password: process.env.NUXT_SESSION_PASSWORD!,
        cookieName: "nuxt-session",
      })
      session.user = { id: user.id, login: user.login }
      await session.save()
      return new Response(null, { status: 302, headers: { Location: "/" } })
    },
  })

  const url = getRequestURL(event)
  const headers = getRequestHeaders(event)
  return handler(new Request(url, { headers: headers as Record<string, string> }))
})
