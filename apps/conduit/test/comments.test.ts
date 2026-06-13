import { describe, expect, it } from "bun:test"
import { createArticle, createTestApp, signupUser } from "./setup.js"

const uniqueId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

describe("Comments", () => {
  it("should create a comment on an article", async () => {
    const { app } = createTestApp()
    const uid = uniqueId()
    const { token } = await signupUser(app, {
      username: `cmt_${uid}`,
      email: `cmt_${uid}@test.com`,
      password: "password123",
    })

    const { slug } = await createArticle(app, token, {
      title: `Comment Article ${uid}`,
      description: "Desc",
      body: "Body",
    })

    const res = await app.fetch(
      new Request(`http://localhost/api/articles/${slug}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Token ${token}` },
        body: JSON.stringify({ comment: { body: "Nice article!" } }),
      }),
    )
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.comment.body).toBe("Nice article!")
    expect(body.comment.id).toBeTruthy()
  })

  it("should list comments for an article", async () => {
    const { app } = createTestApp()
    const uid = uniqueId()
    const { token } = await signupUser(app, {
      username: `listcmt_${uid}`,
      email: `listcmt_${uid}@test.com`,
      password: "password123",
    })

    const { slug } = await createArticle(app, token, {
      title: `List Comment Article ${uid}`,
      description: "Desc",
      body: "Body",
    })

    // Create a comment
    await app.fetch(
      new Request(`http://localhost/api/articles/${slug}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Token ${token}` },
        body: JSON.stringify({ comment: { body: "First comment" } }),
      }),
    )

    // List comments
    const res = await app.fetch(new Request(`http://localhost/api/articles/${slug}/comments`))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.comments).toBeInstanceOf(Array)
    expect(body.comments.length).toBe(1)
    expect(body.comments[0].body).toBe("First comment")
  })

  it("should require auth to create a comment", async () => {
    const { app } = createTestApp()
    const uid = uniqueId()
    const { token } = await signupUser(app, {
      username: `noauthcmt_${uid}`,
      email: `noauthcmt_${uid}@test.com`,
      password: "password123",
    })

    const { slug } = await createArticle(app, token, {
      title: `No Auth Comment ${uid}`,
      description: "Desc",
      body: "Body",
    })

    const res = await app.fetch(
      new Request(`http://localhost/api/articles/${slug}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: { body: "Anonymous" } }),
      }),
    )
    expect(res.status).toBe(401)
  })

  it("should delete own comment", async () => {
    const { app } = createTestApp()
    const uid = uniqueId()
    const { token } = await signupUser(app, {
      username: `delcmt_${uid}`,
      email: `delcmt_${uid}@test.com`,
      password: "password123",
    })

    const { slug } = await createArticle(app, token, {
      title: `Delete Comment ${uid}`,
      description: "Desc",
      body: "Body",
    })

    const createRes = await app.fetch(
      new Request(`http://localhost/api/articles/${slug}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Token ${token}` },
        body: JSON.stringify({ comment: { body: "To delete" } }),
      }),
    )
    const { comment } = await createRes.json()

    const delRes = await app.fetch(
      new Request(`http://localhost/api/articles/${slug}/comments/${comment.id}`, {
        method: "DELETE",
        headers: { Authorization: `Token ${token}` },
      }),
    )
    expect(delRes.status).toBe(204)
  })

  it("should not delete another user's comment", async () => {
    const { app } = createTestApp()
    const uid = uniqueId()
    const { token: authorToken } = await signupUser(app, {
      username: `authcmt_${uid}`,
      email: `authcmt_${uid}@test.com`,
      password: "password123",
    })
    const { token: otherToken } = await signupUser(app, {
      username: `othercmt_${uid}`,
      email: `othercmt_${uid}@test.com`,
      password: "password123",
    })

    const { slug } = await createArticle(app, authorToken, {
      title: `Other Comment ${uid}`,
      description: "Desc",
      body: "Body",
    })

    const createRes = await app.fetch(
      new Request(`http://localhost/api/articles/${slug}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Token ${authorToken}` },
        body: JSON.stringify({ comment: { body: "Author's comment" } }),
      }),
    )
    const { comment } = await createRes.json()

    const delRes = await app.fetch(
      new Request(`http://localhost/api/articles/${slug}/comments/${comment.id}`, {
        method: "DELETE",
        headers: { Authorization: `Token ${otherToken}` },
      }),
    )
    expect(delRes.status).toBe(403)
  })
})
