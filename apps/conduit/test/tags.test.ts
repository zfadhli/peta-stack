import { describe, expect, it } from "bun:test"
import { createArticle, createTestApp, signupUser } from "./setup.js"

const uniqueId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

describe("Tags", () => {
  it("should return empty tags list when no articles exist", async () => {
    const { app } = createTestApp()
    const res = await app.fetch(new Request("http://localhost/api/tags"))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.tags).toBeInstanceOf(Array)
  })

  it("should return tags from existing articles", async () => {
    const { app } = createTestApp()
    const uid = uniqueId()
    const { token } = await signupUser(app, {
      username: `tags_${uid}`,
      email: `tags_${uid}@test.com`,
      password: "password123",
    })

    await createArticle(app, token, {
      title: `Tags Article ${uid}`,
      description: "Desc",
      body: "Body",
      tagList: [`tagone_${uid}`, `tagtwo_${uid}`],
    })

    const res = await app.fetch(new Request("http://localhost/api/tags"))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.tags).toContain(`tagone_${uid}`)
    expect(body.tags).toContain(`tagtwo_${uid}`)
  })
})
