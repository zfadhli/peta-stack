import { describe, expect, it } from "bun:test"
import { createTestApp, signupUser } from "./setup.js"

const uniqueId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

describe("Profiles", () => {
  it("should get a profile", async () => {
    const { app } = createTestApp()
    const uid = uniqueId()
    await signupUser(app, {
      username: `pro_${uid}`,
      email: `pro_${uid}@test.com`,
      password: "password123",
    })

    const res = await app.fetch(new Request(`http://localhost/api/profiles/pro_${uid}`))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.profile.username).toBe(`pro_${uid}`)
    expect(body.profile.following).toBe(false)
  })

  it("should return 404 for non-existent profile", async () => {
    const { app } = createTestApp()
    const res = await app.fetch(new Request("http://localhost/api/profiles/nobody"))
    expect(res.status).toBe(404)
  })

  it("should follow a user", async () => {
    const { app } = createTestApp()
    const uid = uniqueId()
    await signupUser(app, {
      username: `target_${uid}`,
      email: `target_${uid}@test.com`,
      password: "password123",
    })
    const { token: followerToken } = await signupUser(app, {
      username: `follower_${uid}`,
      email: `follower_${uid}@test.com`,
      password: "password123",
    })

    const res = await app.fetch(
      new Request(`http://localhost/api/profiles/target_${uid}/follow`, {
        method: "POST",
        headers: { Authorization: `Token ${followerToken}` },
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.profile.following).toBe(true)
  })

  it("should unfollow a user", async () => {
    const { app } = createTestApp()
    const uid = uniqueId()
    await signupUser(app, {
      username: `untarget_${uid}`,
      email: `untarget_${uid}@test.com`,
      password: "password123",
    })
    const { token: unfollowerToken } = await signupUser(app, {
      username: `unfollower_${uid}`,
      email: `unfollower_${uid}@test.com`,
      password: "password123",
    })

    // Follow first
    await app.fetch(
      new Request(`http://localhost/api/profiles/untarget_${uid}/follow`, {
        method: "POST",
        headers: { Authorization: `Token ${unfollowerToken}` },
      }),
    )

    // Then unfollow
    const res = await app.fetch(
      new Request(`http://localhost/api/profiles/untarget_${uid}/follow`, {
        method: "DELETE",
        headers: { Authorization: `Token ${unfollowerToken}` },
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.profile.following).toBe(false)
  })

  it("should require auth to follow", async () => {
    const { app } = createTestApp()
    const res = await app.fetch(
      new Request("http://localhost/api/profiles/someone/follow", {
        method: "POST",
      }),
    )
    expect(res.status).toBe(401)
  })
})
