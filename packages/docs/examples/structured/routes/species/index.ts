import { Hono } from "hono"
import { route } from "../../../../src/hono/index.ts"
import { CreateSpecies, Species } from "./schema.ts"

const app = new Hono()

let nextId = 1
const species = [
  { id: nextId++, name: "dog" },
  { id: nextId++, name: "cat" },
  { id: nextId++, name: "bird" },
]

app.get(
  "/",
  route()
    .summary("List all species")
    .response(200, {
      description: "A list of species",
      content: {
        "application/json": {
          schema: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "number" },
                name: { type: "string" },
              },
            },
          },
        },
      },
    })
    .handle((c) => c.json(species)),
)

app.post(
  "/",
  route()
    .summary("Create a species")
    .requestBody(CreateSpecies)
    .response(201, Species)
    .response(400, "Invalid input")
    .handle((c) => {
      const body = c.req.valid("json")
      const entry = { id: nextId++, name: body.name }
      species.push(entry)
      return c.json(entry, 201)
    }),
)

export default app
