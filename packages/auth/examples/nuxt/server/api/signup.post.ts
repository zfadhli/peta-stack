import { hashPassword } from "peta-auth"
import { useSession } from "../../../../src/nuxt.js"

// In-memory store — use a database in production
const users = new Map<string, { hash: string; name: string }>()

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { email, password, name } = body

  if (users.has(email)) {
    throw createError({ statusCode: 409, statusMessage: "Email already registered" })
  }

  users.set(email, { hash: await hashPassword(password), name })

  const session = await useSession(event, {
    password: process.env.NUXT_SESSION_PASSWORD!,
    cookieName: "nuxt-session",
  })
  Object.assign(session, { user: { email, name }, loggedInAt: Date.now() })
  await session.save()

  return { ok: true }
})
