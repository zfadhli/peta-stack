import { type } from "arktype"
import { Hono } from "hono"
import { route } from "peta-docs/hono"
import { Book, Review } from "../db/schema.js"
import { http } from "../middleware/http-error.js"

const app = new Hono()

const ReviewResponse = type({
  id: "number",
  bookId: "number",
  userId: "number",
  rating: "number",
  body: "string?",
  createdAt: "string",
})
const ReviewListResponse = type({
  data: ReviewResponse.array(),
  total: "number",
  perPage: "number",
  currentPage: "number",
  lastPage: "number",
  hasMorePages: "boolean",
})
const CreateReviewBody = type({ rating: "number>=1&number<=5", body: "string?" })

app.get(
  "/",
  route()
    .summary("List reviews for a book")
    .tags("reviews")
    .paginated({ maxLimit: 50 })
    .response(200, ReviewListResponse)
    .response(404, "Book not found")
    .handle(async (c) => {
      const bookId = Number(c.req.param("id"))
      const q = c.req.valid("query") as { page: number; limit: number; offset: number }

      const book = await Book.find(bookId)
      if (!book) throw http.notFound("Book not found")

      const paginator = await Review.query()
        .where("bookId", "=", bookId)
        .orderBy("createdAt", "desc")
        .paginate(q.page, q.limit)

      return c.json({
        data: paginator.data.map((r) => r.$toJSON()),
        total: paginator.total,
        perPage: paginator.perPage,
        currentPage: paginator.currentPage,
        lastPage: paginator.lastPage,
        hasMorePages: paginator.hasMorePages,
      })
    }),
)

app.post(
  "/",
  async (c, next) => {
    if (!c.var.session?.userId) throw http.unauthorized()
    await next()
  },
  route()
    .summary("Create a review for a book")
    .tags("reviews")
    .requestBody(CreateReviewBody)
    .response(201, ReviewResponse)
    .response(404, "Book not found")
    .response(401, "Unauthorized")
    .handle(async (c) => {
      const bookId = Number(c.req.param("id"))
      const body = c.req.valid("json")

      const book = await Book.find(bookId)
      if (!book) throw http.notFound("Book not found")

      const review = await Review.insert({
        bookId,
        userId: c.var.session.userId!,
        rating: body.rating,
        body: body.body ?? null,
        createdAt: new Date().toISOString(),
      })

      return c.json(review.$toJSON() as Record<string, unknown>, 201)
    }),
)

export default app
