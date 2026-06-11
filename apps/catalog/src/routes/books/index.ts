import { type } from "arktype"
import { Hono } from "hono"
import { route } from "peta-docs/hono"
import type { ModelInstance } from "peta-orm"
import { Book, BookCategory } from "../../db/schema.js"
import { requireSession } from "./middleware.js"

const app = new Hono()

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------
const BookResponse = type({
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

const BookListResponse = type({
  data: BookResponse.array(),
  total: "number",
  perPage: "number",
  currentPage: "number",
  lastPage: "number",
  hasMorePages: "boolean",
})

// Pipe schemas — coerce query string params to typed values
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

// ---------------------------------------------------------------------------
// GET /books — List books (paginated, filterable, sortable)
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
      const { page, limit, sort, include, authorId, inStock, price__gte, price__lte } =
        c.req.valid("query") as {
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
        data: paginator.data.map((b) => b.$toJSON()),
        total: paginator.total,
        perPage: paginator.perPage,
        currentPage: paginator.currentPage,
        lastPage: paginator.lastPage,
        hasMorePages: paginator.hasMorePages,
      })
    }),
)

// ---------------------------------------------------------------------------
// POST /books — Create a book (auth required)
// ---------------------------------------------------------------------------
app.post(
  "/",
  requireSession(),
  route()
    .summary("Create a new book")
    .tags("books")
    .requestBody(CreateBookBody)
    .response(201, BookResponse)
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

      // Attach categories if provided
      if (body.categoryIds && body.categoryIds.length > 0) {
        const bookId = (book as ModelInstance).get<number>("id")
        await BookCategory.insertMany(body.categoryIds.map((categoryId) => ({ bookId, categoryId })))
      }

      return c.json((book as ModelInstance).$toJSON(), 201)
    }),
)

export default app
