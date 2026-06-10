import { useSession } from "peta-auth/nuxt"

export default defineEventHandler(async (event) => {
  const session = await useSession(event, {
    password: process.env.NUXT_SESSION_PASSWORD!,
    cookieName: "nuxt-session",
  })
  session.destroy()
  return { ok: true }
})
