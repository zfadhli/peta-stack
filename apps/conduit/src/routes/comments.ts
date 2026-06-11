import { type } from "arktype"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { route } from "peta-docs/hono"
import { Article, Comment, Follow, User } from "../db/schema.js"
import { getCurrentUserId } from "../middleware/auth.js"
import { onValidationError } from "../middleware/error.js"

const app = new Hono()

// ---------------------------------------------------------------------------
// ArkType schemas
// ---------------------------------------------------------------------------

const CommentResponse = type({
  comment: {
    id: "number",
    createdAt: "string",
    updatedAt: "string",
    body: "string",
    author: {
      username: "string",
      bio: "string | null",
      image: "string | null",
      following: "boolean",
    },
  },
})

const MultipleCommentsResponse = type({
  comments: type({
    id: "number",
    createdAt: "string",
    updatedAt: "string",
    body: "string",
    author: {
      username: "string",
      bio: "string | null",
      image: "string | null",
      following: "boolean",
    },
  }).array(),
})

const CreateCommentBody = type({
  comment: { body: "string>0" },
})

const SlugAndIdParams = type({ slug: "string", id: "number" })
const SlugParams = type({ slug: "string" })

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function isFollowing(authorId: number, currentUserId?: number): Promise<boolean> {
  if (!currentUserId) return false
  const follow = await Follow.query().where("followerId", "=", currentUserId).where("followeeId", "=", authorId).first()
  return !!follow
}

async function buildCommentResponse(comment: import("peta-orm").ModelInstance, currentUserId?: number) {
  const author = await User.find(comment.get<number>("authorId"))
  if (!author) throw new HTTPException(404, { message: "Author not found" })
  return {
    id: comment.get<number>("id"),
    createdAt: comment.get<string>("createdAt"),
    updatedAt: comment.get<string>("updatedAt"),
    body: comment.get<string>("body"),
    author: {
      username: author.get<string>("username"),
      bio: author.get<string | null>("bio"),
      image: author.get<string | null>("image"),
      following: await isFollowing(author.get<number>("id"), currentUserId),
    },
  }
}

// ---------------------------------------------------------------------------
// GET /api/articles/:slug/comments — Get comments
// ---------------------------------------------------------------------------

app.get(
  "/articles/:slug/comments",
  route()
    .summary("Get comments for an article")
    .tags("Comments")
    .params(SlugParams)
    .response(200, MultipleCommentsResponse)
    .response(404, "Not found")
    .onValidationError(onValidationError)
    .handle(async (c) => {
      const { slug } = c.req.valid("param")
      const article = await Article.query().where("slug", "=", slug).first()
      if (!article) throw new HTTPException(404, { message: "Article not found" })

      const comments = await Comment.query()
        .where("articleId", "=", article.get<number>("id"))
        .orderBy("createdAt", "asc")
        .execute()

      const currentUserId = getCurrentUserId(c)
      const items = await Promise.all(comments.map((c) => buildCommentResponse(c, currentUserId)))
      return c.json({ comments: items })
    }),
)

// ---------------------------------------------------------------------------
// POST /api/articles/:slug/comments — Create comment
// ---------------------------------------------------------------------------

app.post(
  "/articles/:slug/comments",
  route()
    .summary("Create a comment for an article")
    .tags("Comments")
    .auth("Token")
    .params(SlugParams)
    .requestBody(CreateCommentBody)
    .response(201, CommentResponse)
    .response(401, "Unauthorized")
    .response(404, "Not found")
    .response(422, "Validation error")
    .onValidationError(onValidationError)
    .handle(async (c) => {
      const currentUserId = c.var.currentUserId!
      const { slug } = c.req.valid("param")
      const { comment: body } = c.req.valid("json")

      const article = await Article.query().where("slug", "=", slug).first()
      if (!article) throw new HTTPException(404, { message: "Article not found" })

      const comment = await Comment.insert({
        articleId: article.get<number>("id"),
        authorId: currentUserId,
        body: body.body,
      })

      return c.json({ comment: await buildCommentResponse(comment, currentUserId) }, 201)
    }),
)

// ---------------------------------------------------------------------------
// DELETE /api/articles/:slug/comments/:id — Delete comment
// ---------------------------------------------------------------------------

app.delete(
  "/articles/:slug/comments/:id",
  route()
    .summary("Delete a comment for an article")
    .tags("Comments")
    .auth("Token")
    .params(SlugAndIdParams)
    .response(204, "No content")
    .response(401, "Unauthorized")
    .response(403, "Forbidden")
    .response(404, "Not found")
    .onValidationError(onValidationError)
    .handle(async (c) => {
      const currentUserId = c.var.currentUserId!
      const { slug, id } = c.req.valid("param")

      const article = await Article.query().where("slug", "=", slug).first()
      if (!article) throw new HTTPException(404, { message: "Article not found" })

      const comment = await Comment.find(id)
      if (!comment) throw new HTTPException(404, { message: "Comment not found" })

      // Only comment author can delete
      if (comment.get<number>("authorId") !== currentUserId) {
        throw new HTTPException(403, { message: "Forbidden" })
      }

      await Comment.delete(id)
      return c.body(null, 204)
    }),
)

export default app
