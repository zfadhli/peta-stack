import { describe, expect, it } from "bun:test"
import { createArticle, createTestApp, signupUser } from "./setup.js"

const uniqueId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

describe("Favorites", () => {
  it("should favorite an article", async () => {
    const { app } = createTestApp()
    const uid = uniqueId()
    const { token } = await signupUser(app, {
      username: `fav_${uid}`,
      email: `fav_${uid}@test.com`,
      password: "password123",
    })

    const { slug } = await createArticle(app, token, {
      title: `Fav Article ${uid}`,
      description: "Desc",
      body: "Body",
    })

    const res = await app.fetch(
      new Request(`http://localhost/api/articles/${slug}/favorite`, {
        method: "POST",
        headers: { Authorization: `Token ${token}` },
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.article.favorited).toBe(true)
    expect(body.article.favoritesCount).toBe(1)
  })

  it("should unfavorite an article", async () => {
    const { app } = createTestApp()
    const uid = uniqueId()
    const { token } = await signupUser(app, {
      username: `unfav_${uid}`,
      email: `unfav_${uid}@test.com`,
      password: "password123",
    })

    const { slug } = await createArticle(app, token, {
      title: `Unfav Article ${uid}`,
      description: "Desc",
      body: "Body",
    })

    // Favorite first
    await app.fetch(
      new Request(`http://localhost/api/articles/${slug}/favorite`, {
        method: "POST",
        headers: { Authorization: `Token ${token}` },
      }),
    )

    // Then unfavorite
    const res = await app.fetch(
      new Request(`http://localhost/api/articles/${slug}/favorite`, {
        method: "DELETE",
        headers: { Authorization: `Token ${token}` },
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.article.favorited).toBe(false)
    expect(body.article.favoritesCount).toBe(0)
  })

  it("should require auth to favorite", async () => {
    const { app } = createTestApp()
    const uid = uniqueId()
    const { token } = await signupUser(app, {
      username: `noauthfav_${uid}`,
      email: `noauthfav_${uid}@test.com`,
      password: "password123",
    })

    const { slug } = await createArticle(app, token, {
      title: `No Auth Fav ${uid}`,
      description: "Desc",
      body: "Body",
    })

    const res = await app.fetch(
      new Request(`http://localhost/api/articles/${slug}/favorite`, {
        method: "POST",
      }),
    )
    expect(res.status).toBe(401)
  })

  it("should return 404 for non-existent article", async () => {
    const { app } = createTestApp()
    const uid = uniqueId()
    const { token } = await signupUser(app, {
      username: `notfoundfav_${uid}`,
      email: `notfoundfav_${uid}@test.com`,
      password: "password123",
    })

    const res = await app.fetch(
      new Request("http://localhost/api/articles/non-existent-slug/favorite", {
        method: "POST",
        headers: { Authorization: `Token ${token}` },
      }),
    )
    expect(res.status).toBe(404)
  })
})
