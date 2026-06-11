import { type } from "arktype"
import { Hono } from "hono"
import { route } from "peta-docs/hono"
import type { ModelInstance } from "peta-orm"
import { Book, getDatabase } from "../../db/schema.js"
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
// Serialization helpers
// ---------------------------------------------------------------------------
function basicBookJSON(book: ModelInstance): Record<string, unknown> {
  return {
    id: book.get("id"),
    title: book.get("title"),
    isbn: book.get("isbn"),
    description: book.get("description"),
    publishedYear: book.get("publishedYear"),
    price: book.get("price"),
    authorId: book.get("authorId"),
    coverImage: book.get("coverImage"),
    inStock: book.get("inStock"),
    createdAt: book.get("createdAt"),
    updatedAt: book.get("updatedAt"),
  }
}

function safeJSON(model: ModelInstance): Record<string, unknown> {
  try {
    return model.$toJSON()
  } catch {
    const result: Record<string, unknown> = {}
    for (const key of [
      "id",
      "name",
      "title",
      "bio",
      "description",
      "isbn",
      "price",
      "authorId",
      "coverImage",
      "inStock",
      "rating",
      "body",
      "bookId",
      "userId",
      "publishedYear",
      "createdAt",
      "updatedAt",
      "email",
      "role",
      "deletedAt",
    ]) {
      const val = model.get(key)
      if (val !== undefined) result[key] = val
    }
    return result
  }
}

function serializeRelated(related: unknown): unknown {
  if (related == null) return related
  if (Array.isArray(related)) return related.map((r) => safeJSON(r as ModelInstance))
  return safeJSON(related as ModelInstance)
}

function serializeBook(book: ModelInstance, include?: string[]): Record<string, unknown> {
  const result = basicBookJSON(book)
  if (include) {
    for (const rel of include) {
      result[rel] = serializeRelated(book.$getRelation(rel))
    }
  }
  return result
}

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
    .filter("authorId", type("string"))
    .filter("inStock", type("string"))
    .filter("price", type("string"), { operators: ["gte", "lte"] })
    .sort(["title", "price", "publishedYear"])
    .include(["author", "categories"])
    .response(200, BookListResponse)
    .handle(async (c) => {
      const q = c.req.valid("query") as {
        page: number
        limit: number
        offset: number
        sort?: string[]
        include?: string[]
        authorId?: string
        inStock?: string
        price__gte?: string
        price__lte?: string
      }

      let query = Book.query()

      // Apply filters (HTTP query params are strings, parse as needed)
      if (q.authorId !== undefined) {
        const id = Number(q.authorId)
        if (!Number.isNaN(id)) query = query.where("authorId", "=", id)
      }
      if (q.inStock !== undefined) {
        if (q.inStock === "true" || q.inStock === "1") {
          query = query.where("inStock", "=", 1)
        } else if (q.inStock === "false" || q.inStock === "0") {
          query = query.where("inStock", "=", 0)
        }
      }
      if (q.price__gte !== undefined) {
        const val = Number(q.price__gte)
        if (!Number.isNaN(val)) query = query.where("price", ">=", val)
      }
      if (q.price__lte !== undefined) {
        const val = Number(q.price__lte)
        if (!Number.isNaN(val)) query = query.where("price", "<=", val)
      }

      // Apply sort
      if (q.sort && q.sort.length > 0) {
        for (const field of q.sort) {
          const dir = field.startsWith("-") ? "desc" : "asc"
          const col = field.replace(/^-/, "")
          query = query.orderBy(col, dir as "asc" | "desc")
        }
      } else {
        query = query.orderBy("title", "asc")
      }

      // Apply includes
      if (q.include) {
        for (const rel of q.include) {
          query = query.with(rel)
        }
      }

      // Paginate — use raw paginator properties instead of .toJSON()
      // to avoid Collection.toJSON() calling $toJSON() on each model
      // (which crashes when manyToMany relations are eagerly loaded)
      const paginator = await query.paginate(q.page, q.limit)
      const data = paginator.data.map((book) => serializeBook(book, q.include))

      return c.json({
        data,
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

      // Attach categories if provided (raw SQL for pivot table)
      if (body.categoryIds && body.categoryIds.length > 0) {
        const db = getDatabase()
        const insertPivot = db.prepare("INSERT INTO book_categories (bookId, categoryId) VALUES (?, ?)")
        const bookId = (book as ModelInstance).get<number>("id")
        for (const categoryId of body.categoryIds) {
          insertPivot.run(bookId, categoryId)
        }
      }

      return c.json(
        {
          id: book.get("id"),
          title: book.get("title"),
          isbn: book.get("isbn"),
          description: book.get("description"),
          publishedYear: book.get("publishedYear"),
          price: book.get("price"),
          authorId: book.get("authorId"),
          coverImage: book.get("coverImage"),
          inStock: book.get("inStock"),
          createdAt: book.get("createdAt"),
          updatedAt: book.get("updatedAt"),
        },
        201,
      )
    }),
)

export default app
