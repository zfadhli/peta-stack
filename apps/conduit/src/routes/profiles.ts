import { type } from "arktype"
import { Hono } from "hono"
import { route } from "peta-docs/hono"
import { Follow, User } from "../db/schema.js"
import { requireAuth } from "../middleware/auth.js"
import { onValidationError } from "../middleware/error.js"
import { http } from "../middleware/http-error.js"

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

async function buildProfile(username: string, currentUserId?: string) {
  const user = await User.query().where("username", "=", username).first()
  if (!user) throw http.notFound("profile: not found")

  let following = false
  if (currentUserId) {
    const follow = await Follow.query()
      .where("followerId", "=", currentUserId)
      .where("followeeId", "=", user.get("id"))
      .first()
    following = !!follow
  }

  return {
    profile: {
      username: user.get("username"),
      bio: user.get("bio"),
      image: user.get("image"),
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
      const currentUserId = c.var.currentUserId
      return c.json(await buildProfile(username, currentUserId))
    }),
)

// ---------------------------------------------------------------------------
// POST /api/profiles/:username/follow — Follow user
// ---------------------------------------------------------------------------

app.post(
  "/profiles/:username/follow",
  requireAuth(),
  route()
    .summary("Follow a user")
    .tags("Profile")
    .auth("Token")
    .params(type({ username: "string" }))
    .response(200, ProfileResponse)
    .response(401, "Unauthorized")
    .response(404, "Not found")
    .onValidationError(onValidationError)
    .handle(async (c) => {
      const { username } = c.req.valid("param")
      const currentUserId = c.var.currentUserId!

      const target = await User.query().where("username", "=", username).first()
      if (!target) throw http.notFound("profile: not found")

      const targetId = target.get("id")

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
  requireAuth(),
  route()
    .summary("Unfollow a user")
    .tags("Profile")
    .auth("Token")
    .params(type({ username: "string" }))
    .response(200, ProfileResponse)
    .response(401, "Unauthorized")
    .response(404, "Not found")
    .onValidationError(onValidationError)
    .handle(async (c) => {
      const { username } = c.req.valid("param")
      const currentUserId = c.var.currentUserId!

      const target = await User.query().where("username", "=", username).first()
      if (!target) throw http.notFound("profile: not found")

      const targetId = target.get("id")

      await Follow.query()
        .where("followerId", "=", currentUserId)
        .where("followeeId", "=", targetId)
        .deleteMany()

      return c.json(await buildProfile(username, currentUserId))
    }),
)

export default app
