import { Hono } from "hono"
import { route } from "../../../../../../src/hono/index.ts"
import { pets } from "../../index.ts"

const app = new Hono()

app.get(
  "/",
  route()
    .summary("List comments for a pet")
    .response(200, {
      description: "A list of comments",
      content: {
        "application/json": {
          schema: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "number" },
                text: { type: "string" },
                petId: { type: "number" },
              },
            },
          },
        },
      },
    })
    .handle((c) => {
      const pet = pets.find((p) => p.id === Number(c.req.param("id")))
      if (!pet) return c.json({ error: "not found" }, 404)
      return c.json([{ id: 1, text: "Great pet!", petId: pet.id }])
    }),
)

export default app
