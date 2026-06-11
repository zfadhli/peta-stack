import { type } from "arktype"
import { Hono } from "hono"
import { route } from "peta-docs/hono"
import { Tag } from "../db/schema.js"
import { onValidationError } from "../middleware/error.js"

const app = new Hono()

// ---------------------------------------------------------------------------
// ArkType schemas
// ---------------------------------------------------------------------------

const TagsResponse = type({
  tags: "string[]",
})

// ---------------------------------------------------------------------------
// GET /api/tags — List all tags
// ---------------------------------------------------------------------------

app.get(
  "/tags",
  route()
    .summary("Get tags")
    .tags("Tags")
    .response(200, TagsResponse)
    .onValidationError(onValidationError)
    .handle(async (c) => {
      const tags = await Tag.query().select("name").execute()
      return c.json({ tags: tags.map((t) => t.get("name")) })
    }),
)

export default app
