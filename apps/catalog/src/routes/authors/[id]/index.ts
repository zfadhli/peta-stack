import { type } from "arktype"
import { Hono } from "hono"
import { route } from "peta-docs/hono"
import type { ModelInstance } from "peta-orm"
import { Author } from "../../../db/schema.js"
import { pick } from "../../../helpers.js"

const app = new Hono()

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------
const BookSummary = type({
  id: "number",
  title: "string",
  isbn: "string",
  price: "number",
  publishedYear: "number?",
  inStock: "boolean",
})

const AuthorDetailResponse = type({
  id: "number",
  name: "string",
  bio: "string?",
  books: BookSummary.array(),
})

// ---------------------------------------------------------------------------
// GET /authors/:id — Get author details with their books
// ---------------------------------------------------------------------------
app.get(
  "/",
  route()
    .summary("Get an author by ID with their books")
    .tags("authors")
    .params(type({ id: "string" }))
    .response(200, AuthorDetailResponse)
    .response(404, "Not found")
    .handle(async (c) => {
      const rawId = c.req.param("id")!

      const author = await (Author.query().with("books").where("id", "=", Number(rawId)).execute() as Promise<any>)
      const model = author[0]
      if (!model) {
        return c.json({ error: "Not found" }, 404)
      }

      const books = (model.$getRelation("books") ?? []) as ModelInstance[]
      const bookData = books.map((b) =>
        pick(b.$toJSON(), "id", "title", "isbn", "price", "publishedYear", "inStock"),
      )

      return c.json({
        ...pick(model.$toJSON(), "id", "name", "bio"),
        books: bookData,
      })
    }),
)

export default app
