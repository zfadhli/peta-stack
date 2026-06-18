import { describe, expect, it } from "bun:test"
import { createTestApp, loginUser, signupUser } from "./setup.js"

const uniqueId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

describe("Auth", () => {
  it("should register a new user", async () => {
    const { app } = await createTestApp()
    const uid = uniqueId()
    const { token, username } = await signupUser(app, {
      username: `test_${uid}`,
      email: `test_${uid}@test.com`,
      password: "password123",
    })
    expect(token).toBeTruthy()
    expect(username).toBe(`test_${uid}`)
  })

  it("should not allow duplicate email", async () => {
    const { app } = await createTestApp()
    const uid = uniqueId()
    const email = `dup_${uid}@test.com`
    await signupUser(app, { username: `first_${uid}`, email, password: "password123" })

    const res = await app.fetch(
      new Request("http://localhost/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user: { username: `second_${uid}`, email, password: "password123" } }),
      }),
    )
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.errors.email[0]).toBe("has already been taken")
  })

  it("should not allow duplicate username", async () => {
    const { app } = await createTestApp()
    const uid = uniqueId()
    const username = `dupuser_${uid}`
    await signupUser(app, { username, email: `first_${uid}@test.com`, password: "password123" })

    const res = await app.fetch(
      new Request("http://localhost/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user: { username, email: `second_${uid}@test.com`, password: "password123" } }),
      }),
    )
    expect(res.status).toBe(409)
  })

  it("should login with correct credentials", async () => {
    const { app } = await createTestApp()
    const uid = uniqueId()
    await signupUser(app, {
      username: `login_${uid}`,
      email: `login_${uid}@test.com`,
      password: "password123",
    })

    const { token, username } = await loginUser(app, {
      email: `login_${uid}@test.com`,
      password: "password123",
    })
    expect(token).toBeTruthy()
    expect(username).toBe(`login_${uid}`)
  })

  it("should reject login with wrong password", async () => {
    const { app } = await createTestApp()
    const uid = uniqueId()
    await signupUser(app, {
      username: `wrongpw_${uid}`,
      email: `wrongpw_${uid}@test.com`,
      password: "password123",
    })

    const res = await app.fetch(
      new Request("http://localhost/api/users/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user: { email: `wrongpw_${uid}@test.com`, password: "wrongpassword" } }),
      }),
    )
    expect(res.status).toBe(401)
  })

  it("should get current user", async () => {
    const { app } = await createTestApp()
    const uid = uniqueId()
    const { token } = await signupUser(app, {
      username: `me_${uid}`,
      email: `me_${uid}@test.com`,
      password: "password123",
    })

    const res = await app.fetch(
      new Request("http://localhost/api/user", {
        headers: { Authorization: `Token ${token}` },
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.user.username).toBe(`me_${uid}`)
    expect(body.user.email).toBe(`me_${uid}@test.com`)
  })

  it("should reject unauthenticated user route", async () => {
    const { app } = await createTestApp()
    const res = await app.fetch(new Request("http://localhost/api/user"))
    expect(res.status).toBe(401)
  })

  it("should update current user", async () => {
    const { app } = await createTestApp()
    const uid = uniqueId()
    const { token } = await signupUser(app, {
      username: `upd_${uid}`,
      email: `upd_${uid}@test.com`,
      password: "password123",
    })

    const res = await app.fetch(
      new Request("http://localhost/api/user", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Token ${token}` },
        body: JSON.stringify({ user: { bio: "Updated bio" } }),
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.user.bio).toBe("Updated bio")
  })

  it("should reject update without auth", async () => {
    const { app } = await createTestApp()
    const res = await app.fetch(
      new Request("http://localhost/api/user", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user: { bio: "Hacker" } }),
      }),
    )
    expect(res.status).toBe(401)
  })
})
