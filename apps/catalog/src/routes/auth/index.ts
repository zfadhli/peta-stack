import { type } from "arktype"
import { Hono } from "hono"
import { route } from "peta-docs/hono"
import { User } from "../../db/schema.js"

const app = new Hono()

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------
const SignupBody = type({
  email: "string",
  password: "string>=8",
  name: "string>0",
})

const LoginBody = type({
  email: "string",
  password: "string>=1",
})

const UserResponse = type({
  id: "number",
  email: "string",
  name: "string",
  role: "'admin'|'user'",
})

// ---------------------------------------------------------------------------
// POST /auth/signup
// ---------------------------------------------------------------------------
app.post(
  "/signup",
  route()
    .summary("Create a new user account")
    .tags("auth")
    .requestBody(SignupBody)
    .response(201, UserResponse)
    .response(409, "Email already exists")
    .handle(async (c) => {
      const body = c.req.valid("json")

      // Check if email already exists
      const existing = await User.query().where("email", "=", body.email).first()
      if (existing) {
        return c.json({ error: "Email already exists" }, 409)
      }

      const passwordHash = await Bun.password.hash(body.password, { algorithm: "bcrypt", cost: 10 })
      const user = await User.insert({
        email: body.email,
        passwordHash,
        name: body.name,
        role: "user",
      })

      // Set session
      const session = (c.var as Record<string, unknown>).session as {
        userId: number
        userRole: string
        save: () => Promise<void>
      }
      session.userId = user.get("id") as number
      session.userRole = user.get("role") as string
      await session.save()

      return c.json(
        {
          id: user.get("id"),
          email: user.get("email"),
          name: user.get("name"),
          role: user.get("role"),
        },
        201,
      )
    }),
)

// ---------------------------------------------------------------------------
// POST /auth/login
// ---------------------------------------------------------------------------
app.post(
  "/login",
  route()
    .summary("Log in with email and password")
    .tags("auth")
    .requestBody(LoginBody)
    .response(200, UserResponse)
    .response(401, "Invalid credentials")
    .handle(async (c) => {
      const body = c.req.valid("json")

      const user = await User.query().where("email", "=", body.email).first()
      if (!user) {
        return c.json({ error: "Invalid credentials" }, 401)
      }

      const passwordHash = user.get("passwordHash") as string
      const valid = await Bun.password.verify(body.password, passwordHash)
      if (!valid) {
        return c.json({ error: "Invalid credentials" }, 401)
      }

      // Set session
      const session = (c.var as Record<string, unknown>).session as {
        userId: number
        userRole: string
        save: () => Promise<void>
      }
      session.userId = user.get("id") as number
      session.userRole = user.get("role") as string
      await session.save()

      return c.json({
        id: user.get("id"),
        email: user.get("email"),
        name: user.get("name"),
        role: user.get("role"),
      })
    }),
)

// ---------------------------------------------------------------------------
// POST /auth/logout
// ---------------------------------------------------------------------------
app.post(
  "/logout",
  route()
    .summary("Log out and destroy the session")
    .tags("auth")
    .response(200, "Logged out")
    .handle(async (c) => {
      const session = (c.var as Record<string, unknown>).session as {
        destroy: () => void
      }
      session.destroy()
      return c.json({ ok: true })
    }),
)

// ---------------------------------------------------------------------------
// GET /auth/me
// ---------------------------------------------------------------------------
app.get(
  "/me",
  route()
    .summary("Get the currently logged-in user")
    .tags("auth")
    .response(200, UserResponse)
    .response(401, "Not authenticated")
    .handle(async (c) => {
      const session = (c.var as Record<string, unknown>).session as {
        userId?: number
        userRole?: string
      }

      if (!session.userId) {
        return c.json({ error: "Not authenticated" }, 401)
      }

      const user = await User.find(session.userId)
      if (!user) {
        return c.json({ error: "User not found" }, 404)
      }

      return c.json({
        id: user.get("id"),
        email: user.get("email"),
        name: user.get("name"),
        role: user.get("role"),
      })
    }),
)

export default app
