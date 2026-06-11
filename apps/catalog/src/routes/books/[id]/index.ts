import { type } from "arktype"
import { Hono } from "hono"
import { route } from "peta-docs/hono"
import type { ModelInstance } from "peta-orm"
import { Book, getDatabase } from "../../../db/schema.js"
import { requireSession } from "../middleware.js"

const app = new Hono()

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------
const UpdateBookBody = type({
  title: "string>0?",
  isbn: "string>=10&string<=13?",
  description: "string?",
  publishedYear: "number?",
  price: "number>=0?",
  authorId: "number?",
  coverImage: "string?",
  inStock: "boolean?",
  categoryIds: "number[]?",
})

const BookDetailResponse = type({
  id: "number",
  title: "string",
  isbn: "string",
  description: "string?",
  publishedYear: "number?",
  price: "number",
  authorId: "number",
  coverImage: "string?",
  inStock: "boolean",
  createdAt: "string?",
  updatedAt: "string?",
})

// ---------------------------------------------------------------------------
// Safe JSON serialization — avoids $toJSON() on related models when the
// eager-loaded relation instances may conflict with $toJSON's internal
// WeakMap-based state tracking (especially for manyToMany relations).
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// GET /books/:id — Get a book by ID
// ---------------------------------------------------------------------------
app.get(
  "/",
  route()
    .summary("Get a book by ID")
    .tags("books")
    .params(type({ id: "string" }))
    .include(["author", "categories", "reviews"])
    .response(200, BookDetailResponse)
    .response(404, "Not found")
    .handle(async (c) => {
      const rawId = c.req.param("id")!
      const q = c.req.valid("query") as { include?: string[] } | undefined
      const include = q?.include

      let query = Book.query().where("id", "=", Number(rawId))
      if (include) {
        for (const rel of include) query = query.with(rel)
      }

      const books = await (query.limit(1).execute() as Promise<any[]>)
      const book = books[0]
      if (!book) {
        return c.json({ error: "Not found" }, 404)
      }

      return c.json(book.$toJSON())
    }),
)

// ---------------------------------------------------------------------------
// PATCH /books/:id — Update a book (auth required)
// ---------------------------------------------------------------------------
app.patch(
  "/",
  requireSession(),
  route()
    .summary("Update a book")
    .tags("books")
    .params(type({ id: "string" }))
    .requestBody(UpdateBookBody)
    .response(200, BookDetailResponse)
    .response(404, "Not found")
    .response(401, "Unauthorized")
    .handle(async (c) => {
      const rawId = c.req.param("id")!
      const body = c.req.valid("json") as Record<string, unknown>

      const books = await (Book.query().where("id", "=", Number(rawId)).execute() as Promise<any[]>)
      const book = books[0]
      if (!book) {
        return c.json({ error: "Not found" }, 404)
      }

      const categoryIds = body.categoryIds as number[] | undefined
      const modelData: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(body)) {
        if (key !== "categoryIds") {
          modelData[key] = value
        }
      }

      book.fill(modelData)
      await book.$save()

      if (categoryIds !== undefined) {
        const db = getDatabase()
        const bookId = (book as ModelInstance).get<number>("id")
        db.run("DELETE FROM book_categories WHERE bookId = ?", [bookId])
        if (categoryIds.length > 0) {
          const insertPivot = db.prepare("INSERT INTO book_categories (bookId, categoryId) VALUES (?, ?)")
          for (const categoryId of categoryIds) {
            insertPivot.run(bookId, categoryId)
          }
        }
      }

      return c.json(book.$toJSON())
    }),
)

// ---------------------------------------------------------------------------
// DELETE /books/:id — Soft-delete a book (auth required)
// ---------------------------------------------------------------------------
app.delete(
  "/",
  requireSession(),
  route()
    .summary("Delete a book (soft-delete)")
    .tags("books")
    .params(type({ id: "string" }))
    .response(204, "Deleted")
    .response(404, "Not found")
    .response(401, "Unauthorized")
    .handle(async (c) => {
      const rawId = c.req.param("id")!

      const books = await (Book.query().where("id", "=", Number(rawId)).execute() as Promise<any[]>)
      const book = books[0]
      if (!book) {
        return c.json({ error: "Not found" }, 404)
      }

      await book.$delete()
      return c.body(null, 204)
    }),
)

export default app
