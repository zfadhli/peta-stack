import { type } from "arktype"
import { Hono } from "hono"
import { route } from "peta-docs/hono"
import type { ModelInstance } from "peta-orm"
import { DatabaseError } from "peta-orm"
import { BookCategory, Category } from "../db/schema.js"
import { requireRole, requireSession } from "../middleware/auth.js"
import { http } from "../middleware/http-error.js"

const app = new Hono()

const CategoryResponse = type({ id: "string", name: "string", description: "string | null" })
const CreateCategoryBody = type({ name: "string>0", description: "string?" })
const UpdateCategoryBody = type({ name: "string>0?", description: "string?" })

app.get(
  "/",
  route()
    .summary("List all categories")
    .tags("categories")
    .response(200, CategoryResponse.array())
    .handle(async (c) => {
      const categories = await Category.query().orderBy("name", "asc").execute()
      return c.json(categories.map((cat: ModelInstance) => cat.$toJSON()))
    }),
)

app.post(
  "/",
  requireRole("admin"),
  route()
    .summary("Create a new category")
    .tags("categories")
    .requestBody(CreateCategoryBody)
    .response(201, CategoryResponse)
    .response(403, "Forbidden")
    .response(409, "Category already exists")
    .handle(async (c) => {
      const body = c.req.valid("json")

      const category = await Category.insert(
        { name: body.name, description: body.description ?? null },
      ).catch((err) => {
        if (err instanceof DatabaseError && err.code === "UNIQUE_CONSTRAINT") {
          throw http.conflict("This category name already exists")
        }
        throw err
      })

      return c.json(category.$toJSON() as Record<string, unknown>, 201)
    }),
)

// ---------------------------------------------------------------------------
// GET /categories/:id — Get a category by ID
// ---------------------------------------------------------------------------
app.get(
  "/:id",
  route()
    .summary("Get a category by ID")
    .tags("categories")
    .params(type({ id: "string" }))
    .response(200, CategoryResponse)
    .response(404, "Not found")
    .handle(async (c) => {
      const category = await Category.find(c.req.param("id")!)
      if (!category) throw http.notFound()
      return c.json(category.$toJSON())
    }),
)

// ---------------------------------------------------------------------------
// PATCH /categories/:id — Update a category
// ---------------------------------------------------------------------------
app.patch(
  "/:id",
  requireRole("admin"),
  route()
    .summary("Update a category")
    .tags("categories")
    .params(type({ id: "string" }))
    .requestBody(UpdateCategoryBody)
    .response(200, CategoryResponse)
    .response(404, "Not found")
    .response(403, "Forbidden")
    .handle(async (c) => {
      const rawId = c.req.param("id")!
      const body = c.req.valid("json")

      const category = await Category.find(rawId)
      if (!category) throw http.notFound()

      category.fill(body as Record<string, unknown>)
      await category.$save()
      return c.json(category.$toJSON() as Record<string, unknown>)
    }),
)

// ---------------------------------------------------------------------------
// DELETE /categories/:id — Delete a category
// ---------------------------------------------------------------------------
app.delete(
  "/:id",
  requireRole("admin"),
  route()
    .summary("Delete a category")
    .tags("categories")
    .params(type({ id: "string" }))
    .response(204, "Deleted")
    .response(404, "Not found")
    .response(403, "Forbidden")
    .response(409, "Has books")
    .handle(async (c) => {
      const rawId = c.req.param("id")!
      const category = await Category.find(rawId)
      if (!category) throw http.notFound()

      const pivotRows = await BookCategory.query().where("categoryId", "=", rawId).limit(1).execute()
      if (pivotRows.length > 0) throw http.conflict("Cannot delete category with associated books")

      await Category.delete(rawId)
      return c.body(null, 204)
    }),
)

export default app
