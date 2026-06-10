import { type } from "arktype"
import { Hono } from "hono"
import { route } from "../../../../src/hono/index.ts"
import { CreatePet, Pet, UpdatePet } from "./schema.ts"

export let nextId = 4
export const pets: Array<{ id: number; name: string; species: string }> = [
  { id: 1, name: "Fido", species: "dog" },
  { id: 2, name: "Whiskers", species: "cat" },
  { id: 3, name: "Tweety", species: "bird" },
]

const app = new Hono()

app.get(
  "/",
  route()
    .summary("List all pets")
    .filter("species", type("'cat'|'dog'|'bird' | undefined"))
    .sort(["name"])
    .paginated({ maxLimit: 50, defaultLimit: 10 })
    .response(200, {
      description: "A list of pets",
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
    .handle((c) => {
      const q = c.req.valid("query")
      let filtered = [...pets]
      if (q.species) filtered = filtered.filter((p) => p.species === q.species)
      return c.json(filtered.slice(q.offset, q.offset + q.limit))
    }),
)

app.post(
  "/",
  route()
    .summary("Create a pet")
    .requestBody(CreatePet)
    .response(201, Pet)
    .response(400, "Invalid input")
    .handle((c) => {
      const body = c.req.valid("json")
      const pet = { id: nextId++, name: body.name, species: body.species }
      pets.push(pet)
      return c.json(pet, 201)
    }),
)

app.get(
  "/:id",
  route()
    .summary("Get a pet by ID")
    .params(type({ id: "string" }))
    .response(200, Pet)
    .response(404, "Not found")
    .handle((c) => {
      const pet = pets.find((p) => p.id === Number(c.req.param("id")))
      return pet ? c.json(pet) : c.json({ error: "not found" }, 404)
    }),
)

app.patch(
  "/:id",
  route()
    .summary("Update a pet")
    .params(type({ id: "string" }))
    .requestBody(UpdatePet)
    .response(200, Pet)
    .response(404, "Not found")
    .handle((c) => {
      const pet = pets.find((p) => p.id === Number(c.req.param("id")))
      if (!pet) return c.json({ error: "not found" }, 404)
      const body = c.req.valid("json")
      if (body?.name) pet.name = body.name
      if (body?.species) pet.species = body.species
      return c.json(pet)
    }),
)

app.delete(
  "/:id",
  route()
    .summary("Delete a pet")
    .params(type({ id: "string" }))
    .response(204, "Deleted")
    .response(404, "Not found")
    .handle((c) => {
      const idx = pets.findIndex((p) => p.id === Number(c.req.param("id")))
      if (idx === -1) return c.json({ error: "not found" }, 404)
      pets.splice(idx, 1)
      return c.newResponse(null, 204)
    }),
)

export default app
