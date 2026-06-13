import { type } from "arktype"
import { Hono } from "hono"
import { route } from "peta-docs/hono"
import type { ModelInstance } from "peta-orm"
import { Article, ArticleTag, Comment, Favorite, Follow, Tag, User } from "../db/schema.js"
import { uniqueSlug } from "../lib/slug.js"
import { getCurrentUserId, requireAuth } from "../middleware/auth.js"
import { onValidationError } from "../middleware/error.js"
import { http } from "../middleware/http-error.js"

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

const ListArticlesQuery = type({
  "tag?": "string",
  "author?": "string",
  "favorited?": "string",
  "limit?": "string",
  "offset?": "string",
})

const FeedArticlesQuery = type({
  "limit?": "string",
  "offset?": "string",
})

const ArticleParams = type({ slug: "string" })

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function findOrCreateTags(names: string[]): Promise<string[]> {
  // Deduplicate and clean input
  const cleaned = [...new Set(names.map((n) => n.trim()).filter(Boolean))]
  if (cleaned.length === 0) return []

  // 1. Bulk lookup — find all existing tags in one query
  const existing = await Tag.query().whereIn("name", cleaned).execute()
  const nameToId = new Map<string, string>()
  for (const tag of existing) {
    nameToId.set(tag.get<string>("name"), tag.get<string>("id"))
  }

  // 2. Bulk insert — only the tags that don't exist yet.
  const missing = cleaned.filter((n) => !nameToId.has(n))
  if (missing.length > 0) {
    const newTags = await Tag.insertMany(missing.map((name) => ({ name })))
    for (const tag of newTags) {
      nameToId.set(tag.get<string>("name"), tag.get<string>("id"))
    }
  }

  // 3. Return IDs in input order (after dedup)
  return cleaned.map((n) => nameToId.get(n)!)
}

async function getTagListForArticle(articleId: string): Promise<string[]> {
  const tags = await Tag.query()
    .select("name")
    .innerJoin("article_tags", "article_tags.tagId", "tags.id")
    .where("article_tags.articleId", "=", articleId)
    .execute()
  return tags.map((t) => t.get<string>("name"))
}

async function getFavoritesCount(articleId: string): Promise<number> {
  const result = await Favorite.query().where("articleId", "=", articleId).count()
  return result
}

async function isFavorited(articleId: string, userId?: string): Promise<boolean> {
  if (!userId) return false
  const fav = await Favorite.query().where("userId", "=", userId).where("articleId", "=", articleId).first()
  return !!fav
}

async function isFollowing(authorId: string, currentUserId?: string): Promise<boolean> {
  if (!currentUserId) return false
  const follow = await Follow.query().where("followerId", "=", currentUserId).where("followeeId", "=", authorId).first()
  return !!follow
}

async function getAuthorProfile(authorId: string, currentUserId?: string) {
  const author = await User.find(authorId)
  if (!author) throw http.notFound("Author not found")
  return {
    username: author.get<string>("username"),
    bio: author.get<string | null>("bio"),
    image: author.get<string | null>("image"),
    following: await isFollowing(authorId, currentUserId),
  }
}

async function buildArticleResponse(article: ModelInstance, currentUserId?: string, includeBody = true) {
  const articleId = article.get<string>("id")
  const tagList = await getTagListForArticle(articleId)
  const authorProfile = await getAuthorProfile(article.get<string>("authorId"), currentUserId)
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

async function buildMultipleArticlesResponse(articles: ModelInstance[], totalCount: number, currentUserId?: string) {
  const items = await Promise.all(articles.map((a) => buildArticleResponse(a, currentUserId, false)))
  return { articles: items, articlesCount: totalCount }
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
    .query(ListArticlesQuery)
    .onValidationError(onValidationError)
    .handle(async (c) => {
      const qTag = c.req.query("tag")
      const qAuthor = c.req.query("author")
      const qFavorited = c.req.query("favorited")
      const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") ?? "20")))
      const offset = Math.max(0, Number(c.req.query("offset") ?? "0"))

      // Build a list of matching article IDs using separate (non-join) queries
      let articleIds: string[] | null = null

      // Filter by tag: find article IDs via article_tags + tags join
      if (qTag) {
        const tagged = await ArticleTag.query()
          .innerJoin("tags", "tags.id", "article_tags.tagId")
          .where("tags.name", "=", qTag)
          .execute()
        articleIds = tagged.map((t) => t.get<string>("articleId"))
      }

      // Filter by author username
      if (qAuthor) {
        const author = await User.query().where("username", "=", qAuthor).first()
        if (!author) {
          return c.json({ articles: [], articlesCount: 0 })
        }
        const authorId = author.get<string>("id")
        const ids = (await Article.query().where("authorId", "=", authorId).execute()).map((a) => a.get<string>("id"))
        if (articleIds !== null) {
          articleIds = articleIds.filter((id) => ids.includes(id))
        } else {
          articleIds = ids
        }
      }

      // Filter by favorited by user
      if (qFavorited) {
        const favUser = await User.query().where("username", "=", qFavorited).first()
        if (!favUser) {
          return c.json({ articles: [], articlesCount: 0 })
        }
        const favArticleIds = (await Favorite.query().where("userId", "=", favUser.get<string>("id")).execute()).map(
          (f) => f.get<string>("articleId"),
        )
        if (articleIds !== null) {
          articleIds = articleIds.filter((id) => favArticleIds.includes(id))
        } else {
          articleIds = favArticleIds
        }
      }

      // Apply ID filter to the article query
      const dataQuery = Article.query()
      const countQuery = Article.query()

      if (articleIds !== null) {
        if (articleIds.length === 0) {
          return c.json({ articles: [], articlesCount: 0 })
        }
        dataQuery.whereIn("articles.id", articleIds)
        countQuery.whereIn("articles.id", articleIds)
      }

      // Count total matching articles (before limit/offset)
      const totalCount = (await countQuery.count()) as number

      // Fetch data with ordering and pagination
      const articles = await dataQuery.orderBy("articles.createdAt", "desc").limit(limit).offset(offset).execute()

      const currentUserId = getCurrentUserId(c)

      return c.json(await buildMultipleArticlesResponse(articles, totalCount, currentUserId))
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
    .query(FeedArticlesQuery)
    .onValidationError(onValidationError)
    .handle(async (c) => {
      const currentUserId = c.var.currentUserId!
      const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") ?? "20")))
      const offset = Math.max(0, Number(c.req.query("offset") ?? "0"))

      // Get IDs of followed users
      const follows = await Follow.query().where("followerId", "=", currentUserId).execute()
      const followeeIds = follows.map((f) => f.get<string>("followeeId"))

      if (followeeIds.length === 0) {
        return c.json({ articles: [], articlesCount: 0 })
      }

      const dataQuery = Article.query().whereIn("authorId", followeeIds)
      const totalCount = await dataQuery.count()
      const articles = await dataQuery.orderBy("createdAt", "desc").limit(limit).offset(offset).execute()

      return c.json(await buildMultipleArticlesResponse(articles, totalCount, currentUserId))
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
      if (!article) throw http.notFound("article: not found")

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

      const articleId = article.get<string>("id")

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
      if (!article) throw http.notFound("article: not found")

      // Only author can update
      if (article.get<string>("authorId") !== currentUserId) {
        throw http.forbidden("article: forbidden")
      }

      const updates: Record<string, unknown> = {}
      const articleId = article.get<string>("id")

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
      if (!updated) throw http.notFound("article: not found")
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
      if (!article) throw http.notFound("article: not found")

      // Only author can delete
      if (article.get<string>("authorId") !== currentUserId) {
        throw http.forbidden("article: forbidden")
      }

      const articleId = article.get<string>("id")

      // Clean up related records
      await ArticleTag.query().where("articleId", "=", articleId).deleteMany()
      await Favorite.query().where("articleId", "=", articleId).deleteMany()
      await Comment.query().where("articleId", "=", articleId).deleteMany()
      await Article.delete(articleId)

      return c.body(null, 204)
    }),
)

export default app
