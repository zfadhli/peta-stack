import { type } from "arktype"
import { Hono } from "hono"
import { route } from "peta-docs/hono"
import type { ModelInstance } from "peta-orm"
import { Author } from "../db/schema.js"
import { pick } from "../helpers.js"
import { requireSession } from "../middleware/auth.js"
import { http } from "../middleware/http-error.js"

const app = new Hono()

const AuthorResponse = type({ id: "number", name: "string", bio: "string?" })
const AuthorListResponse = type({
  data: AuthorResponse.array(),
  total: "number",
  perPage: "number",
  currentPage: "number",
  lastPage: "number",
  hasMorePages: "boolean",
})
const CreateAuthorBody = type({ name: "string>0", bio: "string?" })

const BookSummary = type({
  id: "number",
  title: "string",
  isbn: "string",
  price: "number",
  publishedYear: "number?",
  inStock: "boolean",
})
const AuthorDetailResponse = type({ id: "number", name: "string", bio: "string?", books: BookSummary.array() })

app.get(
  "/",
  route()
    .summary("List authors")
    .tags("authors")
    .paginated({ maxLimit: 50 })
    .response(200, AuthorListResponse)
    .handle(async (c) => {
      const q = c.req.valid("query") as { page: number; limit: number; offset: number }
      const paginator = await Author.query().orderBy("name", "asc").paginate(q.page, q.limit)
      const json = paginator.toJSON()
      return c.json({
        data: paginator.data.map((a: ModelInstance) => a.$toJSON()),
        total: json.total,
        perPage: json.perPage,
        currentPage: json.currentPage,
        lastPage: json.lastPage,
        hasMorePages: json.hasMorePages,
      })
    }),
)

app.post(
  "/",
  requireSession(),
  route()
    .summary("Create a new author")
    .tags("authors")
    .requestBody(CreateAuthorBody)
    .response(201, AuthorResponse)
    .response(401, "Unauthorized")
    .handle(async (c) => {
      const body = c.req.valid("json")
      const author = await Author.insert({ name: body.name, bio: body.bio ?? null })
      return c.json(author.$toJSON() as Record<string, unknown>, 201)
    }),
)

// ---------------------------------------------------------------------------
// GET /authors/:id — Get an author by ID with their books
// ---------------------------------------------------------------------------
app.get(
  "/:id",
  route()
    .summary("Get an author by ID with their books")
    .tags("authors")
    .params(type({ id: "string" }))
    .response(200, AuthorDetailResponse)
    .response(404, "Not found")
    .handle(async (c) => {
      const rawId = c.req.param("id")!
      const author = await Author.query().with("books").where("id", "=", Number(rawId)).execute()
      const model = author[0]
      if (!model) throw http.notFound()

      const books = (model.$getRelation("books") ?? []) as ModelInstance[]
      const bookData = books.map((b) => pick(b.$toJSON(), "id", "title", "isbn", "price", "publishedYear", "inStock"))

      return c.json({ ...pick(model.$toJSON(), "id", "name", "bio"), books: bookData })
    }),
)

export default app
