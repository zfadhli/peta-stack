import { type } from "arktype"
import { Hono } from "hono"
import { route } from "peta-docs/hono"
import type { ModelInstance } from "peta-orm"
import { Book, BookCategory } from "../db/schema.js"
import { pick } from "../helpers.js"
import { requireSession } from "../middleware/auth.js"
import { http } from "../middleware/http-error.js"

const app = new Hono()

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------
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

const BookListEntry = type({
  id: "number",
  title: "string",
  isbn: "string",
  price: "number",
  inStock: "boolean",
  authorId: "number",
})

const BookListResponse = type({
  data: BookListEntry.array(),
  total: "number",
  perPage: "number",
  currentPage: "number",
  lastPage: "number",
  hasMorePages: "boolean",
})

const Num = type("string").pipe((s: string, ctx) => {
  const n = Number(s)
  if (Number.isNaN(n)) return ctx.reject("must be a numeric string")
  return n
})
const Bool = type("'true'|'false'|'1'|'0'").pipe((s: string) => s === "true" || s === "1")

const CreateBookBody = type({
  title: "string>0",
  isbn: "string>=10&string<=13",
  description: "string?",
  publishedYear: "number?",
  price: "number>=0",
  authorId: "number",
  coverImage: "string?",
  inStock: "boolean",
  categoryIds: "number[]?",
})

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

// ---------------------------------------------------------------------------
// GET /books — List books
// ---------------------------------------------------------------------------
app.get(
  "/",
  route()
    .summary("List books")
    .description("Returns a paginated, filterable, sortable list of books")
    .tags("books")
    .paginated({ maxLimit: 100 })
    .filter("authorId", Num)
    .filter("inStock", Bool)
    .filter("price", Num, { operators: ["gte", "lte"] })
    .sort(["title", "price", "publishedYear"])
    .include(["author", "categories"])
    .response(200, BookListResponse)
    .handle(async (c) => {
      const { page, limit, sort, include, authorId, inStock, price__gte, price__lte } = c.req.valid("query") as {
        page: number
        limit: number
        authorId?: number
        inStock?: boolean
        price__gte?: number
        price__lte?: number
        sort?: string[]
        include?: string[]
      }
      const sorts = sort ?? []

      const paginator = await Book.query()
        .when(authorId !== undefined, (q) => q.where("authorId", "=", authorId!))
        .when(inStock !== undefined, (q) => q.where("inStock", "=", inStock ? 1 : 0))
        .when(price__gte !== undefined, (q) => q.where("price", ">=", price__gte!))
        .when(price__lte !== undefined, (q) => q.where("price", "<=", price__lte!))
        .when(sorts.length > 0, (q) => {
          for (const s of sorts) q.orderBy(s.replace(/^-/, ""), s.startsWith("-") ? "desc" : "asc")
          return q
        })
        .unless(sorts.length > 0, (q) => q.orderBy("title", "asc"))
        .when(include !== undefined && include.length > 0, (q) => {
          for (const rel of include!) q = q.with(rel)
          return q
        })
        .paginate(page, limit)

      return c.json({
        data: paginator.data.map((b) => pick(b.$toJSON(), "id", "title", "isbn", "price", "inStock", "authorId")),
        total: paginator.total,
        perPage: paginator.perPage,
        currentPage: paginator.currentPage,
        lastPage: paginator.lastPage,
        hasMorePages: paginator.hasMorePages,
      })
    }),
)

// ---------------------------------------------------------------------------
// POST /books — Create a book
// ---------------------------------------------------------------------------
app.post(
  "/",
  requireSession(),
  route()
    .summary("Create a new book")
    .tags("books")
    .requestBody(CreateBookBody)
    .response(201, BookDetailResponse)
    .response(400, "Invalid input")
    .response(401, "Unauthorized")
    .handle(async (c) => {
      const body = c.req.valid("json")
      const book = (await Book.insert({
        title: body.title,
        isbn: body.isbn,
        description: body.description ?? null,
        publishedYear: body.publishedYear ?? null,
        price: body.price,
        authorId: body.authorId,
        coverImage: body.coverImage ?? null,
        inStock: body.inStock,
      })) as any

      if (body.categoryIds?.length) {
        const bookId = (book as ModelInstance).get<number>("id")
        await BookCategory.insertMany(body.categoryIds.map((categoryId) => ({ bookId, categoryId })))
      }

      return c.json((book as ModelInstance).$toJSON(), 201)
    }),
)

// ---------------------------------------------------------------------------
// GET /books/:id — Get a book by ID
// ---------------------------------------------------------------------------
app.get(
  "/:id",
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

      let query = Book.query().where("id", "=", Number(rawId))
      if (q?.include) for (const rel of q.include) query = query.with(rel)

      const books = await (query.limit(1).execute() as Promise<any[]>)
      const book = books[0]
      if (!book) throw http.notFound()
      return c.json(book.$toJSON())
    }),
)

// ---------------------------------------------------------------------------
// PATCH /books/:id — Update a book
// ---------------------------------------------------------------------------
app.patch(
  "/:id",
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
      if (!book) throw http.notFound()

      const categoryIds = body.categoryIds as number[] | undefined
      const modelData: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(body)) {
        if (key !== "categoryIds") modelData[key] = value
      }

      book.fill(modelData)
      await book.$save()

      if (categoryIds !== undefined) {
        const bookId = (book as ModelInstance).get<number>("id")
        await BookCategory.query().where("bookId", "=", bookId).deleteMany()
        if (categoryIds.length > 0) {
          await BookCategory.insertMany(categoryIds.map((categoryId) => ({ bookId, categoryId })))
        }
      }

      return c.json(book.$toJSON())
    }),
)

// ---------------------------------------------------------------------------
// DELETE /books/:id — Soft-delete a book
// ---------------------------------------------------------------------------
app.delete(
  "/:id",
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
      if (!book) throw http.notFound()
      await book.$delete()
      return c.body(null, 204)
    }),
)

export default app
