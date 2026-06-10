import { useSession } from "../../../../src/nuxt.js"

export default defineEventHandler(async (event) => {
  const session = await useSession(event, {
    password: process.env.NUXT_SESSION_PASSWORD!,
    cookieName: "nuxt-session",
  })
  const body = await readBody(event)

  Object.assign(session, {
    user: body,
    loggedInAt: Date.now(),
  })
  await session.save()

  return { ok: true }
})
