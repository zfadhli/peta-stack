import { type } from "arktype"
import { Hono } from "hono"
import { route } from "peta-docs/hono"
import type { ModelInstance } from "peta-orm"
import { Author } from "../../db/schema.js"
import { requireSession } from "../books/middleware.js"

const app = new Hono()

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------
const AuthorResponse = type({
  id: "number",
  name: "string",
  bio: "string?",
})

const AuthorListResponse = type({
  data: AuthorResponse.array(),
  total: "number",
  perPage: "number",
  currentPage: "number",
  lastPage: "number",
  hasMorePages: "boolean",
})

const CreateAuthorBody = type({
  name: "string>0",
  bio: "string?",
})

// ---------------------------------------------------------------------------
// GET /authors — List authors (paginated)
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// POST /authors — Create an author (auth required)
// ---------------------------------------------------------------------------
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

      const author = await Author.insert({
        name: body.name,
        bio: body.bio ?? null,
      })

      return c.json(author.$toJSON() as Record<string, unknown>, 201)
    }),
)

export default app
