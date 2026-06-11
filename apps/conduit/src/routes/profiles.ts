import { type } from "arktype"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { route } from "peta-docs/hono"
import { Follow, User } from "../db/schema.js"
import { getCurrentUserId } from "../middleware/auth.js"
import { onValidationError } from "../middleware/error.js"

const app = new Hono({ strict: true })

// ---------------------------------------------------------------------------
// ArkType schemas
// ---------------------------------------------------------------------------

const ProfileResponse = type({
  profile: {
    username: "string",
    bio: "string | null",
    image: "string | null",
    following: "boolean",
  },
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function buildProfile(username: string, currentUserId?: number) {
  const user = await User.query().where("username", "=", username).first()
  if (!user) throw new HTTPException(404, { message: "Profile not found" })

  let following = false
  if (currentUserId) {
    const follow = await Follow.query()
      .where("followerId", "=", currentUserId)
      .where("followeeId", "=", user.get<number>("id"))
      .first()
    following = !!follow
  }

  return {
    profile: {
      username: user.get<string>("username"),
      bio: user.get<string | null>("bio"),
      image: user.get<string | null>("image"),
      following,
    },
  }
}

// ---------------------------------------------------------------------------
// GET /api/profiles/:username — Get profile
// ---------------------------------------------------------------------------

app.get(
  "/profiles/:username",
  route()
    .summary("Get a profile")
    .tags("Profile")
    .params(type({ username: "string" }))
    .response(200, ProfileResponse)
    .response(404, "Not found")
    .onValidationError(onValidationError)
    .handle(async (c) => {
      const { username } = c.req.valid("param")
      const currentUserId = getCurrentUserId(c)
      return c.json(await buildProfile(username, currentUserId))
    }),
)

// ---------------------------------------------------------------------------
// POST /api/profiles/:username/follow — Follow user
// ---------------------------------------------------------------------------

app.post(
  "/profiles/:username/follow",
  route()
    .summary("Follow a user")
    .tags("Profile")
    .params(type({ username: "string" }))
    .response(200, ProfileResponse)
    .response(401, "Unauthorized")
    .response(404, "Not found")
    .onValidationError(onValidationError)
    .handle(async (c) => {
      const { username } = c.req.valid("param")
      const currentUserId = c.var.currentUserId!

      const target = await User.query().where("username", "=", username).first()
      if (!target) throw new HTTPException(404, { message: "Profile not found" })

      const targetId = target.get<number>("id")

      // Don't allow following yourself
      if (targetId === currentUserId) {
        return c.json(await buildProfile(username, currentUserId))
      }

      // Check if already following
      const existing = await Follow.query()
        .where("followerId", "=", currentUserId)
        .where("followeeId", "=", targetId)
        .first()

      if (!existing) {
        await Follow.insert({ followerId: currentUserId, followeeId: targetId })
      }

      return c.json(await buildProfile(username, currentUserId))
    }),
)

// ---------------------------------------------------------------------------
// DELETE /api/profiles/:username/follow — Unfollow user
// ---------------------------------------------------------------------------

app.delete(
  "/profiles/:username/follow",
  route()
    .summary("Unfollow a user")
    .tags("Profile")
    .params(type({ username: "string" }))
    .response(200, ProfileResponse)
    .response(401, "Unauthorized")
    .response(404, "Not found")
    .onValidationError(onValidationError)
    .handle(async (c) => {
      const { username } = c.req.valid("param")
      const currentUserId = c.var.currentUserId!

      const target = await User.query().where("username", "=", username).first()
      if (!target) throw new HTTPException(404, { message: "Profile not found" })

      const targetId = target.get<number>("id")

      await Follow.query().where("followerId", "=", currentUserId).where("followeeId", "=", targetId).deleteMany()

      return c.json(await buildProfile(username, currentUserId))
    }),
)

export default app
