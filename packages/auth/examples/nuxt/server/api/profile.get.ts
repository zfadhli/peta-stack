import { useSession } from "peta-auth/nuxt"

export default defineEventHandler(async (event) => {
  const session = await useSession(event, {
    password: process.env.NUXT_SESSION_PASSWORD!,
    cookieName: "nuxt-session",
  })

  if (!session.user) {
    throw createError({ statusCode: 401, statusMessage: "Not logged in" })
  }

  return session.user
})
