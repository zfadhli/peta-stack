import { type } from "arktype"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { route } from "peta-docs/hono"
import { DatabaseError } from "peta-orm"
import { User } from "../db/schema.js"
import { signToken } from "../lib/jwt.js"
import { requireAuth } from "../middleware/auth.js"
import { onValidationError } from "../middleware/error.js"

const app = new Hono()

// ---------------------------------------------------------------------------
// ArkType schemas
// ---------------------------------------------------------------------------

const RegisterBody = type({
  user: { username: "string>0", email: "string.email", password: "string>=8" },
})

const LoginBody = type({
  user: { email: "string.email", password: "string>=1" },
})

const UpdateUserBody = type({
  user: {
    "email?": "string.email",
    "username?": "string>0",
    "password?": "string>=8",
    "bio?": "string | null",
    "image?": "string | null",
  },
})

const UserResponse = type({
  user: {
    email: "string",
    token: "string",
    username: "string",
    bio: "string | null",
    image: "string | null",
  },
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function buildUserResponse(
  userId: number,
  username: string,
  email: string,
  bio: string | null | undefined,
  image: string | null | undefined,
) {
  const token = await signToken(userId, username)
  return { user: { email, token, username, bio: bio ?? null, image: image ?? null } }
}

// ---------------------------------------------------------------------------
// POST /api/users — Register
// ---------------------------------------------------------------------------

app.post(
  "/users",
  route()
    .summary("Register a new user")
    .tags("User and Authentication")
    .requestBody(RegisterBody)
    .response(201, UserResponse)
    .response(422, "Validation error")
    .response(409, "Conflict")
    .onValidationError(onValidationError)
    .handle(async (c) => {
      const { user: body } = c.req.valid("json")
      const passwordHash = await Bun.password.hash(body.password, { algorithm: "bcrypt", cost: 10 })

      let user: import("peta-orm").ModelInstance
      try {
        user = await User.insert({
          username: body.username,
          email: body.email,
          password: passwordHash,
          bio: null,
          image: null,
        })
      } catch (err) {
        if (err instanceof DatabaseError && err.code === "UNIQUE_CONSTRAINT") {
          const raw = (err.cause as Error)?.message ?? err.message
          const col = raw.includes(":") ? (raw.split(":").pop()?.trim().split(".").pop() ?? "") : ""
          if (col === "email") {
            throw new HTTPException(409, { message: "Email already taken" })
          }
          if (col === "username") {
            throw new HTTPException(409, { message: "Username already taken" })
          }
          throw new HTTPException(409, { message: "Already taken" })
        }
        throw err
      }

      const id = user.get<number>("id")
      const name = user.get<string>("username")
      const email = user.get<string>("email")
      const bio = user.get<string | null>("bio")
      const image = user.get<string | null>("image")

      return c.json(await buildUserResponse(id, name, email, bio, image), 201)
    }),
)

// ---------------------------------------------------------------------------
// POST /api/users/login — Login
// ---------------------------------------------------------------------------

app.post(
  "/users/login",
  route()
    .summary("Existing user login")
    .tags("User and Authentication")
    .requestBody(LoginBody)
    .response(200, UserResponse)
    .response(401, "Unauthorized")
    .response(422, "Validation error")
    .onValidationError(onValidationError)
    .handle(async (c) => {
      const { user: body } = c.req.valid("json")
      const user = await User.query().where("email", "=", body.email).first()
      if (!user) throw new HTTPException(401, { message: "Invalid email or password" })

      const valid = await Bun.password.verify(body.password, user.get<string>("password"))
      if (!valid) throw new HTTPException(401, { message: "Invalid email or password" })

      const id = user.get<number>("id")
      const name = user.get<string>("username")
      const email = user.get<string>("email")
      const bio = user.get<string | null>("bio")
      const image = user.get<string | null>("image")

      return c.json(await buildUserResponse(id, name, email, bio, image))
    }),
)

// ---------------------------------------------------------------------------
// GET /api/user — Get current user
// ---------------------------------------------------------------------------

app.get(
  "/user",
  requireAuth(),
  route()
    .summary("Get current user")
    .tags("User and Authentication")
    .auth("Token")
    .response(200, UserResponse)
    .response(401, "Unauthorized")
    .onValidationError(onValidationError)
    .handle(async (c) => {
      const userId = c.var.currentUserId!
      const user = await User.find(userId)
      if (!user) throw new HTTPException(404, { message: "User not found" })

      return c.json(
        await buildUserResponse(
          user.get<number>("id"),
          user.get<string>("username"),
          user.get<string>("email"),
          user.get<string | null>("bio"),
          user.get<string | null>("image"),
        ),
      )
    }),
)

// ---------------------------------------------------------------------------
// PUT /api/user — Update current user
// ---------------------------------------------------------------------------

app.put(
  "/user",
  requireAuth(),
  route()
    .summary("Update current user")
    .tags("User and Authentication")
    .auth("Token")
    .requestBody(UpdateUserBody)
    .response(200, UserResponse)
    .response(401, "Unauthorized")
    .response(422, "Validation error")
    .onValidationError(onValidationError)
    .handle(async (c) => {
      const userId = c.var.currentUserId!
      const { user: body } = c.req.valid("json")

      const updates: Record<string, unknown> = {}
      if (body.email !== undefined) updates.email = body.email
      if (body.username !== undefined) updates.username = body.username
      if (body.password !== undefined) {
        updates.password = await Bun.password.hash(body.password, { algorithm: "bcrypt", cost: 10 })
      }
      if (body.bio !== undefined) updates.bio = body.bio === "" ? null : body.bio
      if (body.image !== undefined) updates.image = body.image === "" ? null : body.image

      if (Object.keys(updates).length === 0) {
        // Return current user unchanged
        const user = await User.find(userId)
        if (!user) throw new HTTPException(404, { message: "User not found" })
        return c.json(
          await buildUserResponse(
            user.get<number>("id"),
            user.get<string>("username"),
            user.get<string>("email"),
            user.get<string | null>("bio"),
            user.get<string | null>("image"),
          ),
        )
      }

      try {
        await User.update(userId, updates)
      } catch (err) {
        if (err instanceof DatabaseError && err.code === "UNIQUE_CONSTRAINT") {
          throw new HTTPException(409, { message: "Email or username already taken" })
        }
        throw err
      }

      const user = await User.find(userId)
      if (!user) throw new HTTPException(404, { message: "User not found" })
      return c.json(
        await buildUserResponse(
          user.get<number>("id"),
          user.get<string>("username"),
          user.get<string>("email"),
          user.get<string | null>("bio"),
          user.get<string | null>("image"),
        ),
      )
    }),
)

export default app
