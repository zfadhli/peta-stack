import { type } from "arktype"
import { Hono } from "hono"
import { route } from "peta-docs/hono"
import type { ModelInstance } from "peta-orm"
import { Category } from "../db/schema.js"
import { requireSession } from "../middleware/auth.js"
import { http } from "../middleware/http-error.js"

const app = new Hono()

const CategoryResponse = type({ id: "number", name: "string", description: "string?" })
const CreateCategoryBody = type({ name: "string>0", description: "string?" })

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
  requireSession(),
  route()
    .summary("Create a new category")
    .tags("categories")
    .requestBody(CreateCategoryBody)
    .response(201, CategoryResponse)
    .response(401, "Unauthorized")
    .response(409, "Category already exists")
    .handle(async (c) => {
      const body = c.req.valid("json")
      const existing = await Category.query().where("name", "=", body.name).first()
      if (existing) throw http.conflict("Category already exists")

      const category = await Category.insert({ name: body.name, description: body.description ?? null })
      return c.json(category.$toJSON() as Record<string, unknown>, 201)
    }),
)

export default app
