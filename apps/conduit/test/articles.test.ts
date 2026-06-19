import { describe, expect, it } from "bun:test"
import { createArticle, createTestApp, signupUser } from "./setup.js"

const uniqueId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

describe("Articles", () => {
  it("should create an article", async () => {
    const { app } = await createTestApp()
    const uid = uniqueId()
    const { token } = await signupUser(app, {
      username: `art_${uid}`,
      email: `art_${uid}@test.com`,
      password: "password123",
    })

    const { slug } = await createArticle(app, token, {
      title: `Test Article ${uid}`,
      description: "Test description",
      body: "Test body",
      tagList: ["tag1", "tag2"],
    })
    expect(slug).toBeTruthy()
    expect(slug).toContain("test-article")
  })

  it("should list articles", async () => {
    const { app } = await createTestApp()
    const uid = uniqueId()
    const { token } = await signupUser(app, {
      username: `list_${uid}`,
      email: `list_${uid}@test.com`,
      password: "password123",
    })

    await createArticle(app, token, {
      title: `Article ${uid}`,
      description: "Desc",
      body: "Body",
    })

    const res = await app.fetch(new Request("http://localhost/api/articles"))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.articles).toBeInstanceOf(Array)
    expect(body.articlesCount).toBeGreaterThanOrEqual(1)
  })

  it("should get article by slug", async () => {
    const { app } = await createTestApp()
    const uid = uniqueId()
    const { token } = await signupUser(app, {
      username: `get_${uid}`,
      email: `get_${uid}@test.com`,
      password: "password123",
    })

    const { slug } = await createArticle(app, token, {
      title: `Get Test ${uid}`,
      description: "Desc",
      body: "Body",
    })

    const res = await app.fetch(new Request(`http://localhost/api/articles/${slug}`))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.article.slug).toBe(slug)
    expect(body.article.body).toBe("Body")
  })

  it("should return 404 for non-existent article", async () => {
    const { app } = await createTestApp()
    const res = await app.fetch(new Request("http://localhost/api/articles/non-existent-slug"))
    expect(res.status).toBe(404)
  })

  it("should update an article", async () => {
    const { app } = await createTestApp()
    const uid = uniqueId()
    const { token } = await signupUser(app, {
      username: `upd_${uid}`,
      email: `upd_${uid}@test.com`,
      password: "password123",
    })

    const { slug } = await createArticle(app, token, {
      title: `Update ${uid}`,
      description: "Original desc",
      body: "Original body",
    })

    const res = await app.fetch(
      new Request(`http://localhost/api/articles/${slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Token ${token}` },
        body: JSON.stringify({ article: { body: "Updated body" } }),
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.article.body).toBe("Updated body")
  })

  it("should not update article by non-author", async () => {
    const { app } = await createTestApp()
    const uid = uniqueId()
    const { token: authorToken } = await signupUser(app, {
      username: `author_${uid}`,
      email: `author_${uid}@test.com`,
      password: "password123",
    })
    const { token: otherToken } = await signupUser(app, {
      username: `other_${uid}`,
      email: `other_${uid}@test.com`,
      password: "password123",
    })

    const { slug } = await createArticle(app, authorToken, {
      title: `Owner Test ${uid}`,
      description: "Desc",
      body: "Body",
    })

    const res = await app.fetch(
      new Request(`http://localhost/api/articles/${slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Token ${otherToken}` },
        body: JSON.stringify({ article: { body: "Hacked" } }),
      }),
    )
    expect(res.status).toBe(403)
  })

  it("should delete an article", async () => {
    const { app } = await createTestApp()
    const uid = uniqueId()
    const { token } = await signupUser(app, {
      username: `del_${uid}`,
      email: `del_${uid}@test.com`,
      password: "password123",
    })

    const { slug } = await createArticle(app, token, {
      title: `Delete ${uid}`,
      description: "Desc",
      body: "Body",
    })

    const res = await app.fetch(
      new Request(`http://localhost/api/articles/${slug}`, {
        method: "DELETE",
        headers: { Authorization: `Token ${token}` },
      }),
    )
    expect(res.status).toBe(204)

    // Verify deletion
    const getRes = await app.fetch(new Request(`http://localhost/api/articles/${slug}`))
    expect(getRes.status).toBe(404)
  })

  it("should not delete article by non-author", async () => {
    const { app } = await createTestApp()
    const uid = uniqueId()
    const { token: authorToken } = await signupUser(app, {
      username: `author_${uid}`,
      email: `author_${uid}@test.com`,
      password: "password123",
    })
    const { token: otherToken } = await signupUser(app, {
      username: `other_${uid}`,
      email: `other_${uid}@test.com`,
      password: "password123",
    })

    const { slug } = await createArticle(app, authorToken, {
      title: `Del Owner ${uid}`,
      description: "Desc",
      body: "Body",
    })

    const res = await app.fetch(
      new Request(`http://localhost/api/articles/${slug}`, {
        method: "DELETE",
        headers: { Authorization: `Token ${otherToken}` },
      }),
    )
    expect(res.status).toBe(403)
  })

  it("should filter articles by tag", async () => {
    const { app } = await createTestApp()
    const uid = uniqueId()
    const { token } = await signupUser(app, {
      username: `tag_${uid}`,
      email: `tag_${uid}@test.com`,
      password: "password123",
    })

    await createArticle(app, token, {
      title: `Tagged Article ${uid}`,
      description: "Desc",
      body: "Body",
      tagList: [`filter_${uid}`],
    })

    const res = await app.fetch(new Request(`http://localhost/api/articles?tag=filter_${uid}`))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.articles.length).toBeGreaterThanOrEqual(1)
  })

  it("should filter articles by author", async () => {
    const { app } = await createTestApp()
    const uid = uniqueId()
    const username = `byauthor_${uid}`
    const { token } = await signupUser(app, {
      username,
      email: `byauthor_${uid}@test.com`,
      password: "password123",
    })

    await createArticle(app, token, {
      title: `Author Article ${uid}`,
      description: "Desc",
      body: "Body",
    })

    const res = await app.fetch(new Request(`http://localhost/api/articles?author=${username}`))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.articles.length).toBeGreaterThanOrEqual(1)
  })
})
