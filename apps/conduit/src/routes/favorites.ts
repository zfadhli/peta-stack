import { type } from "arktype"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { route } from "peta-docs/hono"
import type { ModelInstance } from "peta-orm"
import { Article, Favorite, Follow, User } from "../db/schema.js"
import { getCurrentUserId } from "../middleware/auth.js"
import { onValidationError } from "../middleware/error.js"

const app = new Hono()

// ---------------------------------------------------------------------------
// ArkType schemas
// ---------------------------------------------------------------------------

const ArticleResponse = type({
  article: {
    slug: "string",
    title: "string",
    description: "string",
    body: "string",
    tagList: "string[]",
    createdAt: "string",
    updatedAt: "string",
    favorited: "boolean",
    favoritesCount: "number",
    author: {
      username: "string",
      bio: "string | null",
      image: "string | null",
      following: "boolean",
    },
  },
})

const SlugParams = type({ slug: "string" })

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getTagListForArticle(articleId: number): Promise<string[]> {
  const { Tag } = await import("../db/schema.js")
  const tags = await Tag.query()
    .select("name")
    .innerJoin("article_tags", "article_tags.tagId", "tags.id")
    .where("article_tags.articleId", "=", articleId)
    .execute()
  return tags.map((t) => t.get<string>("name"))
}

async function buildArticleResponse(article: ModelInstance, currentUserId?: number) {
  const articleId = article.get<number>("id")
  const tagList = await getTagListForArticle(articleId)

  const author = await User.find(article.get<number>("authorId"))
  if (!author) throw new HTTPException(404, { message: "Author not found" })

  let following = false
  if (currentUserId) {
    const follow = await Follow.query()
      .where("followerId", "=", currentUserId)
      .where("followeeId", "=", author.get<number>("id"))
      .first()
    following = !!follow
  }

  const favorited = await (async () => {
    if (!currentUserId) return false
    const fav = await Favorite.query().where("userId", "=", currentUserId).where("articleId", "=", articleId).first()
    return !!fav
  })()

  const favoritesCount = await Favorite.query().where("articleId", "=", articleId).count()

  return {
    article: {
      slug: article.get<string>("slug"),
      title: article.get<string>("title"),
      description: article.get<string>("description"),
      body: article.get<string>("body"),
      tagList,
      createdAt: article.get<string>("createdAt"),
      updatedAt: article.get<string>("updatedAt"),
      favorited,
      favoritesCount,
      author: {
        username: author.get<string>("username"),
        bio: author.get<string | null>("bio"),
        image: author.get<string | null>("image"),
        following,
      },
    },
  }
}

// ---------------------------------------------------------------------------
// POST /api/articles/:slug/favorite — Favorite article
// ---------------------------------------------------------------------------

app.post(
  "/articles/:slug/favorite",
  route()
    .summary("Favorite an article")
    .tags("Favorites")
    .params(SlugParams)
    .response(200, ArticleResponse)
    .response(401, "Unauthorized")
    .response(404, "Not found")
    .onValidationError(onValidationError)
    .handle(async (c) => {
      const currentUserId = c.var.currentUserId!
      const { slug } = c.req.valid("param")

      const article = await Article.query().where("slug", "=", slug).first()
      if (!article) throw new HTTPException(404, { message: "Article not found" })

      const articleId = article.get<number>("id")

      // Check if already favorited
      const existing = await Favorite.query()
        .where("userId", "=", currentUserId)
        .where("articleId", "=", articleId)
        .first()

      if (!existing) {
        await Favorite.insert({ userId: currentUserId, articleId })
      }

      return c.json(await buildArticleResponse(article, currentUserId))
    }),
)

// ---------------------------------------------------------------------------
// DELETE /api/articles/:slug/favorite — Unfavorite article
// ---------------------------------------------------------------------------

app.delete(
  "/articles/:slug/favorite",
  route()
    .summary("Unfavorite an article")
    .tags("Favorites")
    .params(SlugParams)
    .response(200, ArticleResponse)
    .response(401, "Unauthorized")
    .response(404, "Not found")
    .onValidationError(onValidationError)
    .handle(async (c) => {
      const currentUserId = c.var.currentUserId!
      const { slug } = c.req.valid("param")

      const article = await Article.query().where("slug", "=", slug).first()
      if (!article) throw new HTTPException(404, { message: "Article not found" })

      const articleId = article.get<number>("id")

      await Favorite.query().where("userId", "=", currentUserId).where("articleId", "=", articleId).deleteMany()

      return c.json(await buildArticleResponse(article, currentUserId))
    }),
)

export default app
