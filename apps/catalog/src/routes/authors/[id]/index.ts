import { type } from "arktype"
import { Hono } from "hono"
import { route } from "peta-docs/hono"
import { Author } from "../../../db/schema.js"

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

      const author = await (Author.query().with("books").where("id", "=", Number(rawId)).first() as Promise<any>)

      if (!author) {
        return c.json({ error: "Not found" }, 404)
      }

      const related = author.$getRelation("books")
      const books = Array.isArray(related) ? related : []

      const bookData = books.map((b) => {
        const json = b.$toJSON()
        return {
          id: json.id as number,
          title: json.title as string,
          isbn: json.isbn as string,
          price: json.price as number,
          publishedYear: json.publishedYear as number | undefined,
          inStock: json.inStock as boolean,
        }
      })

      return c.json({
        id: author.get("id"),
        name: author.get("name"),
        bio: author.get("bio"),
        books: bookData,
      })
    }),
)

export default app
