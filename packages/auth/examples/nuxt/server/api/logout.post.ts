import { useSession } from "../../../../src/nuxt.js"

export default defineEventHandler(async (event) => {
  const session = await useSession(event, {
    password: process.env.NUXT_SESSION_PASSWORD!,
    cookieName: "nuxt-session",
  })
  session.destroy()
  return { ok: true }
})
