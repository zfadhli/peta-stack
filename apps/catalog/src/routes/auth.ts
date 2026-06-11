import { type } from "arktype"
import { Hono } from "hono"
import { route } from "peta-docs/hono"
import { User } from "../db/schema.js"
import { http } from "../middleware/http-error.js"

const app = new Hono()

const SignupBody = type({ email: "string.email", password: "string>=8", name: "string>0" })
const LoginBody = type({ email: "string.email", password: "string>=1" })
const UserResponse = type({ id: "number", email: "string", name: "string", role: "'admin'|'user'" })

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
      const existing = await User.query().where("email", "=", body.email).first()
      if (existing) throw http.conflict("Email already exists")

      const passwordHash = await Bun.password.hash(body.password, { algorithm: "bcrypt", cost: 10 })
      const user = await User.insert({ email: body.email, passwordHash, name: body.name, role: "user" })

      const session = c.var.session
      session.userId = user.get<number>("id")
      session.userRole = user.get<string>("role")
      await session.save()

      return c.json(
        { id: user.get("id"), email: user.get("email"), name: user.get("name"), role: user.get("role") },
        201,
      )
    }),
)

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
      if (!user) throw http.unauthorized("Invalid credentials")

      const valid = await Bun.password.verify(body.password, user.get<string>("passwordHash"))
      if (!valid) throw http.unauthorized("Invalid credentials")

      const session = c.var.session
      session.userId = user.get<number>("id")
      session.userRole = user.get<string>("role")
      await session.save()

      return c.json({ id: user.get("id"), email: user.get("email"), name: user.get("name"), role: user.get("role") })
    }),
)

app.post(
  "/logout",
  route()
    .summary("Log out and destroy the session")
    .tags("auth")
    .response(200, "Logged out")
    .handle(async (c) => {
      c.var.session.destroy()
      return c.json({ ok: true })
    }),
)

app.get(
  "/me",
  route()
    .summary("Get the currently logged-in user")
    .tags("auth")
    .response(200, UserResponse)
    .response(401, "Not authenticated")
    .handle(async (c) => {
      if (!c.var.session.userId) throw http.unauthorized("Not authenticated")
      const user = await User.find(c.var.session.userId!)
      if (!user) throw http.notFound("User not found")
      return c.json({ id: user.get("id"), email: user.get("email"), name: user.get("name"), role: user.get("role") })
    }),
)

export default app
