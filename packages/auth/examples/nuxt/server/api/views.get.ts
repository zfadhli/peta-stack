import { defineEventHandler } from "h3"
import { useSession } from "../../../../src/nuxt.js"

export default defineEventHandler(async (event) => {
  const session = await useSession(event, {
    password: process.env.NUXT_SESSION_PASSWORD!,
    cookieName: "nuxt-session",
  })

  session.views = (session.views ?? 0) + 1
  await session.save()

  return { views: session.views }
})
