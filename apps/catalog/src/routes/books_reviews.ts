import { type } from "arktype"
import { Hono } from "hono"
import { route } from "peta-docs/hono"
import { Book, Review } from "../db/schema.js"
import { requireSession } from "../middleware/auth.js"
import { http } from "../middleware/http-error.js"

const app = new Hono()

const ReviewResponse = type({
  id: "string",
  bookId: "string",
  userId: "string",
  rating: "number",
  body: "string | null",
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
const UpdateReviewBody = type({ rating: "number>=1&number<=5?", body: "string?" })

app.get(
  "/",
  route()
    .summary("List reviews for a book")
    .tags("reviews")
    .paginated({ maxLimit: 50 })
    .response(200, ReviewListResponse)
    .response(404, "Book not found")
    .handle(async (c) => {
      const bookId = c.req.param("id")!
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
  requireSession(),
  route()
    .summary("Create a review for a book")
    .tags("reviews")
    .requestBody(CreateReviewBody)
    .response(201, ReviewResponse)
    .response(404, "Book not found")
    .response(401, "Unauthorized")
    .handle(async (c) => {
      const bookId = c.req.param("id")!
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

      return c.json(review.$toJSON(), 201)
    }),
)

// ---------------------------------------------------------------------------
// GET /books/:id/reviews/:reviewId — Get a review by ID
// ---------------------------------------------------------------------------
app.get(
  "/:reviewId",
  route()
    .summary("Get a review by ID")
    .tags("reviews")
    .params(type({ reviewId: "string" }))
    .response(200, ReviewResponse)
    .response(404, "Not found")
    .handle(async (c) => {
      const bookId = c.req.param("id")!
      const reviewId = c.req.param("reviewId")!
      const review = await Review.query().where("id", "=", reviewId).where("bookId", "=", bookId).limit(1).execute()
      if (!review[0]) throw http.notFound()
      return c.json(review[0].$toJSON())
    }),
)

// ---------------------------------------------------------------------------
// PATCH /books/:id/reviews/:reviewId — Update a review
// ---------------------------------------------------------------------------
app.patch(
  "/:reviewId",
  requireSession(),
  route()
    .summary("Update a review")
    .tags("reviews")
    .params(type({ reviewId: "string" }))
    .requestBody(UpdateReviewBody)
    .response(200, ReviewResponse)
    .response(404, "Not found")
    .response(401, "Unauthorized")
    .response(403, "Forbidden")
    .handle(async (c) => {
      const bookId = c.req.param("id")!
      const reviewId = c.req.param("reviewId")!
      const review = await Review.query().where("id", "=", reviewId).where("bookId", "=", bookId).limit(1).execute()
      if (!review[0]) throw http.notFound()
      if (review[0].get("userId") !== c.var.session.userId) throw http.forbidden()

      const body = c.req.valid("json")
      review[0].fill(body as Record<string, unknown>)
      await review[0].$save()
      return c.json(review[0].$toJSON())
    }),
)

// ---------------------------------------------------------------------------
// DELETE /books/:id/reviews/:reviewId — Delete a review
// ---------------------------------------------------------------------------
app.delete(
  "/:reviewId",
  requireSession(),
  route()
    .summary("Delete a review")
    .tags("reviews")
    .params(type({ reviewId: "string" }))
    .response(204, "Deleted")
    .response(404, "Not found")
    .response(401, "Unauthorized")
    .response(403, "Forbidden")
    .handle(async (c) => {
      const bookId = c.req.param("id")!
      const reviewId = c.req.param("reviewId")!
      const review = await Review.query().where("id", "=", reviewId).where("bookId", "=", bookId).limit(1).execute()
      if (!review[0]) throw http.notFound()
      if (review[0].get("userId") !== c.var.session.userId) throw http.forbidden()

      await review[0].$delete()
      return c.body(null, 204)
    }),
)

export default app
