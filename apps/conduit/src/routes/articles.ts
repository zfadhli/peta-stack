import { type } from "arktype"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { route } from "peta-docs/hono"
import type { ModelInstance } from "peta-orm"
import { Article, ArticleTag, Comment, Favorite, Follow, Tag, User } from "../db/schema.js"
import { uniqueSlug } from "../lib/slug.js"
import { getCurrentUserId, requireAuth } from "../middleware/auth.js"
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

const ArticleListItemSchema = type({
  slug: "string",
  title: "string",
  description: "string",
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
})

const MultipleArticlesSchema = type({
  articles: ArticleListItemSchema.array(),
  articlesCount: "number",
})

const CreateArticleBody = type({
  article: {
    title: "string>0",
    description: "string>0",
    body: "string>0",
    "tagList?": "string[]",
  },
})

const UpdateArticleBody = type({
  article: {
    "title?": "string>0",
    "description?": "string>0",
    "body?": "string>0",
    "tagList?": "string[]",
  },
})

const ArticleParams = type({ slug: "string" })

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function findOrCreateTags(names: string[]): Promise<number[]> {
  const ids: number[] = []
  for (const name of names) {
    const trimmed = name.trim()
    if (!trimmed) continue
    let tag = await Tag.query().where("name", "=", trimmed).first()
    if (!tag) {
      tag = await Tag.insert({ name: trimmed })
    }
    ids.push(tag.get<number>("id"))
  }
  return ids
}

async function getTagListForArticle(articleId: number): Promise<string[]> {
  const tags = await Tag.query()
    .select("name")
    .innerJoin("article_tags", "article_tags.tagId", "tags.id")
    .where("article_tags.articleId", "=", articleId)
    .execute()
  return tags.map((t) => t.get<string>("name"))
}

async function getFavoritesCount(articleId: number): Promise<number> {
  const result = await Favorite.query().where("articleId", "=", articleId).count()
  return result
}

async function isFavorited(articleId: number, userId?: number): Promise<boolean> {
  if (!userId) return false
  const fav = await Favorite.query().where("userId", "=", userId).where("articleId", "=", articleId).first()
  return !!fav
}

async function isFollowing(authorId: number, currentUserId?: number): Promise<boolean> {
  if (!currentUserId) return false
  const follow = await Follow.query().where("followerId", "=", currentUserId).where("followeeId", "=", authorId).first()
  return !!follow
}

async function getAuthorProfile(authorId: number, currentUserId?: number) {
  const author = await User.find(authorId)
  if (!author) throw new HTTPException(404, { message: "Author not found" })
  return {
    username: author.get<string>("username"),
    bio: author.get<string | null>("bio"),
    image: author.get<string | null>("image"),
    following: await isFollowing(authorId, currentUserId),
  }
}

async function buildArticleResponse(article: ModelInstance, currentUserId?: number, includeBody = true) {
  const articleId = article.get<number>("id")
  const tagList = await getTagListForArticle(articleId)
  const authorProfile = await getAuthorProfile(article.get<number>("authorId"), currentUserId)
  const faveCount = await getFavoritesCount(articleId)
  const favorited = await isFavorited(articleId, currentUserId)

  const result: Record<string, unknown> = {
    slug: article.get<string>("slug"),
    title: article.get<string>("title"),
    description: article.get<string>("description"),
    tagList,
    createdAt: article.get<string>("createdAt"),
    updatedAt: article.get<string>("updatedAt"),
    favorited,
    favoritesCount: faveCount,
    author: authorProfile,
  }

  if (includeBody) {
    result.body = article.get<string>("body")
  }

  return result
}

async function buildMultipleArticlesResponse(articles: ModelInstance[], currentUserId?: number) {
  const items = await Promise.all(articles.map((a) => buildArticleResponse(a, currentUserId, false)))
  return { articles: items, articlesCount: items.length }
}

// ---------------------------------------------------------------------------
// GET /api/articles — List articles
// ---------------------------------------------------------------------------

app.get(
  "/articles",
  route()
    .summary("Get recent articles globally")
    .tags("Articles")
    .response(200, MultipleArticlesSchema)
    .onValidationError(onValidationError)
    .handle(async (c) => {
      const query = Article.query()
      const qTag = c.req.query("tag")
      const qAuthor = c.req.query("author")
      const qFavorited = c.req.query("favorited")
      const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") ?? "20")))
      const offset = Math.max(0, Number(c.req.query("offset") ?? "0"))

      // Filter by tag
      if (qTag) {
        query.innerJoin("article_tags", "article_tags.articleId", "articles.id")
        query.innerJoin("tags", "tags.id", "article_tags.tagId")
        query.where("tags.name", "=", qTag)
      }

      // Filter by author username
      if (qAuthor) {
        query.innerJoin("users", "users.id", "articles.authorId")
        query.where("users.username", "=", qAuthor)
      }

      // Filter by favorited by user
      if (qFavorited) {
        query.innerJoin("favorites", "favorites.articleId", "articles.id")
        query.innerJoin("users as favUsers", "favUsers.id", "favorites.userId")
        query.where("favUsers.username", "=", qFavorited)
      }

      // Avoid column ambiguity — select only article columns
      query.selectAll("articles")
      query.orderBy("articles.createdAt", "desc")
      query.limit(limit)
      query.offset(offset)

      const articles = await query.execute()
      const currentUserId = getCurrentUserId(c)

      return c.json(await buildMultipleArticlesResponse(articles, currentUserId))
    }),
)

// ---------------------------------------------------------------------------
// GET /api/articles/feed — Feed articles from followed users
// ---------------------------------------------------------------------------

app.get(
  "/articles/feed",
  requireAuth(),
  route()
    .summary("Get recent articles from users you follow")
    .tags("Articles")
    .auth("Token")
    .response(200, MultipleArticlesSchema)
    .response(401, "Unauthorized")
    .onValidationError(onValidationError)
    .handle(async (c) => {
      const currentUserId = c.var.currentUserId!
      const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") ?? "20")))
      const offset = Math.max(0, Number(c.req.query("offset") ?? "0"))

      // Get IDs of followed users
      const follows = await Follow.query().where("followerId", "=", currentUserId).execute()
      const followeeIds = follows.map((f) => f.get<number>("followeeId"))

      if (followeeIds.length === 0) {
        return c.json({ articles: [], articlesCount: 0 })
      }

      const articles = await Article.query()
        .whereIn("authorId", followeeIds)
        .orderBy("createdAt", "desc")
        .limit(limit)
        .offset(offset)
        .execute()

      return c.json(await buildMultipleArticlesResponse(articles, currentUserId))
    }),
)

// ---------------------------------------------------------------------------
// GET /api/articles/:slug — Get single article
// ---------------------------------------------------------------------------

app.get(
  "/articles/:slug",
  route()
    .summary("Get an article")
    .tags("Articles")
    .params(ArticleParams)
    .response(200, ArticleResponse)
    .response(404, "Not found")
    .onValidationError(onValidationError)
    .handle(async (c) => {
      const { slug } = c.req.valid("param")
      const article = await Article.query().where("slug", "=", slug).first()
      if (!article) throw new HTTPException(404, { message: "Article not found" })

      const currentUserId = getCurrentUserId(c)
      return c.json({
        article: await buildArticleResponse(article, currentUserId, true),
      })
    }),
)

// ---------------------------------------------------------------------------
// POST /api/articles — Create article
// ---------------------------------------------------------------------------

app.post(
  "/articles",
  requireAuth(),
  route()
    .summary("Create an article")
    .tags("Articles")
    .auth("Token")
    .requestBody(CreateArticleBody)
    .response(201, ArticleResponse)
    .response(401, "Unauthorized")
    .response(422, "Validation error")
    .onValidationError(onValidationError)
    .handle(async (c) => {
      const currentUserId = c.var.currentUserId!
      const { article: body } = c.req.valid("json")

      const slug = await uniqueSlug(body.title, async (s) => {
        const existing = await Article.query().where("slug", "=", s).first()
        return !!existing
      })

      const article = await Article.insert({
        slug,
        title: body.title,
        description: body.description,
        body: body.body,
        authorId: currentUserId,
      })

      const articleId = article.get<number>("id")

      // Handle tags
      if (body.tagList?.length) {
        const tagIds = await findOrCreateTags(body.tagList)
        await ArticleTag.insertMany(tagIds.map((tagId) => ({ articleId, tagId })))
      }

      return c.json({ article: await buildArticleResponse(article, currentUserId, true) }, 201)
    }),
)

// ---------------------------------------------------------------------------
// PUT /api/articles/:slug — Update article
// ---------------------------------------------------------------------------

app.put(
  "/articles/:slug",
  requireAuth(),
  route()
    .summary("Update an article")
    .tags("Articles")
    .auth("Token")
    .params(ArticleParams)
    .requestBody(UpdateArticleBody)
    .response(200, ArticleResponse)
    .response(401, "Unauthorized")
    .response(403, "Forbidden")
    .response(404, "Not found")
    .response(422, "Validation error")
    .onValidationError(onValidationError)
    .handle(async (c) => {
      const currentUserId = c.var.currentUserId!
      const { slug } = c.req.valid("param")
      const { article: body } = c.req.valid("json")

      const article = await Article.query().where("slug", "=", slug).first()
      if (!article) throw new HTTPException(404, { message: "Article not found" })

      // Only author can update
      if (article.get<number>("authorId") !== currentUserId) {
        throw new HTTPException(403, { message: "Forbidden" })
      }

      const updates: Record<string, unknown> = {}
      const articleId = article.get<number>("id")

      if (body.title !== undefined) {
        updates.title = body.title
        updates.slug = await uniqueSlug(body.title, async (s) => {
          const existing = await Article.query().where("slug", "=", s).where("id", "!=", articleId).first()
          return !!existing
        })
      }
      if (body.description !== undefined) updates.description = body.description
      if (body.body !== undefined) updates.body = body.body

      if (Object.keys(updates).length > 0) {
        await Article.update(articleId, updates)
      }

      // Handle tag replacement
      if (body.tagList !== undefined) {
        // Remove existing tags
        await ArticleTag.query().where("articleId", "=", articleId).deleteMany()

        // Insert new tags
        if (body.tagList.length > 0) {
          const tagIds = await findOrCreateTags(body.tagList)
          await ArticleTag.insertMany(tagIds.map((tagId) => ({ articleId, tagId })))
        }
      }

      const updated = await Article.find(articleId)
      if (!updated) throw new HTTPException(404, { message: "Article not found" })
      return c.json({ article: await buildArticleResponse(updated, currentUserId, true) })
    }),
)

// ---------------------------------------------------------------------------
// DELETE /api/articles/:slug — Delete article
// ---------------------------------------------------------------------------

app.delete(
  "/articles/:slug",
  requireAuth(),
  route()
    .summary("Delete an article")
    .tags("Articles")
    .auth("Token")
    .params(ArticleParams)
    .response(204, "No content")
    .response(401, "Unauthorized")
    .response(403, "Forbidden")
    .response(404, "Not found")
    .onValidationError(onValidationError)
    .handle(async (c) => {
      const currentUserId = c.var.currentUserId!
      const { slug } = c.req.valid("param")

      const article = await Article.query().where("slug", "=", slug).first()
      if (!article) throw new HTTPException(404, { message: "Article not found" })

      // Only author can delete
      if (article.get<number>("authorId") !== currentUserId) {
        throw new HTTPException(403, { message: "Forbidden" })
      }

      const articleId = article.get<number>("id")

      // Clean up related records
      await ArticleTag.query().where("articleId", "=", articleId).deleteMany()
      await Favorite.query().where("articleId", "=", articleId).deleteMany()
      await Comment.query().where("articleId", "=", articleId).deleteMany()
      await Article.delete(articleId)

      return c.body(null, 204)
    }),
)

export default app
